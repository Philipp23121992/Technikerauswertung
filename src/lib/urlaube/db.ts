import { promises as fs } from "fs";
import path from "path";
import { writeJsonAtomic } from "@/lib/atomic-write";
import {
  createEmptyUrlaubeDb,
  normalizeVacationRequest,
  type UrlaubeDb,
  type VacationRequest,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
export const URLAUBE_DB_PATH = path.join(DATA_DIR, "urlaube-db.json");

export async function readUrlaubeDb(): Promise<UrlaubeDb> {
  try {
    const raw = await fs.readFile(URLAUBE_DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<UrlaubeDb>;
    if (parsed?.version !== 1 || !Array.isArray(parsed.requests)) {
      return createEmptyUrlaubeDb();
    }
    const requests = parsed.requests
      .map((item) => normalizeVacationRequest(item as Partial<VacationRequest>))
      .filter((item): item is VacationRequest => Boolean(item));
    return { version: 1, requests };
  } catch {
    return createEmptyUrlaubeDb();
  }
}

export async function writeUrlaubeDb(db: UrlaubeDb): Promise<UrlaubeDb> {
  const requests = db.requests
    .map((item) => normalizeVacationRequest(item))
    .filter((item): item is VacationRequest => Boolean(item));
  const next: UrlaubeDb = { version: 1, requests };
  await writeJsonAtomic(URLAUBE_DB_PATH, next);
  return next;
}
