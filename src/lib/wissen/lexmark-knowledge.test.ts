import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyLexmarkDb } from "../lexmark/types";
import { buildLexmarkXlsx } from "../lexmark/export-xlsx";
import { answerFromLexmark } from "./lexmark-chat";
import { answerTechnicianChat, expandDiagnosticQuery, isModelOnlyQuery, listChatModels, withStickyContext } from "./technician-chat";
import { answerKnowledgeQuery } from "./chat";
import { upsertKnowledgeDoc } from "./ingest";
import { piecesFromLexmarkManual, piecesFromSpreadsheet } from "./lexmark-knowledge";
import { createEmptyKnowledgeDb } from "./types";
import { parseXlsxBuffer } from "./xlsx-text";

test("Lexmark-Manual wird zu Fehler- und FRU-Abschnitten", () => {
  const lexmark = createEmptyLexmarkDb();
  lexmark.manuals.push({
    id: "man1",
    fileName: "CX725.pdf",
    title: "CX725",
    pageCount: 10,
    ocrNeeded: false,
    status: "AUTO_APPROVED",
    confidence: 90,
    source: "CX725.pdf",
    created_at: "",
    updated_at: "",
  });
  lexmark.printer_models.push({
    id: "m1",
    manualId: "man1",
    model: "CX725",
    series: "CX",
    machineType: null,
    modelNumber: null,
    source: "CX725.pdf",
    page: 1,
    created_at: "",
    updated_at: "",
  });
  lexmark.error_codes.push({
    id: "e1",
    manualId: "man1",
    code: "42.60",
    description: "Toner waste bottle full",
    category: null,
    cause: null,
    customerResolution: "Replace the waste bottle",
    remoteResolution: null,
    detailedDiagnostics: null,
    initialPartsReplacement: null,
    source: "CX725.pdf",
    page: 12,
    confidence: 88,
    status: "AUTO_APPROVED",
    created_at: "",
    updated_at: "",
  });
  lexmark.replacement_parts.push({
    id: "p1",
    manualId: "man1",
    fru: "41X0906",
    name: "Waste bottle",
    description: "Toner waste bottle",
    assembly: null,
    removal: null,
    source: "CX725.pdf",
    page: 12,
    confidence: 90,
    status: "AUTO_APPROVED",
    created_at: "",
    updated_at: "",
  });
  lexmark.error_part_relations.push({
    id: "r1",
    manualId: "man1",
    model: "CX725",
    errorCode: "42.60",
    fru: "41X0906",
    description: "Toner waste bottle full",
    created_at: "",
    updated_at: "",
  });

  const pieces = piecesFromLexmarkManual(lexmark, "man1");
  assert.ok(pieces.some((piece) => piece.text.includes("42.60") && piece.text.includes("CX725")));
  assert.ok(pieces.some((piece) => /PN 41X0906/.test(piece.text)));

  const knowledge = createEmptyKnowledgeDb();
  upsertKnowledgeDoc(knowledge, {
    key: "lexmark:man1",
    title: "Lexmark CX725",
    mimeType: "text/plain",
    category: "manual",
    pieces,
  });
  const errorAnswer = answerKnowledgeQuery(knowledge, "Fehler 42.60 CX725");
  assert.match(errorAnswer.answer, /42\.60/);
  assert.match(errorAnswer.answer, /waste bottle/i);

  const partAnswer = answerKnowledgeQuery(knowledge, "PN 41X0906");
  assert.match(partAnswer.answer, /41X0906/);
});

test("Lexmark-Excel lässt sich als Wissensquelle lesen", () => {
  const lexmark = createEmptyLexmarkDb();
  lexmark.manuals.push({
    id: "man1",
    fileName: "CX725.pdf",
    title: "CX725",
    pageCount: 1,
    ocrNeeded: false,
    status: "AUTO_APPROVED",
    confidence: 90,
    source: "CX725.pdf",
    created_at: "",
    updated_at: "",
  });
  lexmark.error_codes.push({
    id: "e1",
    manualId: "man1",
    code: "42.60",
    description: "Toner waste bottle full",
    category: null,
    cause: null,
    customerResolution: "Replace",
    remoteResolution: "",
    detailedDiagnostics: null,
    initialPartsReplacement: null,
    source: "CX725.pdf",
    page: 1,
    confidence: 88,
    status: "AUTO_APPROVED",
    created_at: "",
    updated_at: "",
  });
  lexmark.replacement_parts.push({
    id: "p1",
    manualId: "man1",
    fru: "41X0906",
    name: "Waste bottle",
    description: "Toner waste bottle",
    assembly: null,
    removal: null,
    source: "CX725.pdf",
    page: 1,
    confidence: 90,
    status: "AUTO_APPROVED",
    created_at: "",
    updated_at: "",
  });
  const { buffer } = buildLexmarkXlsx(lexmark, "man1");
  const sheets = parseXlsxBuffer(buffer);
  assert.ok(sheets.some((sheet) => sheet.name === "Fehlercodes"));
  const pieces = piecesFromSpreadsheet(sheets, "CX725.xlsx");
  assert.ok(pieces.some((piece) => piece.text.includes("42.60")));
  assert.ok(pieces.some((piece) => piece.text.includes("41X0906")));
});

test("Chatbot antwortet aus Lexmark-Listen zu Fehlercode und FRU", () => {
  const lexmark = createEmptyLexmarkDb();
  lexmark.manuals.push({
    id: "man1",
    fileName: "CX725.pdf",
    title: "CX725",
    pageCount: 1,
    ocrNeeded: false,
    status: "AUTO_APPROVED",
    confidence: 90,
    source: "CX725.pdf",
    created_at: "",
    updated_at: "",
  });
  lexmark.printer_models.push({
    id: "m1",
    manualId: "man1",
    model: "CX725",
    series: "CX",
    machineType: null,
    modelNumber: null,
    source: "CX725.pdf",
    page: 1,
    created_at: "",
    updated_at: "",
  });
  lexmark.error_codes.push({
    id: "e1",
    manualId: "man1",
    code: "42.60",
    description: "Toner cartridge region mismatch",
    category: "Cartridge",
    cause: "Cartridge and printer regions do not match.",
    customerResolution: "Install a cartridge for this region.",
    remoteResolution: null,
    detailedDiagnostics: null,
    initialPartsReplacement: "41X0906",
    source: "CX725.pdf",
    page: 12,
    confidence: 88,
    status: "AUTO_APPROVED",
    created_at: "",
    updated_at: "",
  });
  lexmark.replacement_parts.push({
    id: "p1",
    manualId: "man1",
    fru: "41X0906",
    name: "Waste bottle",
    description: "Toner waste bottle",
    assembly: null,
    removal: null,
    source: "CX725.pdf",
    page: 12,
    confidence: 90,
    status: "AUTO_APPROVED",
    created_at: "",
    updated_at: "",
  });
  lexmark.error_part_relations.push({
    id: "r1",
    manualId: "man1",
    model: "CX725",
    errorCode: "42.60",
    fru: "41X0906",
    description: "Toner cartridge region mismatch",
    created_at: "",
    updated_at: "",
  });
  const error = answerFromLexmark(lexmark, "Fehler 42.60 CX725");
  assert.ok(error);
  assert.match(error.answer, /42\.60/);
  assert.match(error.answer, /region/i);
  assert.match(error.answer, /41X0906/);
  const part = answerFromLexmark(lexmark, "PN 41X0906");
  assert.ok(part);
  assert.match(part.answer, /41X0906/);
});

test("Chatbot findet Fuser-FRU per Bezeichnung und Modell", () => {
  const lexmark = createEmptyLexmarkDb();
  lexmark.manuals.push({
    id: "man1",
    fileName: "CX725.pdf",
    title: "CX725",
    pageCount: 1,
    ocrNeeded: false,
    status: "AUTO_APPROVED",
    confidence: 90,
    source: "CX725.pdf",
    created_at: "",
    updated_at: "",
  });
  lexmark.printer_models.push({
    id: "m1",
    manualId: "man1",
    model: "CX725",
    series: "CX",
    machineType: null,
    modelNumber: null,
    source: "CX725.pdf",
    page: 1,
    created_at: "",
    updated_at: "",
  });
  lexmark.error_codes.push({
    id: "e1",
    manualId: "man1",
    code: "100.38",
    description: "The fuser buckle sensor is disconnected",
    category: "Fuser",
    cause: "The fuser buckle sensor is disconnected.",
    customerResolution: "Check the fuser sensor cable.",
    remoteResolution: null,
    detailedDiagnostics: null,
    initialPartsReplacement: "41X1083",
    source: "CX725.pdf",
    page: 40,
    confidence: 88,
    status: "AUTO_APPROVED",
    created_at: "",
    updated_at: "",
  });
  lexmark.replacement_parts.push(
    {
      id: "p1",
      manualId: "man1",
      fru: "41X0251",
      name: "CS72x fuser",
      description: "CS72x fuser",
      assembly: null,
      removal: "procedure Notes 1 41X0251 1 1 CS72x fuser type 02, 100V",
      source: "CX725.pdf",
      page: 90,
      confidence: 90,
      status: "AUTO_APPROVED",
      created_at: "",
      updated_at: "",
    },
    {
      id: "p2",
      manualId: "man1",
      fru: "41X0252",
      name: "CS72x fuser",
      description: "CS72x fuser",
      assembly: null,
      removal: "on page 586 1 41X0252 1 1 CS72x fuser type 00, 110-120V",
      source: "CX725.pdf",
      page: 90,
      confidence: 90,
      status: "AUTO_APPROVED",
      created_at: "",
      updated_at: "",
    },
    {
      id: "p3",
      manualId: "man1",
      fru: "41X1083",
      name: "Sensor (fuser",
      description: "Sensor (fuser buckle)",
      assembly: null,
      removal: null,
      source: "CX725.pdf",
      page: 91,
      confidence: 90,
      status: "AUTO_APPROVED",
      created_at: "",
      updated_at: "",
    },
  );
  const byName = answerFromLexmark(lexmark, "Ersatzteilnummer Fuser cx725");
  assert.ok(byName);
  assert.match(byName.answer, /41X0251/);
  assert.match(byName.answer, /41X0252/);
  assert.match(byName.answer, /fuser/i);
  assert.match(byName.answer, /100V/);
  assert.match(byName.answer, /110-120V/);
  assert.doesNotMatch(byName.answer, /100\.38/);
  assert.doesNotMatch(byName.answer, /41X1083/);
  const short = answerFromLexmark(lexmark, "Fuser CX725");
  assert.ok(short);
  assert.match(short.answer, /41X0251/);
});

test("Diagnose-Chat merkt sich das Modell und bleibt ohne KI auf den Listen", async () => {
  assert.match(withStickyContext("Fuser", [{ role: "user", content: "CX725 Papierstau" }]), /CX725/i);
  assert.match(expandDiagnosticQuery("CX725 wird nicht warm"), /fuser/i);

  const lexmark = createEmptyLexmarkDb();
  lexmark.manuals.push({
    id: "man1",
    fileName: "CX725.pdf",
    title: "CX725",
    pageCount: 1,
    ocrNeeded: false,
    status: "AUTO_APPROVED",
    confidence: 90,
    source: "CX725.pdf",
    created_at: "",
    updated_at: "",
  });
  lexmark.printer_models.push({
    id: "m1",
    manualId: "man1",
    model: "CX725",
    series: "CX",
    machineType: null,
    modelNumber: null,
    source: "CX725.pdf",
    page: 1,
    created_at: "",
    updated_at: "",
  });
  lexmark.replacement_parts.push({
    id: "p1",
    manualId: "man1",
    fru: "41X0251",
    name: "CS72x fuser",
    description: "CS72x fuser",
    assembly: null,
    removal: "1 41X0251 CS72x fuser type 02, 100V",
    source: "CX725.pdf",
    page: 90,
    confidence: 90,
    status: "AUTO_APPROVED",
    created_at: "",
    updated_at: "",
  });
  const result = await answerTechnicianChat({
    lexmark,
    tickets: [],
    knowledge: createEmptyKnowledgeDb(),
    messages: [{ role: "user", content: "Ersatzteilnummer Fuser cx725" }],
    useAi: false,
  });
  assert.match(result.answer, /41X0251/);
  assert.match(result.answer, /100V/);
});

test("Chatbot fragt zuerst nach dem Modell und merkt es sich", async () => {
  assert.equal(isModelOnlyQuery("CX725"), true);
  assert.equal(isModelOnlyQuery("Modell CX725 bitte"), true);
  assert.equal(isModelOnlyQuery("CX725 wird nicht warm"), false);

  const lexmark = createEmptyLexmarkDb();
  lexmark.manuals.push({
    id: "man1",
    fileName: "CX725.pdf",
    title: "CX725",
    pageCount: 1,
    ocrNeeded: false,
    status: "AUTO_APPROVED",
    confidence: 90,
    source: "CX725.pdf",
    created_at: "",
    updated_at: "",
  });
  lexmark.printer_models.push(
    {
      id: "m1",
      manualId: "man1",
      model: "CX725",
      series: "CX",
      machineType: null,
      modelNumber: null,
      source: "CX725.pdf",
      page: 1,
      created_at: "",
      updated_at: "",
    },
    {
      id: "m2",
      manualId: "man1",
      model: "CX725DE",
      series: "CX",
      machineType: null,
      modelNumber: null,
      source: "CX725.pdf",
      page: 1,
      created_at: "",
      updated_at: "",
    },
  );
  lexmark.error_codes.push({
    id: "e1",
    manualId: "man1",
    code: "121.05",
    description: "During an attempt to heat up, the",
    category: "fuser",
    cause: null,
    customerResolution: null,
    remoteResolution: null,
    detailedDiagnostics: null,
    initialPartsReplacement: null,
    source: "CX725.pdf",
    page: 40,
    confidence: 70,
    status: "AUTO_APPROVED",
    created_at: "",
    updated_at: "",
  });
  lexmark.replacement_parts.push({
    id: "p1",
    manualId: "man1",
    fru: "41X0251",
    name: "CS72x fuser",
    description: "CS72x fuser type 02, 100V",
    assembly: null,
    removal: "1 41X0251 CS72x fuser type 02, 100V",
    source: "CX725.pdf",
    page: 90,
    confidence: 90,
    status: "AUTO_APPROVED",
    created_at: "",
    updated_at: "",
  });

  assert.deepEqual(listChatModels(lexmark), ["CX725"]);

  const asked = await answerTechnicianChat({
    lexmark,
    tickets: [],
    knowledge: createEmptyKnowledgeDb(),
    messages: [{ role: "user", content: "wird nicht warm" }],
    useAi: false,
  });
  assert.match(asked.answer, /modell/i);
  assert.equal(asked.model ?? null, null);

  const stored = await answerTechnicianChat({
    lexmark,
    tickets: [],
    knowledge: createEmptyKnowledgeDb(),
    messages: [{ role: "user", content: "CX725" }],
    useAi: false,
  });
  assert.match(stored.answer, /CX725/);
  assert.match(stored.answer, /merke ich mir/i);
  assert.equal(stored.model, "CX725");

  const follow = await answerTechnicianChat({
    lexmark,
    tickets: [],
    knowledge: createEmptyKnowledgeDb(),
    messages: [
      { role: "user", content: "CX725" },
      { role: "assistant", content: "Modell CX725 merke ich mir für dieses Gespräch." },
      { role: "user", content: "wird nicht warm" },
    ],
    useAi: false,
  });
  assert.match(follow.answer, /41X0251/);
  assert.equal(follow.model, "CX725");
});

test("Fehlercode liefert Erklärung und Fuser-Vorschläge auch ohne gespeicherte Kette", async () => {
  const lexmark = createEmptyLexmarkDb();
  lexmark.manuals.push({
    id: "man1",
    fileName: "CX725.pdf",
    title: "CX725",
    pageCount: 1,
    ocrNeeded: false,
    status: "AUTO_APPROVED",
    confidence: 90,
    source: "CX725.pdf",
    created_at: "",
    updated_at: "",
  });
  lexmark.printer_models.push({
    id: "m1",
    manualId: "man1",
    model: "CX725",
    series: "CX",
    machineType: null,
    modelNumber: null,
    source: "CX725.pdf",
    page: 1,
    created_at: "",
    updated_at: "",
  });
  lexmark.error_codes.push({
    id: "e1",
    manualId: "man1",
    code: "121.05",
    description: "During an attempt to heat up, the",
    category: "fuser",
    cause: null,
    customerResolution: null,
    remoteResolution: null,
    detailedDiagnostics: null,
    initialPartsReplacement: null,
    source: "CX725.pdf",
    page: 40,
    confidence: 70,
    status: "AUTO_APPROVED",
    created_at: "",
    updated_at: "",
  });
  lexmark.replacement_parts.push({
    id: "p1",
    manualId: "man1",
    fru: "41X0251",
    name: "CS72x fuser",
    description: "CS72x fuser type 02, 100V",
    assembly: null,
    removal: "1 41X0251 CS72x fuser type 02, 100V",
    source: "CX725.pdf",
    page: 90,
    confidence: 90,
    status: "AUTO_APPROVED",
    created_at: "",
    updated_at: "",
  });
  const byDot = answerFromLexmark(lexmark, "121.05 CX725");
  assert.ok(byDot);
  assert.match(byDot.answer, /121\.05/);
  assert.match(byDot.answer, /heat up/i);
  assert.match(byDot.answer, /41X0251/);
  assert.match(byDot.answer, /100V/);
  const byComma = answerFromLexmark(lexmark, "121,05");
  assert.ok(byComma);
  assert.match(byComma.answer, /41X0251/);
  const missing = answerFromLexmark(lexmark, "100.21 CX725");
  assert.ok(missing);
  assert.match(missing.answer, /nicht in den Lexmark-Listen/i);
  const chat = await answerTechnicianChat({
    lexmark,
    tickets: [],
    knowledge: createEmptyKnowledgeDb(),
    messages: [{ role: "user", content: "121.05 CX725" }],
    useAi: false,
  });
  assert.match(chat.answer, /41X0251/);
  const symptom = await answerTechnicianChat({
    lexmark,
    tickets: [],
    knowledge: createEmptyKnowledgeDb(),
    messages: [{ role: "user", content: "CX725 wird nicht warm" }],
    useAi: false,
  });
  assert.match(symptom.answer, /121\.05|Aufheizen|heat/i);
  assert.match(symptom.answer, /41X0251/);
});

test("Follow-up Tausch-Anleitung wiederholt nicht den Fehlercode", async () => {
  const lexmark = createEmptyLexmarkDb();
  lexmark.manuals.push({
    id: "man1",
    fileName: "CX725.pdf",
    title: "CX725",
    pageCount: 1,
    ocrNeeded: false,
    status: "AUTO_APPROVED",
    confidence: 90,
    source: "CX725.pdf",
    created_at: "",
    updated_at: "",
  });
  lexmark.printer_models.push({
    id: "m1",
    manualId: "man1",
    model: "CX725",
    series: "CX",
    machineType: null,
    modelNumber: null,
    source: "CX725.pdf",
    page: 1,
    created_at: "",
    updated_at: "",
  });
  lexmark.error_codes.push({
    id: "e1",
    manualId: "man1",
    code: "121.05",
    description: "During an attempt to heat up, the fuser did not reach the required temperature.",
    category: "fuser",
    cause: "The fuser failed to heat.",
    customerResolution: "Replace the fuser.",
    remoteResolution: null,
    detailedDiagnostics: null,
    initialPartsReplacement: null,
    source: "CX725.pdf",
    page: 40,
    confidence: 70,
    status: "AUTO_APPROVED",
    created_at: "",
    updated_at: "",
  });
  lexmark.replacement_parts.push(
    {
      id: "p1",
      manualId: "man1",
      fru: "41X0251",
      name: "CS72x fuser",
      description: "CS72x fuser type 02, 100V",
      assembly: "Fuser",
      removal: "1. Drucker ausschalten und abkühlen lassen.\n2. Rechte Abdeckung lösen.\n3. Fuser nach hinten ziehen und entnehmen.",
      source: "CX725.pdf",
      page: 90,
      confidence: 90,
      status: "AUTO_APPROVED",
      created_at: "",
      updated_at: "",
    },
    {
      id: "p2",
      manualId: "man1",
      fru: "41X0252",
      name: "CS72x fuser",
      description: "CS72x fuser type 00, 110-120V",
      assembly: "Fuser",
      removal: "1. Drucker ausschalten und abkühlen lassen.\n2. Rechte Abdeckung lösen.\n3. Fuser nach hinten ziehen und entnehmen.",
      source: "CX725.pdf",
      page: 90,
      confidence: 90,
      status: "AUTO_APPROVED",
      created_at: "",
      updated_at: "",
    },
  );

  const sticky = withStickyContext("gib mir eine anleitung zum tausch des Fusers", [
    { role: "user", content: "121.05 CX725" },
    { role: "assistant", content: "Fehlercode 121.05 — Der Fuser hat die Solltemperatur nicht erreicht.\nPN 41X0251 — CS72x fuser type 02, 100V" },
  ]);
  assert.match(sticky, /CX725/i);
  assert.doesNotMatch(sticky, /121\.05/);

  const first = await answerTechnicianChat({
    lexmark,
    tickets: [],
    knowledge: createEmptyKnowledgeDb(),
    messages: [{ role: "user", content: "121.05 CX725" }],
    useAi: false,
  });
  assert.match(first.answer, /121\.05/);
  assert.match(first.answer, /41X0251/);

  const follow = await answerTechnicianChat({
    lexmark,
    tickets: [],
    knowledge: createEmptyKnowledgeDb(),
    messages: [
      { role: "user", content: "121.05 CX725" },
      { role: "assistant", content: first.answer },
      { role: "user", content: "gib mir eine anleitung zum tausch des Fusers" },
    ],
    useAi: false,
  });
  assert.notEqual(follow.answer, first.answer);
  assert.doesNotMatch(follow.answer, /121\.05/);
  assert.match(follow.answer, /Ausbau/i);
  assert.match(follow.answer, /Abdeckung|entnehmen|41X0251/i);

  const byName = answerFromLexmark(lexmark, "gib mir eine anleitung zum tausch des Fusers CX725");
  assert.ok(byName);
  assert.match(byName.answer, /Ausbau/i);
  assert.doesNotMatch(byName.answer, /121\.05/);
});
