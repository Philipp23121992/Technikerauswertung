import Papa from "papaparse";
import { findBestColumn } from "@/lib/analyze";
import { parseFlexibleDate } from "@/lib/ticket-import";
import type { CsvRow } from "@/lib/types";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type ReminderRhythm,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "./types";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_ROWS = 3000;
const PREVIEW_LIMIT = 12;

const TITLE_ALIASES = [
  "name",
  "titel",
  "title",
  "aufgabe",
  "task",
  "subject",
  "betreff",
  "aufgabentitel",
];

const PERSON_ALIASES = ["person", "persons", "mitarbeiter", "zugewiesen"];

const DESCRIPTION_ALIASES = [
  "beschreibung",
  "description",
  "details",
  "notizen",
  "notes",
  "notiz",
  "body",
  "kommentar",
  "bemerkung",
];

const STATUS_ALIASES = ["status", "zustand", "state", "fortschritt"];

const PRIORITY_ALIASES = [
  "prioritaet",
  "priority",
  "prio",
  "wichtigkeit",
  "dringlichkeit",
];

const DUE_ALIASES = [
  "faelligkeitsdatum",
  "faelligam",
  "faelligkeit",
  "faellig",
  "duedate",
  "due",
  "deadline",
  "zieltermin",
  "datum",
];

const REMINDER_ALIASES = [
  "erinnerung",
  "reminder",
  "rhythmus",
  "erinnerungsrhythmus",
];

const EMAIL_ALIASES = [
  "email",
  "e-mail",
  "mail",
  "notify",
  "benachrichtigung",
  "notifyemail",
];

export type AufgabenCsvColumns = {
  title: string | null;
  person: string | null;
  description: string | null;
  status: string | null;
  priority: string | null;
  dueDate: string | null;
  reminder: string | null;
  email: string | null;
};

export type AufgabenCsvReadyRow = {
  rowNumber: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  reminderRhythm: ReminderRhythm;
  notifyEmail: string;
};

export type AufgabenCsvSkippedRow = {
  rowNumber: number;
  title: string;
  reason: string;
};

export type AufgabenCsvAnalysis = {
  fileName: string;
  totalRows: number;
  columns: AufgabenCsvColumns;
  missingRequired: string[];
  ready: AufgabenCsvReadyRow[];
  skipped: AufgabenCsvSkippedRow[];
  duplicatesInFile: number;
  alreadyStored: number;
  openCount: number;
  doneCount: number;
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

function normKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "");
}

export function parseTaskStatus(value: string): TaskStatus {
  const key = normKey(value);
  if (!key) return "offen";
  for (const status of TASK_STATUSES) {
    if (normKey(status) === key || normKey(TASK_STATUS_LABELS[status]) === key) {
      return status;
    }
  }
  if (
    key.includes("abgeschl") ||
    key.includes("erledigt") ||
    key.includes("done") ||
    key.includes("complete") ||
    key.includes("geschlossen") ||
    key === "fertig"
  ) {
    return "abgeschlossen";
  }
  if (
    key.includes("bearbeitung") ||
    key.includes("progress") ||
    key.includes("doing") ||
    key === "inwork"
  ) {
    return "bearbeitung";
  }
  if (
    key.includes("warten") ||
    key.includes("waiting") ||
    key.includes("pending") ||
    key.includes("blocked") ||
    key.includes("blockiert")
  ) {
    return "warten";
  }
  if (
    key.includes("vertret") ||
    key.includes("standin") ||
    key.includes("deputy")
  ) {
    return "vertretung";
  }
  if (
    key.includes("offen") ||
    key.includes("open") ||
    key.includes("todo") ||
    key.includes("notstarted") ||
    key.includes("nichtbegonnen") ||
    key === "neu"
  ) {
    return "offen";
  }
  return "offen";
}

export function parseTaskPriority(value: string): TaskPriority {
  const key = normKey(value);
  if (!key) return "niedrig";
  for (const priority of TASK_PRIORITIES) {
    if (normKey(priority) === key || normKey(TASK_PRIORITY_LABELS[priority]) === key) {
      return priority;
    }
  }
  if (
    key.includes("sehrhoch") ||
    key.includes("urgent") ||
    key.includes("kritisch") ||
    key.includes("sofort") ||
    key === "1" ||
    key === "p1"
  ) {
    return "sehr-hoch";
  }
  if (key.includes("hoch") || key.includes("high") || key === "2" || key === "p2") {
    return "hoch";
  }
  if (
    key.includes("niedrig") ||
    key.includes("low") ||
    key.includes("gering") ||
    key === "4" ||
    key === "p4"
  ) {
    return "niedrig";
  }
  return "mittel";
}

export function parseReminderRhythm(value: string): ReminderRhythm {
  const key = normKey(value);
  if (!key || key.includes("keine") || key === "none" || key === "never") return "none";
  if (key.includes("taeglich") || key.includes("daily") || key === "1") return "daily";
  if (key.includes("2woch") || key.includes("biweek") || key.includes("vierzehnt")) {
    return "biweekly";
  }
  if (key.includes("2tag") || key.includes("alle2tage") || key.includes("every2day")) {
    return "every-2-days";
  }
  if (key.includes("woechent") || key.includes("weekly") || key.includes("woche")) {
    return "weekly";
  }
  return "none";
}

export function detectAufgabenColumns(headers: string[]): AufgabenCsvColumns {
  const title =
    findBestColumn(headers, TITLE_ALIASES) ??
    (headers.length === 1 ? headers[0] : null);
  const person = findBestColumn(headers, PERSON_ALIASES);
  return {
    title,
    person: person && person !== title ? person : null,
    description: findBestColumn(headers, DESCRIPTION_ALIASES),
    status: findBestColumn(headers, STATUS_ALIASES),
    priority: findBestColumn(headers, PRIORITY_ALIASES),
    dueDate: findBestColumn(headers, DUE_ALIASES),
    reminder: findBestColumn(headers, REMINDER_ALIASES),
    email: findBestColumn(headers, EMAIL_ALIASES),
  };
}

function taskDedupeKey(title: string, dueDate: string | null): string {
  return `${title.trim().toLowerCase()}|${dueDate ?? ""}`;
}

export async function analyzeAufgabenCsvFile(input: {
  file: File;
  existing: Task[];
  defaultEmail?: string;
}): Promise<AufgabenCsvAnalysis> {
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

  return analyzeAufgabenCsvRows({
    fileName: input.file.name,
    headers,
    rows,
    existing: input.existing,
    defaultEmail: input.defaultEmail ?? "",
  });
}

export function analyzeAufgabenCsvRows(input: {
  fileName: string;
  headers: string[];
  rows: CsvRow[];
  existing: Task[];
  defaultEmail?: string;
}): AufgabenCsvAnalysis {
  const columns = detectAufgabenColumns(input.headers);
  const missingRequired: string[] = [];
  if (!columns.title) missingRequired.push("Name / Titel");

  const existingKeys = new Set(
    input.existing.map((item) => taskDedupeKey(item.title, item.dueDate)),
  );
  const seenInFile = new Set<string>();
  const ready: AufgabenCsvReadyRow[] = [];
  const skipped: AufgabenCsvSkippedRow[] = [];
  let duplicatesInFile = 0;
  let alreadyStored = 0;
  const defaultEmail = input.defaultEmail?.trim() ?? "";

  if (columns.title) {
    input.rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const title = (row[columns.title!] ?? "").trim();
      if (!title) {
        skipped.push({ rowNumber, title: "", reason: "Titel fehlt" });
        return;
      }

      const dueRaw = columns.dueDate ? (row[columns.dueDate] ?? "").trim() : "";
      let dueDate: string | null = null;
      if (dueRaw) {
        dueDate = parseCsvDate(dueRaw);
        if (!dueDate) {
          skipped.push({
            rowNumber,
            title,
            reason: `Ungültiges Fälligkeitsdatum: ${dueRaw}`,
          });
          return;
        }
      }

      const key = taskDedupeKey(title, dueDate);
      if (seenInFile.has(key)) {
        duplicatesInFile += 1;
        skipped.push({ rowNumber, title, reason: "Doppelte Zeile in der CSV" });
        return;
      }
      seenInFile.add(key);
      if (existingKeys.has(key)) {
        alreadyStored += 1;
        skipped.push({ rowNumber, title, reason: "Bereits in der App vorhanden" });
        return;
      }

      const emailRaw = columns.email ? (row[columns.email] ?? "").trim() : "";
      ready.push({
        rowNumber,
        title,
        description: columns.description ? (row[columns.description] ?? "").trim() : "",
        status: parseTaskStatus(columns.status ? (row[columns.status] ?? "") : ""),
        priority: parseTaskPriority(columns.priority ? (row[columns.priority] ?? "") : ""),
        dueDate,
        reminderRhythm: parseReminderRhythm(
          columns.reminder ? (row[columns.reminder] ?? "") : "",
        ),
        notifyEmail: emailRaw.includes("@") ? emailRaw : defaultEmail,
      });
    });
  }

  return {
    fileName: input.fileName,
    totalRows: input.rows.length,
    columns,
    missingRequired,
    ready,
    skipped,
    duplicatesInFile,
    alreadyStored,
    openCount: ready.filter((row) => row.status !== "abgeschlossen").length,
    doneCount: ready.filter((row) => row.status === "abgeschlossen").length,
  };
}

export function previewReadyRows(analysis: AufgabenCsvAnalysis): AufgabenCsvReadyRow[] {
  return analysis.ready.slice(0, PREVIEW_LIMIT);
}

export function skippedReasonCounts(
  skipped: AufgabenCsvSkippedRow[],
): { reason: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of skipped) {
    counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason, "de"));
}

export function formatTaskFieldLabel(row: AufgabenCsvReadyRow): {
  status: string;
  priority: string;
} {
  return {
    status: TASK_STATUS_LABELS[row.status],
    priority: TASK_PRIORITY_LABELS[row.priority],
  };
}
