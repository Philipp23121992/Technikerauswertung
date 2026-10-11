import { promises as fs } from "fs";
import path from "path";
import { writeJsonAtomic } from "@/lib/atomic-write";
import {
  createEmptyDispositionDb,
  normalizeDb,
  type DispositionDb,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
export const DISPOSITION_DB_PATH = path.join(DATA_DIR, "disposition-db.json");

export async function readDispositionDb(): Promise<DispositionDb> {
  try {
    const raw = await fs.readFile(DISPOSITION_DB_PATH, "utf8");
    return normalizeDb(JSON.parse(raw) as Partial<DispositionDb>);
  } catch {
    const empty = createEmptyDispositionDb();
    await writeDispositionDb(empty);
    return empty;
  }
}

export async function writeDispositionDb(db: DispositionDb): Promise<DispositionDb> {
  const next = normalizeDb(db);
  await writeJsonAtomic(DISPOSITION_DB_PATH, next);
  return next;
}
