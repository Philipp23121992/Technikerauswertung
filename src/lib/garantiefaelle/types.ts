import { createId } from "@/lib/id";

export const WARRANTY_CATEGORIES = [
  "Hardware",
  "Software",
  "Onsite",
  "Remote",
  "Sonstiges",
] as const;

export type WarrantyCategory = (typeof WARRANTY_CATEGORIES)[number];

export type ManufacturerPriceRule = {
  id: string;
  manufacturer: string;
  category: WarrantyCategory;
  amount: number;
  validFrom: string | null;
  validTo: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WarrantyCase = {
  id: string;
  caseDate: string;
  manufacturer: string;
  partner: string;
  category: WarrantyCategory;
  reference: string;
  manufacturerAmount: number;
  partnerAmount: number;
  notes: string;
  invoiceFileName: string;
  createdAt: string;
  updatedAt: string;
};

export type GarantiefaelleDb = {
  version: 1;
  cases: WarrantyCase[];
  manufacturerPrices: ManufacturerPriceRule[];
};

export function createEmptyGarantiefaelleDb(): GarantiefaelleDb {
  return { version: 1, cases: [], manufacturerPrices: [] };
}

function normalizeIsoDate(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function normalizeAmount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value === "string") {
    const cleaned = value.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }
  return 0;
}

function isCategory(value: unknown): value is WarrantyCategory {
  return typeof value === "string" && (WARRANTY_CATEGORIES as readonly string[]).includes(value);
}

export function warrantyProfit(item: Pick<WarrantyCase, "manufacturerAmount" | "partnerAmount">): number {
  return item.manufacturerAmount - item.partnerAmount;
}

export function formatEuro(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

export function normalizeWarrantyCase(raw: Partial<WarrantyCase>, index = 0): WarrantyCase | null {
  if (!raw?.id || typeof raw.id !== "string") return null;
  const caseDate = normalizeIsoDate(raw.caseDate);
  const manufacturer = typeof raw.manufacturer === "string" ? raw.manufacturer.trim() : "";
  const partner = typeof raw.partner === "string" ? raw.partner.trim() : "";
  if (!caseDate || !manufacturer || !partner) return null;

  const category = isCategory(raw.category) ? raw.category : "Sonstiges";
  const now = new Date().toISOString();

  return {
    id: raw.id,
    caseDate,
    manufacturer,
    partner,
    category,
    reference: typeof raw.reference === "string" ? raw.reference.trim() : "",
    manufacturerAmount: normalizeAmount(raw.manufacturerAmount),
    partnerAmount: normalizeAmount(raw.partnerAmount),
    notes: typeof raw.notes === "string" ? raw.notes.trim() : "",
    invoiceFileName: typeof raw.invoiceFileName === "string" ? raw.invoiceFileName.trim() : "",
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : now,
  };
}

export function normalizeManufacturerPriceRule(
  raw: Partial<ManufacturerPriceRule>,
): ManufacturerPriceRule | null {
  if (!raw?.id || typeof raw.id !== "string") return null;
  const manufacturer = typeof raw.manufacturer === "string" ? raw.manufacturer.trim() : "";
  if (!manufacturer) return null;
  const category = isCategory(raw.category) ? raw.category : "Sonstiges";
  const now = new Date().toISOString();

  return {
    id: raw.id,
    manufacturer,
    category,
    amount: normalizeAmount(raw.amount),
    validFrom: normalizeIsoDate(raw.validFrom),
    validTo: normalizeIsoDate(raw.validTo),
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : now,
  };
}

export function createWarrantyCase(input: {
  caseDate: string;
  manufacturer: string;
  partner: string;
  category?: WarrantyCategory;
  reference?: string;
  manufacturerAmount?: number;
  partnerAmount?: number;
  notes?: string;
  invoiceFileName?: string;
}): WarrantyCase {
  const now = new Date().toISOString();
  return {
    id: createId("gar"),
    caseDate: input.caseDate,
    manufacturer: input.manufacturer.trim(),
    partner: input.partner.trim(),
    category: input.category ?? "Sonstiges",
    reference: input.reference?.trim() ?? "",
    manufacturerAmount: normalizeAmount(input.manufacturerAmount ?? 0),
    partnerAmount: normalizeAmount(input.partnerAmount ?? 0),
    notes: input.notes?.trim() ?? "",
    invoiceFileName: input.invoiceFileName?.trim() ?? "",
    createdAt: now,
    updatedAt: now,
  };
}

export function createManufacturerPriceRule(input: {
  manufacturer: string;
  category: WarrantyCategory;
  amount: number;
  validFrom?: string | null;
  validTo?: string | null;
}): ManufacturerPriceRule {
  const now = new Date().toISOString();
  return {
    id: createId("mpr"),
    manufacturer: input.manufacturer.trim(),
    category: input.category,
    amount: normalizeAmount(input.amount),
    validFrom: input.validFrom ?? null,
    validTo: input.validTo ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export function lookupManufacturerPrice(
  rules: ManufacturerPriceRule[],
  manufacturer: string,
  category: WarrantyCategory,
  caseDate: string,
): number | null {
  const needle = manufacturer.trim().toLowerCase();
  const hit = rules.find((rule) => {
    if (rule.manufacturer.trim().toLowerCase() !== needle) return false;
    if (rule.category !== category) return false;
    if (rule.validFrom && caseDate < rule.validFrom) return false;
    if (rule.validTo && caseDate > rule.validTo) return false;
    return true;
  });
  return hit ? hit.amount : null;
}
