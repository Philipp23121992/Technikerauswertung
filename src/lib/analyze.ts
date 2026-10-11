import type { ColumnKind, CsvRow, SortState, TechnicianSummary } from "./types";

const TECHNICIAN_ALIASES = [
  "bearbeiter",
  "techniker",
  "technician",
  "mitarbeiter",
  "monteur",
  "zugewiesenan",
  "zugewiesen",
  "assignee",
  "owner",
  "zustaendig",
  "zuständig",
  "servicetechniker",
  "fieldtechnician",
  "assignedto",
  "technikername",
  "bearbeitername",
  // Nur exakt matchen – sonst trifft „name“ z. B. auf „Kundenname“
  "name",
];

/** Kurz-Aliase nur bei exakter Spaltenübereinstimmung, nie als Teilstring. */
const EXACT_ONLY_ALIASES = new Set(["name", "tag", "day", "date", "zeit", "termin"]);

const DURATION_ALIASES = [
  "dauer",
  "dauer_min",
  "minuten",
  "zeit",
  "stunden",
  "hours",
  "duration",
];

export function parseGermanNumber(value: string): number | null {
  const cleaned = value.trim().replace(/\s/g, "");
  if (!cleaned) return null;

  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.replace(/,/g, "");

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function detectColumnKind(values: string[]): ColumnKind {
  const nonEmpty = values.filter((value) => value.trim().length > 0);
  if (nonEmpty.length === 0) return "text";

  const numericHits = nonEmpty.filter((value) => parseGermanNumber(value) !== null).length;
  if (numericHits / nonEmpty.length >= 0.8) return "number";

  const dateHits = nonEmpty.filter((value) => !Number.isNaN(Date.parse(value))).length;
  if (dateHits / nonEmpty.length >= 0.8) return "date";

  return "text";
}

function normalizeColumnKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[\s_-]+/g, "");
}

export function findBestColumn(
  headers: string[],
  aliases: string[],
  exclude: string | null = null,
): string | null {
  const skip = exclude ? normalizeColumnKey(exclude) : "";
  const normalized = headers
    .map((header) => ({
      header,
      key: normalizeColumnKey(header),
    }))
    .filter((item) => !skip || item.key !== skip);

  // 1) Exakte Treffer (Alias-Reihenfolge behalten)
  for (const alias of aliases) {
    const aliasKey = normalizeColumnKey(alias);
    const exact = normalized.find((item) => item.key === aliasKey);
    if (exact) return exact.header;
  }

  // 2) Teiltreffer: längere Aliase zuerst, Kurz-Aliase nie als Substring
  const partialAliases = [...aliases]
    .filter((alias) => !EXACT_ONLY_ALIASES.has(normalizeColumnKey(alias)))
    .sort((a, b) => normalizeColumnKey(b).length - normalizeColumnKey(a).length);

  for (const alias of partialAliases) {
    const aliasKey = normalizeColumnKey(alias);
    if (aliasKey.length < 4) continue;
    const match = normalized.find((item) => item.key.includes(aliasKey));
    if (match) return match.header;
  }

  return null;
}

export function findTechnicianColumn(headers: string[]): string | null {
  return findBestColumn(headers, TECHNICIAN_ALIASES);
}

export function findNumericColumns(headers: string[], rows: CsvRow[]): string[] {
  return headers.filter((header) => {
    const sample = rows.slice(0, 50).map((row) => row[header] ?? "");
    const kind = detectColumnKind(sample);
    if (kind === "number") return true;
    const key = header.toLowerCase();
    return DURATION_ALIASES.some((alias) => key.includes(alias));
  });
}

export function filterRows(rows: CsvRow[], query: string): CsvRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;

  return rows.filter((row) =>
    Object.values(row).some((value) => value.toLowerCase().includes(needle)),
  );
}

export function sortRows(rows: CsvRow[], sort: SortState): CsvRow[] {
  if (!sort) return rows;

  const { column, direction } = sort;
  const factor = direction === "asc" ? 1 : -1;

  return [...rows].sort((a, b) => {
    const left = a[column] ?? "";
    const right = b[column] ?? "";

    const leftNum = parseGermanNumber(left);
    const rightNum = parseGermanNumber(right);

    if (leftNum !== null && rightNum !== null) {
      return (leftNum - rightNum) * factor;
    }

    return left.localeCompare(right, "de", { sensitivity: "base", numeric: true }) * factor;
  });
}

export function summarizeByTechnician(
  rows: CsvRow[],
  technicianColumn: string | null,
  numericColumns: string[],
): TechnicianSummary[] {
  if (!technicianColumn) return [];

  const map = new Map<string, TechnicianSummary>();

  for (const row of rows) {
    const name = (row[technicianColumn] ?? "").trim() || "Unbekannt";
    const current = map.get(name) ?? {
      name,
      count: 0,
      numericTotals: Object.fromEntries(numericColumns.map((column) => [column, 0])),
    };

    current.count += 1;
    for (const column of numericColumns) {
      const value = parseGermanNumber(row[column] ?? "");
      if (value !== null) {
        current.numericTotals[column] = (current.numericTotals[column] ?? 0) + value;
      }
    }

    map.set(name, current);
  }

  return [...map.values()].sort((a, b) => b.count - a.count);
}

export function uniqueValues(rows: CsvRow[], column: string): string[] {
  const values = new Set<string>();
  for (const row of rows) {
    const value = (row[column] ?? "").trim();
    if (value) values.add(value);
  }
  return [...values].sort((a, b) => a.localeCompare(b, "de"));
}
