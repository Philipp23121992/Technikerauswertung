import { promises as fs } from "fs";
import path from "path";
import { writeJsonAtomic } from "@/lib/atomic-write";
import { cleanupOrphanedQuoteFiles } from "./files";
import {
  createEmptyKostenvoranschlaegeDb,
  normalizeQuote,
  type CostQuote,
  type KostenvoranschlaegeDb,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
export const KOSTENVORANSCHLAEGE_DB_PATH = path.join(
  DATA_DIR,
  "kostenvoranschlaege-db.json",
);

export async function readKostenvoranschlaegeDb(): Promise<KostenvoranschlaegeDb> {
  try {
    const raw = await fs.readFile(KOSTENVORANSCHLAEGE_DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<KostenvoranschlaegeDb>;
    if (parsed?.version !== 1 || !Array.isArray(parsed.quotes)) {
      return createEmptyKostenvoranschlaegeDb();
    }
    const quotes = parsed.quotes
      .map((item, index) => normalizeQuote(item as Partial<CostQuote>, index))
      .filter((item): item is CostQuote => Boolean(item));
    return { version: 1, quotes };
  } catch {
    return createEmptyKostenvoranschlaegeDb();
  }
}

export async function writeKostenvoranschlaegeDb(
  db: KostenvoranschlaegeDb,
): Promise<KostenvoranschlaegeDb> {
  const quotes = db.quotes
    .map((item, index) => normalizeQuote(item, index))
    .filter((item): item is CostQuote => Boolean(item));
  const next: KostenvoranschlaegeDb = { version: 1, quotes };
  await writeJsonAtomic(KOSTENVORANSCHLAEGE_DB_PATH, next);
  await cleanupOrphanedQuoteFiles(quotes.map((quote) => quote.id));
  return next;
}
