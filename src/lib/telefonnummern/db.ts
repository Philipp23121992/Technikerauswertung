import { promises as fs } from "fs";
import path from "path";
import { writeJsonAtomic } from "@/lib/atomic-write";
import {
  createEmptyTelefonnummernDb,
  normalizeContact,
  type PhoneContact,
  type TelefonnummernDb,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
export const TELEFONNUMMERN_DB_PATH = path.join(DATA_DIR, "telefonnummern-db.json");

export async function readTelefonnummernDb(): Promise<TelefonnummernDb> {
  try {
    const raw = await fs.readFile(TELEFONNUMMERN_DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<TelefonnummernDb>;
    if (parsed?.version !== 1 || !Array.isArray(parsed.contacts)) {
      return createEmptyTelefonnummernDb();
    }
    const contacts = parsed.contacts
      .map((item) => normalizeContact(item as Partial<PhoneContact>))
      .filter((item): item is PhoneContact => Boolean(item));
    return { version: 1, contacts };
  } catch {
    return createEmptyTelefonnummernDb();
  }
}

export async function writeTelefonnummernDb(
  db: TelefonnummernDb,
): Promise<TelefonnummernDb> {
  const contacts = db.contacts
    .map((item) => normalizeContact(item))
    .filter((item): item is PhoneContact => Boolean(item));
  const next: TelefonnummernDb = { version: 1, contacts };
  await writeJsonAtomic(TELEFONNUMMERN_DB_PATH, next);
  return next;
}
