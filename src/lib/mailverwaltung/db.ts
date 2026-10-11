import { promises as fs } from "fs";
import path from "path";
import { writeJsonAtomic } from "@/lib/atomic-write";
import { createSeedDb } from "./seed";
import {
  createEmptyMailverwaltungDb,
  normalizeDb,
  type MailverwaltungDb,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
export const MAILVERWALTUNG_DB_PATH = path.join(DATA_DIR, "mailverwaltung-db.json");

export async function readMailverwaltungDb(): Promise<MailverwaltungDb> {
  try {
    const raw = await fs.readFile(MAILVERWALTUNG_DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<MailverwaltungDb>;
    const db = normalizeDb(parsed);
    if (db.mailboxes.length === 0 && db.messages.length === 0) {
      const seeded = createSeedDb();
      await writeMailverwaltungDb(seeded);
      return seeded;
    }
    return db;
  } catch {
    const seeded = createSeedDb();
    await writeMailverwaltungDb(seeded);
    return seeded;
  }
}

export async function writeMailverwaltungDb(
  db: MailverwaltungDb,
): Promise<MailverwaltungDb> {
  const next = normalizeDb(db);
  await writeJsonAtomic(MAILVERWALTUNG_DB_PATH, next);
  return next;
}

export async function resetMailverwaltungDemo(): Promise<MailverwaltungDb> {
  return writeMailverwaltungDb(createSeedDb());
}

export function emptyMailverwaltungDb(): MailverwaltungDb {
  return createEmptyMailverwaltungDb();
}
