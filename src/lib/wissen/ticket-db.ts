import { promises as fs } from "fs";
import path from "path";
import { writeJsonAtomic } from "@/lib/atomic-write";
import {
  createEmptyWissenTicketsDb,
  normalizeKnowledgeTicket,
  type KnowledgeTicket,
  type WissenTicketsDb,
} from "./tickets";

const DATA_DIR = path.join(process.cwd(), "data");
export const WISSEN_TICKETS_DB_PATH = path.join(DATA_DIR, "wissen-tickets-db.json");

export async function readWissenTicketsDb(): Promise<WissenTicketsDb> {
  try {
    const raw = await fs.readFile(WISSEN_TICKETS_DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<WissenTicketsDb>;
    if (parsed?.version !== 1 || !Array.isArray(parsed.tickets)) {
      return createEmptyWissenTicketsDb();
    }
    const tickets = parsed.tickets
      .map((item) => normalizeKnowledgeTicket(item as Partial<KnowledgeTicket>))
      .filter((item): item is KnowledgeTicket => Boolean(item));
    return {
      version: 1,
      tickets,
      lastImportAt: typeof parsed.lastImportAt === "string" ? parsed.lastImportAt : null,
      lastImportFile: typeof parsed.lastImportFile === "string" ? parsed.lastImportFile : null,
      lastImportStats: parsed.lastImportStats ?? null,
    };
  } catch {
    return createEmptyWissenTicketsDb();
  }
}

export async function writeWissenTicketsDb(db: WissenTicketsDb): Promise<WissenTicketsDb> {
  const tickets = db.tickets
    .map((item) => normalizeKnowledgeTicket(item))
    .filter((item): item is KnowledgeTicket => Boolean(item));
  const next: WissenTicketsDb = {
    version: 1,
    tickets,
    lastImportAt: db.lastImportAt,
    lastImportFile: db.lastImportFile,
    lastImportStats: db.lastImportStats,
  };
  await writeJsonAtomic(WISSEN_TICKETS_DB_PATH, next);
  return next;
}
