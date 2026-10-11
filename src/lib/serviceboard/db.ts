import { promises as fs } from "fs";
import path from "path";
import { writeJsonAtomic } from "@/lib/atomic-write";
import {
  createEmptyServiceboardDb,
  mergeDueMailState,
  normalizeBoardCard,
  type BoardCard,
  type ServiceboardDb,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
export const SERVICEBOARD_DB_PATH = path.join(DATA_DIR, "serviceboard-db.json");

export async function readServiceboardDb(): Promise<ServiceboardDb> {
  try {
    const raw = await fs.readFile(SERVICEBOARD_DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<ServiceboardDb>;
    if (parsed?.version !== 1 || !Array.isArray(parsed.cards)) {
      return createEmptyServiceboardDb();
    }
    const cards = parsed.cards
      .map((item, index) => normalizeBoardCard(item as Partial<BoardCard>, index))
      .filter((item): item is BoardCard => Boolean(item));
    return { version: 1, cards };
  } catch {
    return createEmptyServiceboardDb();
  }
}

export async function writeServiceboardDb(
  db: ServiceboardDb,
): Promise<ServiceboardDb> {
  const previous = await readServiceboardDb();
  const prevById = new Map(previous.cards.map((card) => [card.id, card]));
  const cards = db.cards
    .map((item, index) => normalizeBoardCard(item, index))
    .filter((item): item is BoardCard => Boolean(item))
    .map((card) => mergeDueMailState(card, prevById.get(card.id)));
  const next: ServiceboardDb = { version: 1, cards };
  await writeJsonAtomic(SERVICEBOARD_DB_PATH, next);
  return next;
}
