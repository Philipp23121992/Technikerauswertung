import { createId } from "@/lib/id";
import { analyzeWithAi } from "./ai";
import { appendLexmarkLog, readLexmarkDb, removeManual, writeLexmarkDb } from "./db";
import {
  CONFIDENCE_REVIEW_THRESHOLD,
  type AnalyzeFileResult,
  type ErrorCode,
  type ErrorPartRelation,
  type LexmarkAnalyzePayload,
  type LexmarkDb,
  type Manual,
  type PdfExtractResult,
  type PrinterModel,
  type ProcessingLog,
  type ReplacementPart,
  type ReviewQueueItem,
  type ReviewStatus,
} from "./types";
import { extractFrus } from "./extract";
import { uniqueErrorPartRelations } from "./relations";
import { extractPdfManual } from "./pdf";

function nowIso(): string {
  return new Date().toISOString();
}

function stamp(): { created_at: string; updated_at: string } {
  const now = nowIso();
  return { created_at: now, updated_at: now };
}

function statusFor(confidence: number): ReviewStatus {
  return confidence < CONFIDENCE_REVIEW_THRESHOLD ? "NEEDS_REVIEW" : "AUTO_APPROVED";
}

function logLine(
  db: LexmarkDb,
  manualId: string | null,
  level: ProcessingLog["level"],
  message: string,
): void {
  db.processing_log.push({
    id: createId("log"),
    manualId,
    level,
    message,
    ...stamp(),
  });
}

function enqueueReview(
  db: LexmarkDb,
  manualId: string,
  type: ReviewQueueItem["type"],
  value: string,
  confidence: number,
  reason: string,
): void {
  db.review_queue.push({
    id: createId("rev"),
    manualId,
    type,
    value,
    confidence,
    reason,
    status: "NEEDS_REVIEW",
    ...stamp(),
  });
}

function clipStr(value: unknown, max = 1500): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max).trim()}…` : text;
}

export function extractFromClientPayload(body: LexmarkAnalyzePayload): PdfExtractResult {
  const fileName = clipStr(body.fileName, 240) || "manual.pdf";
  return {
    fileName,
    title: clipStr(body.title, 240) || fileName,
    pageCount: Number.isFinite(body.pageCount) ? Math.max(0, Math.floor(body.pageCount)) : 0,
    pages: [],
    sections: (body.sections ?? []).slice(0, 400).map((item) => ({
      heading: clipStr(item.heading, 80) || "",
      page: typeof item.page === "number" ? item.page : 1,
      text: "",
    })).filter((item) => item.heading),
    models: (body.models ?? []).slice(0, 4000).map((item) => ({
      model: clipStr(item.model, 40) || "",
      series: clipStr(item.series, 20) || "",
      machineType: clipStr(item.machineType, 40),
      modelNumber: clipStr(item.modelNumber, 40),
      page: typeof item.page === "number" ? item.page : null,
      confidence: typeof item.confidence === "number" ? item.confidence : 80,
    })).filter((item) => item.model),
    errorCodes: (body.errorCodes ?? []).slice(0, 8000).map((item) => ({
      code: clipStr(item.code, 20) || "",
      description: clipStr(item.description, 500),
      category: clipStr(item.category, 240),
      cause: clipStr(item.cause, 1500),
      customerResolution: clipStr(item.customerResolution, 1500),
      remoteResolution: clipStr(item.remoteResolution, 1500),
      detailedDiagnostics: clipStr(item.detailedDiagnostics, 1500),
      initialPartsReplacement: clipStr(item.initialPartsReplacement, 1500),
      page: typeof item.page === "number" ? item.page : null,
      frus: Array.isArray(item.frus) ? item.frus.map((fru) => clipStr(fru, 20) || "").filter(Boolean) : [],
      confidence: typeof item.confidence === "number" ? item.confidence : 80,
    })).filter((item) => item.code),
    parts: (body.parts ?? []).slice(0, 8000).map((item) => ({
      fru: clipStr(item.fru, 20) || "",
      name: clipStr(item.name, 240),
      description: clipStr(item.description, 800),
      assembly: clipStr(item.assembly, 120),
      removal: clipStr(item.removal, 2500),
      page: typeof item.page === "number" ? item.page : null,
      models: Array.isArray(item.models) ? item.models.map((model) => clipStr(model, 40) || "").filter(Boolean) : [],
      confidence: typeof item.confidence === "number" ? item.confidence : 80,
    })).filter((item) => item.fru),
    ocrNeeded: Boolean(body.ocrNeeded),
    confidence: typeof body.confidence === "number" ? body.confidence : 70,
    warnings: Array.isArray(body.warnings) ? body.warnings.map((item) => clipStr(item, 400) || "").filter(Boolean) : [],
  };
}

function persistExtract(db: LexmarkDb, extracted: PdfExtractResult, sourceText: string): { manual: Manual; relations: number } {
  const times = stamp();
  const existing = db.manuals.find((item) => item.fileName === extracted.fileName);
  if (existing) {
    const cleaned = removeManual(db, existing.id);
    db.manuals = cleaned.manuals;
    db.printer_models = cleaned.printer_models;
    db.error_codes = cleaned.error_codes;
    db.replacement_parts = cleaned.replacement_parts;
    db.model_part_relations = cleaned.model_part_relations;
    db.error_part_relations = cleaned.error_part_relations;
    db.review_queue = cleaned.review_queue;
  }

  const manual: Manual = {
    id: createId("man"),
    fileName: extracted.fileName,
    title: extracted.title,
    pageCount: extracted.pageCount || extracted.pages.length,
    ocrNeeded: extracted.ocrNeeded,
    status: statusFor(extracted.confidence),
    confidence: extracted.confidence,
    source: extracted.fileName,
    ...times,
  };
  db.manuals.unshift(manual);

  const models: PrinterModel[] = extracted.models.map((item) => ({
    id: createId("mod"),
    manualId: manual.id,
    model: item.model,
    series: item.series,
    machineType: item.machineType,
    modelNumber: item.modelNumber,
    source: extracted.fileName,
    page: item.page,
    ...times,
  }));
  db.printer_models.push(...models);
  if (!models.length) {
    enqueueReview(db, manual.id, "model", extracted.fileName, 50, "Kein Modell im PDF erkannt.");
  }

  const errors: ErrorCode[] = extracted.errorCodes.map((item) => {
    const status = statusFor(item.confidence);
    if (status === "NEEDS_REVIEW" && item.confidence < 60) {
      enqueueReview(db, manual.id, "error_code", item.code, item.confidence, "Unsicher – Beschreibung oder Zuordnung fehlt.");
    }
    return {
      id: createId("err"),
      manualId: manual.id,
      code: item.code,
      description: item.description,
      category: item.category,
      cause: item.cause,
      customerResolution: item.customerResolution,
      remoteResolution: item.remoteResolution,
      detailedDiagnostics: item.detailedDiagnostics,
      initialPartsReplacement: item.initialPartsReplacement,
      source: extracted.fileName,
      page: item.page,
      confidence: item.confidence,
      status,
      ...times,
    };
  });
  db.error_codes.push(...errors);

  const parts: ReplacementPart[] = extracted.parts.map((item) => {
    const status = statusFor(item.confidence);
    if (status === "NEEDS_REVIEW" && item.confidence < 60) {
      enqueueReview(db, manual.id, "replacement_part", item.fru, item.confidence, "Unsicher – Bezeichnung fehlt.");
    }
    return {
      id: createId("fru"),
      manualId: manual.id,
      fru: item.fru,
      name: item.name,
      description: item.description,
      assembly: item.assembly,
      removal: item.removal ?? null,
      source: extracted.fileName,
      page: item.page,
      confidence: item.confidence,
      status,
      ...times,
    };
  });
  db.replacement_parts.push(...parts);

  const modelNames = models.map((item) => item.model);
  const partsByPage = new Map<number, string[]>();
  for (const part of extracted.parts) {
    if (part.page == null) continue;
    const list = partsByPage.get(part.page) ?? [];
    if (list.length < 6) list.push(part.fru);
    partsByPage.set(part.page, list);
  }

  const errorPart: ErrorPartRelation[] = [];
  for (const error of extracted.errorCodes) {
    const fromText = extractFrus(
      [error.description, error.cause, error.customerResolution, error.remoteResolution, error.detailedDiagnostics, error.initialPartsReplacement]
        .filter(Boolean)
        .join("\n"),
    );
    const fromPage = [
      ...(error.page != null ? partsByPage.get(error.page) ?? [] : []),
      ...(error.page != null ? partsByPage.get(error.page - 1) ?? [] : []),
      ...(error.page != null ? partsByPage.get(error.page + 1) ?? [] : []),
    ];
    const frus = [...new Set([...error.frus, ...fromText, ...fromPage])].slice(0, 4);
    if (!frus.length) continue;
    const modelsForError = modelNames.length ? modelNames.slice(0, 12) : [""];
    for (const model of modelsForError) {
      if (!model) continue;
      for (const fru of frus) {
        errorPart.push({
          id: createId("epr"),
          manualId: manual.id,
          model,
          errorCode: error.code,
          fru,
          description: error.description,
          ...times,
        });
      }
    }
  }
  db.error_part_relations.push(...uniqueErrorPartRelations(errorPart));

  if (extracted.ocrNeeded) {
    enqueueReview(db, manual.id, "ocr", extracted.fileName, 45, "Viele Seiten ohne Text – gescanntes PDF?");
  }

  void sourceText;
  return { manual, relations: errorPart.length };
}

export async function analyzeLexmarkExtract(
  extracted: PdfExtractResult,
  options: { useAi: boolean; sourceText?: string },
): Promise<AnalyzeFileResult> {
  const fileName = extracted.fileName;
  const log: string[] = [];
  const push = async (line: string) => {
    log.push(line);
    await appendLexmarkLog(`${fileName}: ${line}`);
  };

  try {
    await push(`${extracted.pageCount || extracted.pages.length} Seiten, ${extracted.sections.length} Abschnitte.`);
    for (const warning of extracted.warnings) {
      await push(warning);
    }

    if (options.useAi) {
      await push("KI-Nachanalyse (nur PDF-Text, nichts erfinden)…");
      const source =
        options.sourceText ||
        extracted.pages.map((page) => `Seite ${page.page}\n${page.text}`).join("\n\n");
      const ai = await analyzeWithAi(source);
      if (ai.warning) await push(ai.warning);
      if (ai.payload) {
        const byCode = new Map(extracted.errorCodes.map((item) => [item.code, item]));
        for (const item of ai.payload.errorCodes) {
          const prev = byCode.get(item.code);
          if (!prev) continue;
          prev.description = prev.description || item.description;
          prev.category = prev.category || item.category;
          prev.cause = prev.cause || item.cause;
          prev.customerResolution = prev.customerResolution || item.customerResolution;
          prev.remoteResolution = prev.remoteResolution || item.remoteResolution;
          prev.detailedDiagnostics = prev.detailedDiagnostics || item.detailedDiagnostics;
          prev.initialPartsReplacement = prev.initialPartsReplacement || item.initialPartsReplacement;
          prev.frus = [...new Set([...prev.frus, ...item.frus])];
          prev.confidence = Math.min(96, prev.confidence + 4);
        }
        const byFru = new Map(extracted.parts.map((item) => [item.fru, item]));
        for (const item of ai.payload.parts) {
          const prev = byFru.get(item.fru);
          if (!prev) continue;
          prev.name = prev.name || item.name;
          prev.description = prev.description || item.description;
          prev.assembly = prev.assembly || item.assembly;
          prev.removal = prev.removal || item.removal || null;
          prev.confidence = Math.min(96, prev.confidence + 4);
        }
        await push("KI-Ergebnis gegen PDF-Text geprüft, erfundene Werte verworfen.");
      }
    }

    const db = await readLexmarkDb();
    const saved = persistExtract(db, extracted, options.sourceText || "");
    logLine(db, saved.manual.id, "info", `${fileName}: ${extracted.errorCodes.length} Codes, ${extracted.parts.length} FRUs.`);
    await writeLexmarkDb(db);
    await push(
      `Gespeichert: ${extracted.models.length} Modelle, ${extracted.errorCodes.length} Fehlercodes, ${extracted.parts.length} FRUs.`,
    );

    return {
      fileName,
      ok: true,
      error: null,
      log,
      stats: {
        models: extracted.models.length,
        errorCodes: extracted.errorCodes.length,
        parts: extracted.parts.length,
        relations: saved.relations,
        review: db.review_queue.filter((item) => item.manualId === saved.manual.id).length,
      },
      manualId: saved.manual.id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
    await push(`Fehler: ${message}`);
    try {
      const db = await readLexmarkDb();
      logLine(db, null, "error", `${fileName}: ${message}`);
      await writeLexmarkDb(db);
    } catch {
      /* DB-Fehler nachrangig */
    }
    return {
      fileName,
      ok: false,
      error: message,
      log,
      stats: null,
      manualId: null,
    };
  }
}

export async function analyzeLexmarkPdf(
  buffer: Buffer,
  fileName: string,
  options: { useAi: boolean },
): Promise<AnalyzeFileResult> {
  await appendLexmarkLog(`${fileName}: PDF einlesen…`);
  const extracted = await extractPdfManual(buffer, fileName);
  return analyzeLexmarkExtract(extracted, {
    useAi: options.useAi,
    sourceText: extracted.pages.map((page) => `Seite ${page.page}\n${page.text}`).join("\n\n"),
  });
}
