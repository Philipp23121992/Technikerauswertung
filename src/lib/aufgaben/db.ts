import { promises as fs } from "fs";
import path from "path";
import { writeJsonAtomic } from "@/lib/atomic-write";
import {
  createEmptyAufgabenDb,
  normalizeTask,
  type AufgabenDb,
  type Task,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
export const AUFGABEN_DB_PATH = path.join(DATA_DIR, "aufgaben-db.json");

export async function readAufgabenDb(): Promise<AufgabenDb> {
  try {
    const raw = await fs.readFile(AUFGABEN_DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<AufgabenDb>;
    if (parsed?.version !== 1 || !Array.isArray(parsed.tasks)) {
      return createEmptyAufgabenDb();
    }
    const tasks = parsed.tasks
      .map((item, index) => normalizeTask(item as Partial<Task>, index))
      .filter((item): item is Task => Boolean(item));
    return { version: 1, tasks };
  } catch {
    return createEmptyAufgabenDb();
  }
}

export async function writeAufgabenDb(db: AufgabenDb): Promise<AufgabenDb> {
  const tasks = db.tasks
    .map((item, index) => normalizeTask(item, index))
    .filter((item): item is Task => Boolean(item));
  const next: AufgabenDb = { version: 1, tasks };
  await writeJsonAtomic(AUFGABEN_DB_PATH, next);
  return next;
}
