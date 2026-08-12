import { findBestColumn, findTechnicianColumn, parseGermanNumber } from "./analyze";
import { toDateInputValue } from "./tracker";
import type { Technician, TechnicianRole } from "./tracker-types";
import { ROLE_OPTIONS, ticketKey } from "./tracker-types";
import type { CsvRow, ImportedDataset } from "./types";

export const PARTNER_TECH_ID = "partner-lks";
export const PARTNER_TECH_NAME = "Partner / LKS Partner";

const DATE_ALIASES = [
  "gelöstam",
  "geloestam",
  "resolvedat",
  "resolved",
  "geschlossenam",
  "erledigtam",
  "zieltermin",
  "datum",
  "date",
  "tag",
  "day",
  "erstellt",
  "erstelltam",
  "ticketdatum",
  "einsatzdatum",
  "datumvon",
];

const COUNT_ALIASES = ["anzahl", "tickets", "anzahltickets", "menge", "count", "qty"];

export type TicketImportOptions = {
  /** Zusätzliche/priorisierte Datums-Aliase (zuerst geprüft). */
  dateAliases?: string[];
  /** unmatched → Partner-Bucket oder komplett ignorieren */
  unmatchedMode?: "partner" | "skip";
  dateColumnLabel?: string;
  /** Nur dieses Datum (YYYY-MM-DD) importieren; andere Zieltermine werden übersprungen. */
  onlyDate?: string;
  /** Alle Tickets unter diesem Datum (YYYY-MM-DD) buchen; CSV-Datum wird ignoriert. */
  forceDate?: string;
};

export function normalizePersonName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Erzeugt Match-Keys für „Vorname Nachname“ und CSV-Format „Nachname, Vorname“. */
export function personNameKeys(name: string): string[] {
  const keys = new Set<string>();
  const direct = normalizePersonName(name);
  if (direct) keys.add(direct);

  const parts = name
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 2) {
    const flipped = normalizePersonName(`${parts[1]} ${parts[0]}`);
    const sameOrder = normalizePersonName(`${parts[0]} ${parts[1]}`);
    if (flipped) keys.add(flipped);
    if (sameOrder) keys.add(sameOrder);
  }

  return [...keys];
}

export function parseFlexibleDate(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const de = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (de) {
    const day = Number(de[1]);
    const month = Number(de[2]);
    let year = Number(de[3]);
    if (year < 100) year += 2000;
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return toDateInputValue(date);
    }
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return toDateInputValue(parsed);
  }

  return null;
}

export function findDateColumn(
  headers: string[],
  preferredAliases: string[] = DATE_ALIASES,
): string | null {
  return findBestColumn(headers, preferredAliases);
}

export function findCountColumn(headers: string[]): string | null {
  return findBestColumn(headers, COUNT_ALIASES);
}

export type ImportPersonSummary = {
  csvName: string;
  tickets: number;
  technicianId: string | null;
  technicianName: string;
  role: TechnicianRole | "partner-bucket";
  roleLabel: string;
  matched: boolean;
};

export type TicketImportResult = {
  tickets: Record<string, number>;
  matchedRows: number;
  partnerRows: number;
  skippedRows: number;
  unmatchedSkippedRows: number;
  dateFilteredRows: number;
  onlyDate: string | null;
  /** CSV-Datumsspalte (z. B. Gelöst am) wird ignoriert; Buchung auf onlyDate. */
  ignoreCsvDate: boolean;
  partnerNeeded: boolean;
  unmatchedMode: "partner" | "skip";
  techColumn: string;
  dateColumn: string | null;
  dateColumnLabel: string;
  totalRows: number;
  dateFrom: string | null;
  dateTo: string | null;
  matchedPeople: ImportPersonSummary[];
  unmatchedPeople: ImportPersonSummary[];
  byTechnicianTotals: {
    technicianId: string;
    technicianName: string;
    roleLabel: string;
    tickets: number;
  }[];
};

function roleLabel(role: TechnicianRole | "partner-bucket"): string {
  if (role === "partner-bucket") return "Partner / LKS Partner";
  return ROLE_OPTIONS.find((item) => item.id === role)?.label ?? role;
}

function buildTechnicianLookup(technicians: Technician[]): Map<string, Technician> {
  const byKey = new Map<string, Technician>();

  for (const tech of technicians) {
    if (tech.id === PARTNER_TECH_ID) continue;
    for (const key of personNameKeys(tech.name)) {
      const existing = byKey.get(key);
      if (!existing) byKey.set(key, tech);
    }
  }

  return byKey;
}

export function matchTechnicianByName(
  csvName: string,
  lookup: Map<string, Technician>,
): Technician | null {
  for (const key of personNameKeys(csvName)) {
    const hit = lookup.get(key);
    if (hit) return hit;
  }
  return null;
}

export function buildTicketImport(
  dataset: ImportedDataset,
  technicians: Technician[],
  options: TicketImportOptions = {},
): TicketImportResult {
  const unmatchedMode = options.unmatchedMode ?? "partner";
  const dateAliases = [...(options.dateAliases ?? []), ...DATE_ALIASES];
  const dateColumnLabel = options.dateColumnLabel ?? "Gelöst am";
  const forceDate = options.forceDate ?? null;
  const onlyDate = options.onlyDate ?? forceDate ?? null;
  const ignoreCsvDate = Boolean(forceDate);

  const techCol = findTechnicianColumn(dataset.headers);
  const dateCol = ignoreCsvDate ? null : findDateColumn(dataset.headers, dateAliases);
  if (!techCol || (!dateCol && !forceDate)) {
    throw new Error(
      forceDate
        ? "CSV braucht eine Spalte für Bearbeiter/Techniker."
        : `CSV braucht Spalten für Bearbeiter/Techniker und „${dateColumnLabel}“ (Datum).`,
    );
  }

  const countCol = findCountColumn(dataset.headers);
  const lookup = buildTechnicianLookup(technicians);

  const tickets: Record<string, number> = {};
  const personStats = new Map<
    string,
    {
      csvName: string;
      tickets: number;
      technician: Technician | null;
    }
  >();

  let matchedRows = 0;
  let partnerRows = 0;
  let skippedRows = 0;
  let unmatchedSkippedRows = 0;
  let dateFilteredRows = 0;
  let dateFrom: string | null = null;
  let dateTo: string | null = null;

  for (const row of dataset.rows) {
    const techName = (row[techCol] ?? "").trim();
    const dateValue = forceDate
      ? forceDate
      : parseFlexibleDate(dateCol ? (row[dateCol] ?? "") : "");
    if (!techName || !dateValue) {
      skippedRows += 1;
      continue;
    }

    if (!ignoreCsvDate && onlyDate && dateValue !== onlyDate) {
      dateFilteredRows += 1;
      continue;
    }

    let amount = 1;
    if (countCol) {
      const parsed = parseGermanNumber(row[countCol] ?? "");
      amount = parsed !== null && parsed > 0 ? parsed : 1;
    }

    const matched = matchTechnicianByName(techName, lookup);
    if (!matched) {
      const personKey = `unmatched:${normalizePersonName(techName)}`;
      const existing = personStats.get(personKey);
      if (existing) existing.tickets += amount;
      else {
        personStats.set(personKey, {
          csvName: techName,
          tickets: amount,
          technician: null,
        });
      }

      if (unmatchedMode === "skip") {
        unmatchedSkippedRows += 1;
        continue;
      }

      partnerRows += 1;
      const key = ticketKey(PARTNER_TECH_ID, dateValue);
      tickets[key] = (tickets[key] ?? 0) + amount;
      if (!dateFrom || dateValue < dateFrom) dateFrom = dateValue;
      if (!dateTo || dateValue > dateTo) dateTo = dateValue;
      continue;
    }

    matchedRows += 1;
    const key = ticketKey(matched.id, dateValue);
    tickets[key] = (tickets[key] ?? 0) + amount;

    if (!dateFrom || dateValue < dateFrom) dateFrom = dateValue;
    if (!dateTo || dateValue > dateTo) dateTo = dateValue;

    const existing = personStats.get(matched.id);
    if (existing) existing.tickets += amount;
    else {
      personStats.set(matched.id, {
        csvName: matched.name,
        tickets: amount,
        technician: matched,
      });
    }
  }

  const matchedPeople: ImportPersonSummary[] = [];
  const unmatchedPeople: ImportPersonSummary[] = [];
  const totalsMap = new Map<
    string,
    { technicianId: string; technicianName: string; roleLabel: string; tickets: number }
  >();

  for (const entry of personStats.values()) {
    if (entry.technician) {
      matchedPeople.push({
        csvName: entry.csvName,
        tickets: entry.tickets,
        technicianId: entry.technician.id,
        technicianName: entry.technician.name,
        role: entry.technician.role,
        roleLabel: roleLabel(entry.technician.role),
        matched: true,
      });
      const current = totalsMap.get(entry.technician.id);
      if (current) current.tickets += entry.tickets;
      else {
        totalsMap.set(entry.technician.id, {
          technicianId: entry.technician.id,
          technicianName: entry.technician.name,
          roleLabel: roleLabel(entry.technician.role),
          tickets: entry.tickets,
        });
      }
    } else {
      unmatchedPeople.push({
        csvName: entry.csvName,
        tickets: entry.tickets,
        technicianId: null,
        technicianName:
          unmatchedMode === "skip" ? "Nicht berücksichtigt" : PARTNER_TECH_NAME,
        role: "partner-bucket",
        roleLabel:
          unmatchedMode === "skip" ? "Nicht berücksichtigt" : roleLabel("partner-bucket"),
        matched: false,
      });
    }
  }

  if (unmatchedMode === "partner" && partnerRows > 0) {
    totalsMap.set(PARTNER_TECH_ID, {
      technicianId: PARTNER_TECH_ID,
      technicianName: PARTNER_TECH_NAME,
      roleLabel: roleLabel("partner-bucket"),
      tickets: unmatchedPeople.reduce((sum, row) => sum + row.tickets, 0),
    });
  }

  matchedPeople.sort(
    (a, b) => b.tickets - a.tickets || a.technicianName.localeCompare(b.technicianName, "de"),
  );
  unmatchedPeople.sort(
    (a, b) => b.tickets - a.tickets || a.csvName.localeCompare(b.csvName, "de"),
  );

  return {
    tickets,
    matchedRows,
    partnerRows,
    skippedRows,
    unmatchedSkippedRows,
    dateFilteredRows,
    onlyDate,
    ignoreCsvDate,
    partnerNeeded: unmatchedMode === "partner" && partnerRows > 0,
    unmatchedMode,
    techColumn: techCol,
    dateColumn: dateCol,
    dateColumnLabel: ignoreCsvDate ? "Aktuelles Datum" : dateColumnLabel,
    totalRows: dataset.rows.length,
    dateFrom,
    dateTo,
    matchedPeople,
    unmatchedPeople,
    byTechnicianTotals: [...totalsMap.values()].sort(
      (a, b) => b.tickets - a.tickets || a.technicianName.localeCompare(b.technicianName, "de"),
    ),
  };
}

export function summarizeImportRows(rows: CsvRow[], techCol: string): number {
  return rows.filter((row) => (row[techCol] ?? "").trim().length > 0).length;
}
