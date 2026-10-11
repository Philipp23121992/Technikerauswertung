import assert from "node:assert/strict";
import test from "node:test";
import {
  detectSections,
  extractErrorCodes,
  extractFrus,
  extractModels,
  overallConfidence,
  parseErrorBlocks,
  parsePartsFromTables,
  parsePartsFromText,
  parseRemovalBlocks,
  attachRemovals,
  mergeParts,
  sourceContains,
  partBezeichnung,
} from "./extract";
import type { ExtractedPage } from "./types";
import { AiManualSchema } from "./types";
import { buildLexmarkXlsx } from "./export-xlsx";
import { createEmptyLexmarkDb } from "./types";
import { listKetten } from "./relations";

function page(num: number, text: string, tables: string[][][] = []): ExtractedPage {
  return { page: num, text, charCount: text.length, needsOcr: text.length < 40, tables };
}

test("PDF/Fehlercode-Extraktion erkennt Lexmark-Codes und ignoriert Datum", () => {
  const text = "Erstellt 13.08.2026\n84.00 Network Error\n640.80 Scanner\n2.01 Cover";
  const codes = extractErrorCodes(text);
  assert.ok(codes.includes("84.00"));
  assert.ok(codes.includes("640.80"));
  assert.ok(codes.includes("2.01"));
  assert.ok(!codes.includes("13.08"));
  assert.ok(extractErrorCodes("Fehler 121,05 CX725").includes("121.05"));
});

test("FRU-Extraktion erkennt 41X und 56F-Formate", () => {
  const frus = extractFrus("Replace 41X1583 then 41X1866 or 56F0Z00 and 40X9135");
  assert.deepEqual(frus.sort(), ["40X9135", "41X1583", "41X1866", "56F0Z00"]);
});

test("Modellerkennung unterstützt mehrere Serien", () => {
  const models = extractModels("XC2335 XC2342 XC4352 C4352 MX532 MS531 XM3346");
  assert.ok(models.includes("XC2335"));
  assert.ok(models.includes("C4352"));
  assert.ok(models.includes("MX532"));
  assert.ok(models.includes("XM3346"));
});

test("Revisionszeilen werden nicht als Fehlercode gewertet", () => {
  const pages = [page(2, "75.12 Added the TPM card service check topic")];
  const errors = parseErrorBlocks(pages);
  assert.equal(errors.length, 0);
});

test("Abschnitte und Error-Blöcke mit Resolutions", () => {
  const pages = [
    page(
      12,
      `84.00 Network Error
Issue description
Controller timeout
Customer resolution
Power cycle
Remote resolution
Check cable
Initial parts replacement
41X1234 Controller Board
Detailed diagnostics
Ping test`,
    ),
  ];
  const sections = detectSections(pages);
  assert.ok(sections.some((item) => item.heading === "issue description"));
  const errors = parseErrorBlocks(pages);
  assert.equal(errors[0]?.code, "84.00");
  assert.ok(errors[0]?.frus.includes("41X1234"));
  assert.match(errors[0]?.customerResolution ?? "", /Power cycle/i);
});

test("Fehlerbeschreibung nimmt umbrochene Folgesätze mit", () => {
  const errors = parseErrorBlocks([
    page(
      20,
      `121.05 During an attempt to heat up, the
fuser did not reach the required temperature.
Issue description
The fuser failed to heat.
Customer resolution
Reseat the fuser.`,
    ),
  ]);
  assert.equal(errors[0]?.code, "121.05");
  assert.match(errors[0]?.description ?? "", /fuser did not reach/i);
});

test("Tabellenerkennung zieht FRU plus Bezeichnung", () => {
  const pages = [
    page(3, "Parts list", [[["41X0251", "Pick Roller", "Paper path"]]]),
  ];
  const parts = parsePartsFromTables(pages, ["XC4352"]);
  assert.equal(parts[0]?.fru, "41X0251");
  assert.match(parts[0]?.name ?? "", /Pick Roller/i);
});

test("Text-FRU ohne Tabelle", () => {
  const parts = parsePartsFromText([page(4, "41X1866 Fuser assembly")], ["MX532"]);
  assert.equal(parts[0]?.fru, "41X1866");
  assert.match(parts[0]?.name ?? "", /Fuser assembly/i);
});

test("Revisionshistorie wird nicht als Ersatzteil-Bezeichnung übernommen", () => {
  const parts = parsePartsFromText(
    [page(1, "Revision history\n41X0906 Added the PN (Screws pack) in the Miscellaneous assembly")],
    ["CX725"],
  );
  assert.equal(parts.length, 0);
});

test("Parts-Catalog-Zeile liefert FRU plus Bezeichnung", () => {
  const parts = parsePartsFromText(
    [page(12, "Parts catalog\n1 41X0251 Pick roller 1\n2 41X1866 Fuser assembly 1")],
    ["CX725"],
  );
  assert.equal(parts[0]?.fru, "41X0251");
  assert.match(parts[0]?.name ?? "", /Pick roller/i);
  assert.equal(parts[1]?.fru, "41X1866");
});

test("Fuser-Spannung bleibt in der Katalog-Bezeichnung", () => {
  const parts = parsePartsFromText(
    [
      page(
        12,
        "Parts catalog\n1 41X0251 1 1 CS72x fuser type 02, 100V\n1 41X0252 1 1 CS72x fuser type 00, 110-120V",
      ),
    ],
    ["CX725"],
  );
  const v100 = parts.find((part) => part.fru === "41X0251");
  const v120 = parts.find((part) => part.fru === "41X0252");
  assert.match(v100?.name ?? "", /100V/);
  assert.match(v120?.name ?? "", /110-120V/);
});

test("Spannung in der Folgezeile wird an die Bezeichnung gehängt", () => {
  const parts = parsePartsFromText(
    [page(12, "Parts catalog\n1 41X0253 CS72x fuser\ntype 01, 220-240V")],
    ["CX725"],
  );
  assert.equal(parts[0]?.fru, "41X0253");
  assert.match(parts[0]?.name ?? "", /220-240V/);
});

test("Bezeichnung übernimmt Spannung aus der Ausbau-Notiz", () => {
  assert.equal(
    partBezeichnung({
      fru: "41X0251",
      name: "CS72x fuser",
      description: "CS72x fuser",
      removal: "procedure Notes 1 41X0251 1 1 CS72x fuser type 02, 100V",
    }),
    "CS72x fuser, 100V",
  );
});

test("Catalog-Bezeichnung gewinnt gegen Changelog", () => {
  const merged = mergeParts([
    {
      fru: "41X0251",
      name: "Added the PN (Screws pack) in the Miscellaneous",
      description: "Added the PN (Screws pack) in the Miscellaneous",
      assembly: null,
      removal: null,
      page: 1,
      models: ["CX725"],
      confidence: 70,
    },
    {
      fru: "41X0251",
      name: "Pick roller",
      description: "Pick roller",
      assembly: "Paper feed",
      removal: null,
      page: 40,
      models: ["CX725"],
      confidence: 93,
    },
  ]);
  assert.equal(merged[0]?.name, "Pick roller");
});

test("Ausbauanleitung wird dem Ersatzteil zugeordnet", () => {
  const pages = [
    page(12, "Parts catalog\n1 41X0251 Pick roller 1"),
    page(
      80,
      `Pick roller removal
1. Remove the right cover.
2. Disconnect the sensor cable.
3. Lift the pick roller assembly from the frame.`,
    ),
  ];
  const parts = attachRemovals(parsePartsFromText(pages, ["CX725"]), parseRemovalBlocks(pages));
  assert.match(parts[0]?.name ?? "", /Pick roller/i);
  assert.match(parts[0]?.removal ?? "", /Remove the right cover/i);
});

test("Confidence unter 80 wenn OCR ohne Funde", () => {
  assert.ok(overallConfidence({ ocrNeeded: true, models: 0, errorCodes: 0, parts: 0, sections: 0 }) < 80);
});

test("Grounding: erfundene FRU nicht im Quelltext", () => {
  assert.equal(sourceContains("Use 41X1583", "99X9999"), false);
  assert.equal(sourceContains("Use 41X1583", "41X1583"), true);
});

test("Pydantic/Zod-Schema lehnt erfundene Strukturen nicht stillschweigend ab", () => {
  const parsed = AiManualSchema.safeParse({
    models: [{ model: "XC4352", series: "XC", machineType: null, modelNumber: "XC4352", page: 1 }],
    errorCodes: [{ code: "84.00", description: null, category: null, cause: null, customerResolution: null, remoteResolution: null, detailedDiagnostics: null, initialPartsReplacement: null, page: 2, frus: ["41X1234"] }],
    parts: [{ fru: "41X1234", name: "Board", description: null, assembly: null, removal: null, page: 2, models: ["XC4352"] }],
  });
  assert.equal(parsed.success, true);
});

test("Excel-Export erzeugt XLSX-Signatur", () => {
  const db = createEmptyLexmarkDb();
  db.manuals.push({
    id: "man-1",
    fileName: "XC4352.pdf",
    title: "XC4352",
    pageCount: 1,
    ocrNeeded: false,
    status: "AUTO_APPROVED",
    confidence: 90,
    source: "XC4352.pdf",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  });
  const { buffer, fileName } = buildLexmarkXlsx(db, "man-1");
  assert.equal(fileName, "XC4352.xlsx");
  assert.equal(buffer[0], 0x50);
  assert.equal(buffer[1], 0x4b);
});

test("Ketten listet gespeicherte Modell-Fehlercode-FRU", () => {
  const db = createEmptyLexmarkDb();
  db.error_part_relations.push({
    id: "r1",
    manualId: "man1",
    model: "CX725",
    errorCode: "84.00",
    fru: "41X1234",
    description: "Network Error",
    created_at: "",
    updated_at: "",
  });
  const rows = listKetten(db, "cx725", 50);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.fru, "41X1234");
});

test("Ketten Fallback gleiche Seite wenn keine gespeicherte Kette", () => {
  const db = createEmptyLexmarkDb();
  db.printer_models.push({
    id: "m1",
    manualId: "man1",
    model: "CX725",
    series: "CX",
    machineType: null,
    modelNumber: null,
    source: "x",
    page: 1,
    created_at: "",
    updated_at: "",
  });
  db.error_codes.push({
    id: "e1",
    manualId: "man1",
    code: "84.00",
    description: "Network Error",
    category: null,
    cause: null,
    customerResolution: null,
    remoteResolution: null,
    detailedDiagnostics: null,
    initialPartsReplacement: null,
    source: "x",
    page: 12,
    confidence: 88,
    status: "AUTO_APPROVED",
    created_at: "",
    updated_at: "",
  });
  db.replacement_parts.push({
    id: "p1",
    manualId: "man1",
    fru: "41X9999",
    name: "Board",
    description: "Controller",
    assembly: null,
    removal: null,
    source: "x",
    page: 12,
    confidence: 90,
    status: "AUTO_APPROVED",
    created_at: "",
    updated_at: "",
  });
  const rows = listKetten(db, "", 50);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.model, "CX725");
  assert.equal(rows[0]?.errorCode, "84.00");
  assert.equal(rows[0]?.fru, "41X9999");
});
