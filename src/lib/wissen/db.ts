import { promises as fs } from "fs";
import path from "path";
import { writeJsonAtomic } from "@/lib/atomic-write";
import {
  createEmptyKnowledgeDb,
  type KnowledgeDb,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
export const WISSEN_DB_PATH = path.join(DATA_DIR, "wissen-db.json");

export async function readKnowledgeDb(): Promise<KnowledgeDb> {
  try {
    const raw = await fs.readFile(WISSEN_DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<KnowledgeDb>;
    if (parsed?.version !== 1 || !Array.isArray(parsed.docs) || !Array.isArray(parsed.chunks)) {
      return createEmptyKnowledgeDb();
    }
    return {
      version: 1,
      docs: parsed.docs,
      chunks: parsed.chunks,
    };
  } catch {
    return createEmptyKnowledgeDb();
  }
}

export async function writeKnowledgeDb(db: KnowledgeDb): Promise<KnowledgeDb> {
  const next: KnowledgeDb = {
    version: 1,
    docs: db.docs,
    chunks: db.chunks,
  };
  await writeJsonAtomic(WISSEN_DB_PATH, next);
  return next;
}
