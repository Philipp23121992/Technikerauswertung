import Papa from "papaparse";
import { findBestColumn } from "@/lib/analyze";
import {
  parseFlexibleDate,
  personNameKeys,
  normalizePersonName,
} from "@/lib/ticket-import";
import type { Technician } from "@/lib/tracker-types";
import type { CsvRow } from "@/lib/types";
import {
  vacationKindLabel,
  NO_REPRESENTATIVE,
  type VacationKind,
  type VacationRequest,
} from "./types";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_ROWS = 3000;
const PREVIEW_LIMIT = 12;

const NAME_ALIASES = [
  "name",
  "antragsteller",
  "antragssteller",
  "techniker",
  "mitarbeiter",
  "person",
];

const START_ALIASES = [
  "urlaubstart",
  "start",
  "von",
  "beginn",
  "datefrom",
  "startdatum",
];

const END_ALIASES = [
  "urlaubende",
  "ende",
  "bis",
  "end",
  "dateto",
  "enddatum",
];

const STATUS_ALIASES = ["status", "art", "typ", "kategorie", "arturlaub"];

const REPRESENTATIVE_ALIASES = [
  "dropdown",
  "drop-down",
  "vertretung",
  "vertreter",
  "representative",
  "vertretungdurch",
];

export type UrlaubCsvColumns = {
  name: string | null;
  start: string | null;
  end: string | null;
  status: string | null;
  representative: string | null;
};

export type UrlaubCsvReadyRow = {
  rowNumber: number;
  applicantName: string;
  applicantMatched: boolean;
  representativeName: string;
  representativeKnown: boolean;
  dateFrom: string;
  dateTo: string;
  kind: VacationKind;
  statusRaw: string;
};

export type UrlaubCsvSkippedRow = {
  rowNumber: number;
  name: string;
  reason: string;
};

export type UrlaubCsvAnalysis = {
  fileName: string;
  totalRows: number;
  columns: UrlaubCsvColumns;
  missingRequired: string[];
  ready: UrlaubCsvReadyRow[];
  skipped: UrlaubCsvSkippedRow[];
  duplicatesInFile: number;
  alreadyStored: number;
  urlaubCount: number;
  overtimeCount: number;
  absentCount: number;
  oneDayCount: number;
  newRepresentatives: string[];
  unmatchedApplicants: string[];
};

function detectDelimiter(sample: string): string {
  const firstLine = sample.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "";
  const candidates = [";", ",", "\t", "|"] as const;
  let best: string = ";";
  let bestCount = -1;
  for (const delimiter of candidates) {
    const count = firstLine.split(delimiter).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = delimiter;
    }
  }
  return best;
}

function normalizeHeader(value: string, index: number): string {
  const cleaned = value.replace(/^\uFEFF/, "").trim();
  return cleaned.length > 0 ? cleaned : `Spalte ${index + 1}`;
}

function uniqueHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((header) => {
    const count = seen.get(header) ?? 0;
    seen.set(header, count + 1);
    return count === 0 ? header : `${header} (${count + 1})`;
  });
}

function decodeCsvBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

function parseCsvRows(text: string): { headers: string[]; rows: CsvRow[] } {
  const delimiter = detectDelimiter(text);
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    delimiter,
    skipEmptyLines: "greedy",
    transformHeader: (header, index) => normalizeHeader(header, index),
  });

  const rawHeaders =
    parsed.meta.fields?.map((header, index) => normalizeHeader(header, index)) ?? [];
  const headers = uniqueHeaders(rawHeaders);
  if (headers.length === 0) {
    throw new Error("Die Datei enthält keine Spaltenüberschriften.");
  }

  const rows: CsvRow[] = (parsed.data ?? [])
    .map((row) => {
      const normalized: CsvRow = {};
      for (const header of headers) {
        const value = row[header];
        normalized[header] = value == null ? "" : String(value).trim();
      }
      return normalized;
    })
    .filter((row) => Object.values(row).some((value) => value.length > 0));

  if (rows.length === 0) {
    throw new Error("Die Datei enthält keine Datenzeilen.");
  }

  return { headers, rows };
}

function rosterFromTechnicians(technicians: Technician[]): string[] {
  return [...new Set(technicians.map((tech) => tech.name.trim()).filter(Boolean))];
}

/** Teiltreffer: „Apel“ → „Leonard Apel“, nur wenn eindeutig. */
export function matchRosterName(
  csvName: string,
  roster: readonly string[],
): { name: string; matched: boolean } {
  const raw = csvName.trim();
  const needle = normalizePersonName(raw);
  if (!needle) return { name: raw, matched: false };

  const exactKeys = new Set(personNameKeys(raw));
  const exactHits = roster.filter((full) =>
    personNameKeys(full).some((key) => exactKeys.has(key)),
  );
  if (exactHits.length === 1) {
    return { name: exactHits[0], matched: true };
  }

  const scored: { name: string; score: number }[] = [];
  for (const full of roster) {
    const tokens = normalizePersonName(full).split(" ").filter(Boolean);
    if (tokens.length === 0) continue;
    const last = tokens[tokens.length - 1] ?? "";
    const first = tokens[0] ?? "";
    const joined = tokens.join(" ");

    if (last === needle) {
      scored.push({ name: full, score: 100 });
      continue;
    }
    if (tokens.includes(needle)) {
      scored.push({ name: full, score: 85 });
      continue;
    }
    if (needle.length >= 3) {
      if (last.startsWith(needle) || (needle.startsWith(last) && last.length >= 3)) {
        scored.push({ name: full, score: 70 });
        continue;
      }
      if (first.startsWith(needle) || tokens.some((token) => token.startsWith(needle))) {
        scored.push({ name: full, score: 55 });
        continue;
      }
      if (tokens.some((token) => token.includes(needle) || (needle.includes(token) && token.length >= 3))) {
        scored.push({ name: full, score: 40 });
        continue;
      }
      if (joined.includes(needle)) {
        scored.push({ name: full, score: 30 });
      }
    }
  }

  if (scored.length === 0) return { name: raw, matched: false };
  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "de"));
  const bestScore = scored[0].score;
  const top = scored.filter((item) => item.score === bestScore);
  const uniqueNames = [...new Set(top.map((item) => item.name))];
  if (uniqueNames.length !== 1) return { name: raw, matched: false };
  return { name: uniqueNames[0], matched: true };
}

function resolvePersonName(
  csvName: string,
  roster: readonly string[],
): { name: string; matched: boolean } {
  return matchRosterName(csvName, roster);
}

function isEmptyRepresentative(value: string): boolean {
  const key = normalizePersonName(value);
  return (
    !key ||
    key === normalizePersonName(NO_REPRESENTATIVE) ||
    key === "keine" ||
    key === "keiner" ||
    key === "ohne" ||
    key === "ohnevertretung" ||
    key === "n a" ||
    key === "na" ||
    key === "none" ||
    key === "-"
  );
}

function resolveRepresentativeName(
  csvRep: string,
  roster: readonly string[],
): { name: string; matched: boolean } {
  if (isEmptyRepresentative(csvRep)) {
    return { name: NO_REPRESENTATIVE, matched: true };
  }
  return matchRosterName(csvRep, roster);
}

function parseCsvDate(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;

  const flexible = parseFlexibleDate(raw);
  if (flexible) return flexible;

  const serial = Number(raw.replace(",", "."));
  if (Number.isFinite(serial) && serial >= 20000 && serial <= 80000) {
    const utc = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
    const date = new Date(utc);
    if (!Number.isNaN(date.getTime())) {
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
    }
  }

  return null;
}

export function parseVacationKind(value: string): VacationKind | null {
  const key = value
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "");

  if (!key) return "urlaub";
  if (
    key.includes("ueberstund") ||
    key.includes("overtime") ||
    key === "azk" ||
    key.includes("zeitausgleich")
  ) {
    return "ueberstunden";
  }
  if (
    key.includes("schulung") ||
    key.includes("abwesend") ||
    key.includes("training") ||
    key.includes("seminar") ||
    key.includes("fortbildung") ||
    key.includes("weiterbildung") ||
    key.includes("absent")
  ) {
    return "abwesend";
  }
  if (
    key.includes("urlaub") ||
    key.includes("vacation") ||
    key.includes("holiday") ||
    key === "frei"
  ) {
    return "urlaub";
  }
  return null;
}

export function detectUrlaubColumns(headers: string[]): UrlaubCsvColumns {
  return {
    name: findBestColumn(headers, NAME_ALIASES),
    start: findBestColumn(headers, START_ALIASES),
    end: findBestColumn(headers, END_ALIASES),
    status: findBestColumn(headers, STATUS_ALIASES),
    representative: findBestColumn(headers, REPRESENTATIVE_ALIASES),
  };
}

export function vacationDedupeKey(item: {
  applicantName: string;
  dateFrom: string;
  dateTo: string;
  kind: VacationKind;
}): string {
  return [
    item.applicantName.trim().toLowerCase(),
    item.dateFrom,
    item.dateTo,
    item.kind,
  ].join("|");
}

export async function analyzeUrlaubCsvFile(input: {
  file: File;
  technicians: Technician[];
  existing: VacationRequest[];
}): Promise<UrlaubCsvAnalysis> {
  if (input.file.size > MAX_FILE_BYTES) {
    throw new Error("Die CSV-Datei ist größer als 8 MB. Bitte die Datei aufteilen.");
  }

  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const { headers, rows } = parseCsvRows(decodeCsvBytes(bytes));
  if (rows.length > MAX_ROWS) {
    throw new Error(
      `Die Datei hat ${rows.length} Zeilen. Maximal ${MAX_ROWS} Zeilen pro Import.`,
    );
  }

  return analyzeUrlaubCsvRows({
    fileName: input.file.name,
    headers,
    rows,
    technicians: input.technicians,
    existing: input.existing,
  });
}

export function analyzeUrlaubCsvRows(input: {
  fileName: string;
  headers: string[];
  rows: CsvRow[];
  technicians: Technician[];
  existing: VacationRequest[];
}): UrlaubCsvAnalysis {
  const columns = detectUrlaubColumns(input.headers);
  const missingRequired: string[] = [];
  if (!columns.name) missingRequired.push("Name");
  if (!columns.start) missingRequired.push("Urlaub Start");

  const roster = [
    ...new Set([
      ...rosterFromTechnicians(input.technicians),
      ...input.existing.flatMap((item) => [item.applicantName, item.representativeName]),
    ]),
  ].filter(
    (name) =>
      name.trim().length > 0 &&
      name.trim().toLowerCase() !== NO_REPRESENTATIVE.toLowerCase(),
  );
  const existingKeys = new Set(
    input.existing.map((item) => vacationDedupeKey(item)),
  );
  const seenInFile = new Set<string>();

  const ready: UrlaubCsvReadyRow[] = [];
  const skipped: UrlaubCsvSkippedRow[] = [];
  let duplicatesInFile = 0;
  let alreadyStored = 0;

  if (missingRequired.length === 0 && columns.name && columns.start) {
    input.rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const csvName = (row[columns.name!] ?? "").trim();
      const csvStart = (row[columns.start!] ?? "").trim();
      const csvEnd = columns.end ? (row[columns.end] ?? "").trim() : "";
      const csvRep = columns.representative
        ? (row[columns.representative] ?? "").trim()
        : "";
      const csvStatus = columns.status ? (row[columns.status] ?? "").trim() : "";

      if (!csvName) {
        skipped.push({ rowNumber, name: "", reason: "Name fehlt" });
        return;
      }
      const dateFrom = parseCsvDate(csvStart);
      if (!dateFrom) {
        skipped.push({
          rowNumber,
          name: csvName,
          reason: `Ungültiges Startdatum: ${csvStart || "leer"}`,
        });
        return;
      }
      const dateTo = csvEnd ? parseCsvDate(csvEnd) : dateFrom;
      if (csvEnd && !dateTo) {
        skipped.push({
          rowNumber,
          name: csvName,
          reason: `Ungültiges Endedatum: ${csvEnd}`,
        });
        return;
      }
      if (!dateTo || dateTo < dateFrom) {
        skipped.push({
          rowNumber,
          name: csvName,
          reason: "Ende liegt vor dem Start",
        });
        return;
      }

      const kind = parseVacationKind(csvStatus);
      if (!kind) {
        skipped.push({
          rowNumber,
          name: csvName,
          reason: `Status nicht erkannt: ${csvStatus}`,
        });
        return;
      }

      const applicant = resolvePersonName(csvName, roster);
      const representative = resolveRepresentativeName(csvRep, roster);
      if (
        representative.name !== NO_REPRESENTATIVE &&
        applicant.name === representative.name
      ) {
        skipped.push({
          rowNumber,
          name: csvName,
          reason: "Antragsteller und Vertretung sind identisch",
        });
        return;
      }

      const key = vacationDedupeKey({
        applicantName: applicant.name,
        dateFrom,
        dateTo,
        kind,
      });
      if (seenInFile.has(key)) {
        duplicatesInFile += 1;
        skipped.push({
          rowNumber,
          name: applicant.name,
          reason: "Doppelte Zeile in der CSV",
        });
        return;
      }
      seenInFile.add(key);
      if (existingKeys.has(key)) {
        alreadyStored += 1;
        skipped.push({
          rowNumber,
          name: applicant.name,
          reason: "Bereits in der App vorhanden",
        });
        return;
      }

      ready.push({
        rowNumber,
        applicantName: applicant.name,
        applicantMatched: applicant.matched,
        representativeName: representative.name,
        representativeKnown: representative.matched,
        dateFrom,
        dateTo,
        kind,
        statusRaw: csvStatus || vacationKindLabel(kind),
      });
    });
  }

  const newRepresentatives = [
    ...new Set(
      ready
        .filter((row) => !row.representativeKnown)
        .map((row) => row.representativeName),
    ),
  ].sort((a, b) => a.localeCompare(b, "de"));

  const unmatchedApplicants = [
    ...new Set(
      ready.filter((row) => !row.applicantMatched).map((row) => row.applicantName),
    ),
  ].sort((a, b) => a.localeCompare(b, "de"));

  return {
    fileName: input.fileName,
    totalRows: input.rows.length,
    columns,
    missingRequired,
    ready,
    skipped,
    duplicatesInFile,
    alreadyStored,
    urlaubCount: ready.filter((row) => row.kind === "urlaub").length,
    overtimeCount: ready.filter((row) => row.kind === "ueberstunden").length,
    absentCount: ready.filter((row) => row.kind === "abwesend").length,
    oneDayCount: ready.filter((row) => row.dateFrom === row.dateTo).length,
    newRepresentatives,
    unmatchedApplicants,
  };
}

export function previewReadyRows(analysis: UrlaubCsvAnalysis): UrlaubCsvReadyRow[] {
  return analysis.ready.slice(0, PREVIEW_LIMIT);
}

export function skippedReasonCounts(
  skipped: UrlaubCsvSkippedRow[],
): { reason: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of skipped) {
    counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason, "de"));
}
