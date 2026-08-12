import { promises as fs } from "fs";
import path from "path";
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
  await fs.mkdir(DATA_DIR, { recursive: true });
  const next: KnowledgeDb = {
    version: 1,
    docs: db.docs,
    chunks: db.chunks,
  };
  await fs.writeFile(WISSEN_DB_PATH, JSON.stringify(next, null, 2), "utf8");
  return next;
}
