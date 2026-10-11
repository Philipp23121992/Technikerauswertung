import { promises as fs } from "fs";
import path from "path";
import { writeJsonAtomic } from "@/lib/atomic-write";
import { cleanupOrphanedInvoiceFiles } from "./files";
import {
  createEmptyHpRechnungenDb,
  normalizeInvoice,
  type HpInvoice,
  type HpRechnungenDb,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
export const HP_RECHNUNGEN_DB_PATH = path.join(DATA_DIR, "hp-rechnungen-db.json");

export async function readHpRechnungenDb(): Promise<HpRechnungenDb> {
  try {
    const raw = await fs.readFile(HP_RECHNUNGEN_DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<HpRechnungenDb>;
    if (parsed?.version !== 1 || !Array.isArray(parsed.invoices)) {
      return createEmptyHpRechnungenDb();
    }
    const invoices = parsed.invoices
      .map((item, index) => normalizeInvoice(item as Partial<HpInvoice>, index))
      .filter((item): item is HpInvoice => Boolean(item));
    return { version: 1, invoices };
  } catch {
    return createEmptyHpRechnungenDb();
  }
}

export async function writeHpRechnungenDb(
  db: HpRechnungenDb,
): Promise<HpRechnungenDb> {
  const invoices = db.invoices
    .map((item, index) => normalizeInvoice(item, index))
    .filter((item): item is HpInvoice => Boolean(item));
  const next: HpRechnungenDb = { version: 1, invoices };
  await writeJsonAtomic(HP_RECHNUNGEN_DB_PATH, next);
  await cleanupOrphanedInvoiceFiles(invoices.map((invoice) => invoice.id));
  return next;
}
