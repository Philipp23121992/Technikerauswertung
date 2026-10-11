import { promises as fs } from "fs";
import path from "path";
import { writeJsonAtomic } from "@/lib/atomic-write";
import {
  createEmptyTechnikerverwaltungDb,
  normalizeMember,
  type TeamMember,
  type TechnikerverwaltungDb,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
export const TECHNIKERVERWALTUNG_DB_PATH = path.join(
  DATA_DIR,
  "technikerverwaltung-db.json",
);

export async function readTechnikerverwaltungDb(): Promise<TechnikerverwaltungDb> {
  try {
    const raw = await fs.readFile(TECHNIKERVERWALTUNG_DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<TechnikerverwaltungDb>;
    if (parsed?.version !== 1 || !Array.isArray(parsed.members)) {
      return createEmptyTechnikerverwaltungDb();
    }
    const members = parsed.members
      .map((item, index) => normalizeMember(item as Partial<TeamMember>, index))
      .filter((item): item is TeamMember => Boolean(item));
    return { version: 1, members };
  } catch {
    return createEmptyTechnikerverwaltungDb();
  }
}

export async function writeTechnikerverwaltungDb(
  db: TechnikerverwaltungDb,
): Promise<TechnikerverwaltungDb> {
  const members = db.members
    .map((item, index) => normalizeMember(item, index))
    .filter((item): item is TeamMember => Boolean(item));
  const next: TechnikerverwaltungDb = { version: 1, members };
  await writeJsonAtomic(TECHNIKERVERWALTUNG_DB_PATH, next);
  return next;
}

let writeChain: Promise<void> = Promise.resolve();

export async function updateTechnikerverwaltungDb(
  mutator: (
    db: TechnikerverwaltungDb,
  ) => TechnikerverwaltungDb | Promise<TechnikerverwaltungDb>,
): Promise<TechnikerverwaltungDb> {
  let release: () => void = () => undefined;
  const previous = writeChain;
  writeChain = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    const current = await readTechnikerverwaltungDb();
    return await writeTechnikerverwaltungDb(await mutator(current));
  } finally {
    release();
  }
}
