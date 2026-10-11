import { promises as fs } from "fs";
import path from "path";
import { writeJsonAtomic } from "@/lib/atomic-write";
import {
  createEmptyGarantiefaelleDb,
  normalizeManufacturerPriceRule,
  normalizeWarrantyCase,
  type GarantiefaelleDb,
  type ManufacturerPriceRule,
  type WarrantyCase,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
export const GARANTIEFAELLE_DB_PATH = path.join(DATA_DIR, "garantiefaelle-db.json");

export async function readGarantiefaelleDb(): Promise<GarantiefaelleDb> {
  try {
    const raw = await fs.readFile(GARANTIEFAELLE_DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<GarantiefaelleDb>;
    if (parsed?.version !== 1) return createEmptyGarantiefaelleDb();

    const cases = Array.isArray(parsed.cases)
      ? parsed.cases
          .map((item, index) => normalizeWarrantyCase(item as Partial<WarrantyCase>, index))
          .filter((item): item is WarrantyCase => Boolean(item))
      : [];

    const manufacturerPrices = Array.isArray(parsed.manufacturerPrices)
      ? parsed.manufacturerPrices
          .map((item) => normalizeManufacturerPriceRule(item as Partial<ManufacturerPriceRule>))
          .filter((item): item is ManufacturerPriceRule => Boolean(item))
      : [];

    return { version: 1, cases, manufacturerPrices };
  } catch {
    return createEmptyGarantiefaelleDb();
  }
}

export async function writeGarantiefaelleDb(db: GarantiefaelleDb): Promise<GarantiefaelleDb> {
  const cases = db.cases
    .map((item, index) => normalizeWarrantyCase(item, index))
    .filter((item): item is WarrantyCase => Boolean(item));

  const manufacturerPrices = db.manufacturerPrices
    .map((item) => normalizeManufacturerPriceRule(item))
    .filter((item): item is ManufacturerPriceRule => Boolean(item));

  const next: GarantiefaelleDb = { version: 1, cases, manufacturerPrices };
  await writeJsonAtomic(GARANTIEFAELLE_DB_PATH, next);
  return next;
}
