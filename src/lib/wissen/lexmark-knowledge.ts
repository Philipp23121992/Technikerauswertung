import type { LexmarkDb } from "@/lib/lexmark/types";
import { partBezeichnung } from "@/lib/lexmark/extract";
import { uniqueErrorPartRelations } from "@/lib/lexmark/relations";
import { chunkText } from "./types";
import type { SpreadsheetSheet } from "./xlsx-text";

export type KnowledgePiece = { title: string; text: string };

const MAX_PIECES = 8000;

function clip(value: string | null | undefined, max = 400): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
}

function headerIndex(headers: string[], ...needles: string[]): number {
  const lower = headers.map((item) => item.toLowerCase());
  return lower.findIndex((header) => needles.some((needle) => header.includes(needle)));
}

function modelsForManual(db: LexmarkDb, manualId: string): string[] {
  return [...new Set(db.printer_models.filter((item) => item.manualId === manualId).map((item) => item.model))];
}

export function piecesFromLexmarkManual(db: LexmarkDb, manualId: string): KnowledgePiece[] {
  const manual = db.manuals.find((item) => item.id === manualId);
  if (!manual) return [];
  const models = modelsForManual(db, manualId);
  const modelLabel = models.slice(0, 24).join(", ");
  const relations = uniqueErrorPartRelations(db.error_part_relations.filter((item) => item.manualId === manualId));
  const frusByCode = new Map<string, string[]>();
  for (const row of relations) {
    const list = frusByCode.get(row.errorCode) ?? [];
    if (!list.includes(row.fru)) list.push(row.fru);
    frusByCode.set(row.errorCode, list);
  }

  const pieces: KnowledgePiece[] = [];
  if (modelLabel) {
    pieces.push({
      title: `${manual.fileName} Modelle`,
      text: `Dieses Service-Manual gilt für: ${modelLabel}. Quelle: ${manual.fileName}.`,
    });
  }

  for (const error of db.error_codes.filter((item) => item.manualId === manualId)) {
    const frus = frusByCode.get(error.code) ?? [];
    const relatedModels = [
      ...new Set(relations.filter((row) => row.errorCode === error.code).map((row) => row.model)),
    ];
    const modelsText = (relatedModels.length ? relatedModels : models).slice(0, 12).join(", ");
    const fruText = [...new Set(frus)].slice(0, 8).join(", ");
    const body = [
      `${error.code} ${clip(error.description || error.category, 240)}`.trim(),
      modelsText ? `Modell: ${modelsText}` : "",
      error.customerResolution ? `Customer resolution: ${clip(error.customerResolution, 500)}` : "",
      error.remoteResolution ? `Remote resolution: ${clip(error.remoteResolution, 400)}` : "",
      fruText ? `FRU: ${fruText}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    pieces.push({
      title: `${modelsText || manual.fileName} ${error.code}`,
      text: body,
    });
    if (pieces.length >= MAX_PIECES) return pieces;
  }

  for (const part of db.replacement_parts.filter((item) => item.manualId === manualId)) {
    const description = clip(partBezeichnung(part) || part.description || part.name, 220);
    const partModels = models.slice(0, 8).join(", ");
    pieces.push({
      title: `${partModels || manual.fileName} ${part.fru}`,
      text: [
        `PN ${part.fru}${description ? ` - ${description}` : ""}`,
        partModels ? `Modell: ${partModels}` : "",
        part.assembly ? `Baugruppe: ${part.assembly}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    });
    if (pieces.length >= MAX_PIECES) return pieces;
  }

  for (const row of relations.slice(0, 400)) {
    pieces.push({
      title: `${row.model} ${row.errorCode} ${row.fru}`,
      text: `Kette: ${row.model} Fehler ${row.errorCode} → FRU ${row.fru}${row.description ? ` - ${clip(row.description, 180)}` : ""}`,
    });
    if (pieces.length >= MAX_PIECES) return pieces;
  }

  return pieces;
}

export function lexmarkDocMeta(db: LexmarkDb, manualId: string): { key: string; title: string; fileName: string } | null {
  const manual = db.manuals.find((item) => item.id === manualId);
  if (!manual) return null;
  return {
    key: `lexmark:${manual.id}`,
    title: `Lexmark ${manual.fileName.replace(/\.pdf$/i, "")}`,
    fileName: `lexmark:${manual.id}`,
  };
}

function col(row: string[], index: number): string {
  return index >= 0 ? (row[index] ?? "").trim() : "";
}

export function piecesFromSpreadsheet(sheets: SpreadsheetSheet[], sourceName: string): KnowledgePiece[] {
  const looksLexmark = sheets.some((sheet) =>
    /fehlercode|ersatzteil|beziehung|fru/i.test(`${sheet.name} ${sheet.headers.join(" ")}`),
  );
  if (!looksLexmark) {
    const lines: string[] = [];
    for (const sheet of sheets) {
      lines.push(sheet.name);
      for (const row of sheet.rows) {
        const parts = sheet.headers
          .map((header, index) => {
            const value = (row[index] ?? "").trim();
            return value ? `${header}: ${value}` : "";
          })
          .filter(Boolean);
        if (parts.length) lines.push(parts.join(" · "));
      }
      lines.push("");
    }
    return chunkText(lines.join("\n"), 900, 120).map((text, index) => ({
      title: `${sourceName} ${index + 1}`,
      text,
    }));
  }

  const pieces: KnowledgePiece[] = [];
  for (const sheet of sheets) {
    const headers = sheet.headers;
    const codeIdx = headerIndex(headers, "fehlercode", "error", "code");
    const fruIdx = headerIndex(headers, "fru", "teilenummer", "teil", "pn", "ersatzteil");
    const modelIdx = headerIndex(headers, "modell", "model", "gerät", "geraet", "maschine");
    const descIdx = headerIndex(headers, "beschreibung", "description", "bezeichnung");
    const customerIdx = headerIndex(headers, "customer");
    const remoteIdx = headerIndex(headers, "remote");
    const assemblyIdx = headerIndex(headers, "baugruppe", "assembly");

    if (/review/i.test(sheet.name)) continue;

    if (codeIdx >= 0 && fruIdx >= 0 && /beziehung|kette/i.test(sheet.name)) {
      for (const row of sheet.rows) {
        const model = col(row, modelIdx);
        const code = col(row, codeIdx);
        const fru = col(row, fruIdx);
        if (!code || !fru) continue;
        const description = col(row, descIdx);
        pieces.push({
          title: `${model} ${code} ${fru}`.trim(),
          text: `Kette: ${model} Fehler ${code} → FRU ${fru}${description ? ` - ${clip(description, 180)}` : ""}`,
        });
        if (pieces.length >= MAX_PIECES) return pieces;
      }
      continue;
    }

    if (codeIdx >= 0) {
      for (const row of sheet.rows) {
        const code = col(row, codeIdx);
        if (!code) continue;
        const model = col(row, modelIdx);
        const description = col(row, descIdx);
        const customer = col(row, customerIdx);
        const remote = col(row, remoteIdx);
        pieces.push({
          title: `${model} ${code}`.trim(),
          text: [
            `${code} ${clip(description, 240)}`.trim(),
            model ? `Modell: ${model}` : "",
            customer ? `Customer resolution: ${clip(customer, 500)}` : "",
            remote ? `Remote resolution: ${clip(remote, 400)}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        });
        if (pieces.length >= MAX_PIECES) return pieces;
      }
      continue;
    }

    if (fruIdx >= 0) {
      for (const row of sheet.rows) {
        const fru = col(row, fruIdx);
        if (!fru) continue;
        const model = col(row, modelIdx);
        const description = col(row, descIdx);
        const assembly = col(row, assemblyIdx);
        pieces.push({
          title: `${model} ${fru}`.trim(),
          text: [
            `PN ${fru}${description ? ` - ${clip(description, 220)}` : ""}`,
            model ? `Modell: ${model}` : "",
            assembly ? `Baugruppe: ${assembly}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        });
        if (pieces.length >= MAX_PIECES) return pieces;
      }
    }
  }

  return pieces;
}
