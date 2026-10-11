import { promises as fs } from "fs";
import path from "path";
import { writeJsonAtomic } from "@/lib/atomic-write";
import { createEmptyLexmarkDb, type LexmarkDb } from "./types";
import { partBezeichnung } from "./extract";
import { uniqueErrorPartRelations } from "./relations";

const DATA_DIR = path.join(process.cwd(), "data");
export const LEXMARK_DB_PATH = path.join(DATA_DIR, "lexmark-db.json");
export const LEXMARK_LOG_PATH = path.join(DATA_DIR, "lexmark-application.log");

function compactLexmarkDb(db: LexmarkDb): { db: LexmarkDb; changed: boolean } {
  let changed = false;
  const modelParts = db.model_part_relations.length > 2000 ? [] : db.model_part_relations;
  if (modelParts !== db.model_part_relations) changed = true;
  const relations = uniqueErrorPartRelations(db.error_part_relations);
  if (relations.length !== db.error_part_relations.length) changed = true;
  const review = db.review_queue.filter((item) => {
    if (item.type === "error_code" && item.confidence >= 68 && /confidence unter 80/i.test(item.reason)) {
      return false;
    }
    if (item.type === "relationship" && /confidence unter 80/i.test(item.reason)) {
      return false;
    }
    return true;
  });
  if (review.length !== db.review_queue.length) changed = true;
  const parts = db.replacement_parts.map((part) => {
    const name = partBezeichnung(part);
    const description = partBezeichnung({ ...part, name: part.description, description: part.description }) || name;
    if (name !== part.name || description !== part.description || part.removal === undefined) changed = true;
    return { ...part, name, description, removal: part.removal ?? null };
  });
  if (!changed) return { db, changed: false };
  return {
    changed: true,
    db: {
      ...db,
      model_part_relations: modelParts,
      error_part_relations: relations,
      replacement_parts: parts,
      review_queue: review,
    },
  };
}

export async function readLexmarkDb(): Promise<LexmarkDb> {
  try {
    const raw = await fs.readFile(LEXMARK_DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<LexmarkDb>;
    if (parsed?.version !== 1 || !Array.isArray(parsed.manuals)) {
      return createEmptyLexmarkDb();
    }
    const db: LexmarkDb = {
      version: 1,
      manuals: parsed.manuals ?? [],
      printer_models: parsed.printer_models ?? [],
      error_codes: parsed.error_codes ?? [],
      replacement_parts: parsed.replacement_parts ?? [],
      model_part_relations: parsed.model_part_relations ?? [],
      error_part_relations: parsed.error_part_relations ?? [],
      processing_log: parsed.processing_log ?? [],
      review_queue: parsed.review_queue ?? [],
    };
    const compact = compactLexmarkDb(db);
    if (compact.changed) {
      await writeLexmarkDb(compact.db);
      return compact.db;
    }
    return db;
  } catch {
    return createEmptyLexmarkDb();
  }
}

export async function writeLexmarkDb(db: LexmarkDb): Promise<LexmarkDb> {
  const next: LexmarkDb = {
    version: 1,
    manuals: db.manuals,
    printer_models: db.printer_models,
    error_codes: db.error_codes,
    replacement_parts: db.replacement_parts,
    model_part_relations: db.model_part_relations,
    error_part_relations: db.error_part_relations,
    processing_log: db.processing_log.slice(-2000),
    review_queue: db.review_queue,
  };
  await writeJsonAtomic(LEXMARK_DB_PATH, next);
  return next;
}

export async function clearLexmarkDb(): Promise<void> {
  await writeLexmarkDb(createEmptyLexmarkDb());
  await appendLexmarkLog("Datenbank geleert.");
}

export async function appendLexmarkLog(message: string): Promise<void> {
  const line = `${new Date().toISOString()} ${message}\n`;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.appendFile(LEXMARK_LOG_PATH, line, "utf8");
  } catch {
    /* Logging darf die Analyse nicht stoppen */
  }
}

export function removeManual(db: LexmarkDb, manualId: string): LexmarkDb {
  return {
    version: 1,
    manuals: db.manuals.filter((item) => item.id !== manualId),
    printer_models: db.printer_models.filter((item) => item.manualId !== manualId),
    error_codes: db.error_codes.filter((item) => item.manualId !== manualId),
    replacement_parts: db.replacement_parts.filter((item) => item.manualId !== manualId),
    model_part_relations: db.model_part_relations.filter((item) => item.manualId !== manualId),
    error_part_relations: db.error_part_relations.filter((item) => item.manualId !== manualId),
    processing_log: db.processing_log,
    review_queue: db.review_queue.filter((item) => item.manualId !== manualId),
  };
}
