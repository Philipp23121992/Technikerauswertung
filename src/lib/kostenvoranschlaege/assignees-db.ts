import { promises as fs } from "fs";
import path from "path";
import { writeJsonAtomic } from "@/lib/atomic-write";
import {
  createEmptyAssigneesDb,
  normalizeAssignee,
  type QuoteAssignee,
  type QuoteAssigneesDb,
} from "./assignees";

const DATA_DIR = path.join(process.cwd(), "data");
export const KOSTENVORANSCHLAEGE_ASSIGNEES_PATH = path.join(
  DATA_DIR,
  "kostenvoranschlaege-assignees.json",
);

export async function readQuoteAssigneesDb(): Promise<QuoteAssigneesDb> {
  try {
    const raw = await fs.readFile(KOSTENVORANSCHLAEGE_ASSIGNEES_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<QuoteAssigneesDb>;
    if (parsed?.version !== 1 || !Array.isArray(parsed.assignees)) {
      return createEmptyAssigneesDb();
    }
    const assignees = parsed.assignees
      .map((item) => normalizeAssignee(item as Partial<QuoteAssignee>))
      .filter((item): item is QuoteAssignee => Boolean(item))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
    return { version: 1, assignees };
  } catch {
    return createEmptyAssigneesDb();
  }
}

export async function writeQuoteAssigneesDb(
  db: QuoteAssigneesDb,
): Promise<QuoteAssigneesDb> {
  const assignees = db.assignees
    .map((item) => normalizeAssignee(item))
    .filter((item): item is QuoteAssignee => Boolean(item))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
  const next: QuoteAssigneesDb = { version: 1, assignees };
  await writeJsonAtomic(KOSTENVORANSCHLAEGE_ASSIGNEES_PATH, next);
  return next;
}
