import { promises as fs } from "fs";
import path from "path";
import { writeJsonAtomic } from "@/lib/atomic-write";
import {
  createEmptyDienstreisenDb,
  normalizeTrip,
  type BusinessTrip,
  type DienstreisenDb,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
export const DIENSTREISEN_DB_PATH = path.join(DATA_DIR, "dienstreisen-db.json");

export async function readDienstreisenDb(): Promise<DienstreisenDb> {
  try {
    const raw = await fs.readFile(DIENSTREISEN_DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<DienstreisenDb>;
    if (parsed?.version !== 1 || !Array.isArray(parsed.trips)) {
      return createEmptyDienstreisenDb();
    }
    const trips = parsed.trips
      .map((item, index) => normalizeTrip(item as Partial<BusinessTrip>, index))
      .filter((item): item is BusinessTrip => Boolean(item));
    return { version: 1, trips };
  } catch {
    return createEmptyDienstreisenDb();
  }
}

export async function writeDienstreisenDb(
  db: DienstreisenDb,
): Promise<DienstreisenDb> {
  const trips = db.trips
    .map((item, index) => normalizeTrip(item, index))
    .filter((item): item is BusinessTrip => Boolean(item));
  const next: DienstreisenDb = { version: 1, trips };
  await writeJsonAtomic(DIENSTREISEN_DB_PATH, next);
  return next;
}
