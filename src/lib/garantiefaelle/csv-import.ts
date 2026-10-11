import { findBestColumn } from "@/lib/analyze";
import { parseFlexibleDate } from "@/lib/ticket-import";
import type { CsvRow } from "@/lib/types";
import {
  createWarrantyCase,
  lookupManufacturerPrice,
  normalizeAmount,
  type ManufacturerPriceRule,
  type WarrantyCase,
  type WarrantyCategory,
  WARRANTY_CATEGORIES,
} from "./types";

const PARTNER_ALIASES = ["partner", "partnername", "dienstleister", "firma"];
const MANUFACTURER_ALIASES = ["hersteller", "manufacturer", "brand"];
const DATE_ALIASES = ["datum", "date", "falldatum", "rechnungsdatum"];
const AMOUNT_ALIASES = ["betrag", "amount", "summe", "ausgaben", "rechnung", "netto", "brutto"];
const CATEGORY_ALIASES = ["kategorie", "category", "art", "typ"];
const REFERENCE_ALIASES = ["referenz", "reference", "fallnummer", "ticket", "auftrag", "rechnungsnummer"];

export type PartnerImportColumns = {
  partner: string | null;
  manufacturer: string | null;
  date: string | null;
  amount: string | null;
  category: string | null;
  reference: string | null;
};

export type PartnerImportReadyRow = {
  rowNumber: number;
  caseDate: string;
  manufacturer: string;
  partner: string;
  category: WarrantyCategory;
  reference: string;
  partnerAmount: number;
  manufacturerAmount: number;
};

export type PartnerImportSkippedRow = {
  rowNumber: number;
  reason: string;
};

export type PartnerImportAnalysis = {
  fileName: string;
  totalRows: number;
  columns: PartnerImportColumns;
  missingRequired: string[];
  ready: PartnerImportReadyRow[];
  skipped: PartnerImportSkippedRow[];
  duplicatesInFile: number;
  alreadyStored: number;
};

function detectColumns(headers: string[]): PartnerImportColumns {
  return {
    partner: findBestColumn(headers, PARTNER_ALIASES),
    manufacturer: findBestColumn(headers, MANUFACTURER_ALIASES),
    date: findBestColumn(headers, DATE_ALIASES),
    amount: findBestColumn(headers, AMOUNT_ALIASES),
    category: findBestColumn(headers, CATEGORY_ALIASES),
    reference: findBestColumn(headers, REFERENCE_ALIASES),
  };
}

function parseCategory(raw: string): WarrantyCategory {
  const needle = raw.trim().toLowerCase();
  const hit = WARRANTY_CATEGORIES.find((item) => item.toLowerCase() === needle);
  return hit ?? "Sonstiges";
}

function rowSignature(row: PartnerImportReadyRow): string {
  return [
    row.caseDate,
    row.partner.toLowerCase(),
    row.manufacturer.toLowerCase(),
    row.reference.toLowerCase(),
    String(row.partnerAmount),
  ].join("|");
}

function storedSignature(item: WarrantyCase): string {
  return [
    item.caseDate,
    item.partner.toLowerCase(),
    item.manufacturer.toLowerCase(),
    item.reference.toLowerCase(),
    String(item.partnerAmount),
  ].join("|");
}

export function analyzePartnerInvoiceRows(input: {
  fileName: string;
  headers: string[];
  rows: CsvRow[];
  manufacturerPrices: ManufacturerPriceRule[];
  existingCases: WarrantyCase[];
}): PartnerImportAnalysis {
  const columns = detectColumns(input.headers);
  const missingRequired = [
    !columns.partner ? "Partner" : null,
    !columns.date ? "Datum" : null,
    !columns.amount ? "Betrag" : null,
  ].filter(Boolean) as string[];

  const ready: PartnerImportReadyRow[] = [];
  const skipped: PartnerImportSkippedRow[] = [];
  const seen = new Set<string>();
  let duplicatesInFile = 0;

  input.rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const partner = columns.partner ? String(row[columns.partner] ?? "").trim() : "";
    const manufacturer = columns.manufacturer
      ? String(row[columns.manufacturer] ?? "").trim()
      : "Unbekannt";
    const dateRaw = columns.date ? String(row[columns.date] ?? "").trim() : "";
    const amountRaw = columns.amount ? String(row[columns.amount] ?? "").trim() : "";
    const categoryRaw = columns.category ? String(row[columns.category] ?? "").trim() : "";
    const reference = columns.reference ? String(row[columns.reference] ?? "").trim() : "";

    if (!partner || !dateRaw || !amountRaw) {
      skipped.push({ rowNumber, reason: "Partner, Datum oder Betrag fehlt." });
      return;
    }

    const caseDate = parseFlexibleDate(dateRaw);
    if (!caseDate) {
      skipped.push({ rowNumber, reason: `Ungültiges Datum: ${dateRaw}` });
      return;
    }

    const partnerAmount = normalizeAmount(amountRaw);
    if (partnerAmount <= 0) {
      skipped.push({ rowNumber, reason: "Betrag ist 0 oder ungültig." });
      return;
    }

    const category = categoryRaw ? parseCategory(categoryRaw) : "Sonstiges";
    const manufacturerAmount =
      lookupManufacturerPrice(input.manufacturerPrices, manufacturer, category, caseDate) ?? 0;

    const entry: PartnerImportReadyRow = {
      rowNumber,
      caseDate,
      manufacturer,
      partner,
      category,
      reference,
      partnerAmount,
      manufacturerAmount,
    };

    const signature = rowSignature(entry);
    if (seen.has(signature)) {
      duplicatesInFile += 1;
      skipped.push({ rowNumber, reason: "Duplikat in der Datei." });
      return;
    }
    seen.add(signature);
    ready.push(entry);
  });

  const existing = new Set(input.existingCases.map(storedSignature));
  const alreadyStored = ready.filter((row) => existing.has(rowSignature(row))).length;

  return {
    fileName: input.fileName,
    totalRows: input.rows.length,
    columns,
    missingRequired,
    ready,
    skipped,
    duplicatesInFile,
    alreadyStored,
  };
}

export function partnerImportToCases(
  ready: PartnerImportReadyRow[],
  fileName: string,
  existingCases: WarrantyCase[],
): WarrantyCase[] {
  const existing = new Set(existingCases.map(storedSignature));
  return ready
    .filter((row) => !existing.has(rowSignature(row)))
    .map((row) =>
      createWarrantyCase({
        caseDate: row.caseDate,
        manufacturer: row.manufacturer,
        partner: row.partner,
        category: row.category,
        reference: row.reference,
        manufacturerAmount: row.manufacturerAmount,
        partnerAmount: row.partnerAmount,
        invoiceFileName: fileName,
      }),
    );
}
