import { promises as fs } from "fs";
import path from "path";
import { writeJsonAtomic } from "@/lib/atomic-write";
import { cleanupOrphanedInvoiceFiles } from "./files";
import {
  createEmptyPartnerRechnungenDb,
  normalizeInvoice,
  type PartnerInvoice,
  type PartnerRechnungenDb,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
export const PARTNER_RECHNUNGEN_DB_PATH = path.join(DATA_DIR, "partner-rechnungen-db.json");

export async function readPartnerRechnungenDb(): Promise<PartnerRechnungenDb> {
  try {
    const raw = await fs.readFile(PARTNER_RECHNUNGEN_DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<PartnerRechnungenDb>;
    if (parsed?.version !== 1 || !Array.isArray(parsed.invoices)) {
      return createEmptyPartnerRechnungenDb();
    }
    const invoices = parsed.invoices
      .map((item, index) => normalizeInvoice(item as Partial<PartnerInvoice>, index))
      .filter((item): item is PartnerInvoice => Boolean(item));
    return { version: 1, invoices };
  } catch {
    return createEmptyPartnerRechnungenDb();
  }
}

export async function writePartnerRechnungenDb(
  db: PartnerRechnungenDb,
): Promise<PartnerRechnungenDb> {
  const invoices = db.invoices
    .map((item, index) => normalizeInvoice(item, index))
    .filter((item): item is PartnerInvoice => Boolean(item));
  const next: PartnerRechnungenDb = { version: 1, invoices };
  await writeJsonAtomic(PARTNER_RECHNUNGEN_DB_PATH, next);
  await cleanupOrphanedInvoiceFiles(invoices.map((invoice) => invoice.id));
  return next;
}
