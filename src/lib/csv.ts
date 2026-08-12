import Papa from "papaparse";
import type { CsvRow, ImportedDataset } from "./types";

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

export function parseCsvText(text: string, fileName: string): ImportedDataset {
  const delimiter = detectDelimiter(text);

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    delimiter,
    skipEmptyLines: "greedy",
    transformHeader: (header, index) => normalizeHeader(header, index),
  });

  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    throw new Error(
      first?.message
        ? `CSV konnte nicht gelesen werden: ${first.message}`
        : "CSV konnte nicht gelesen werden.",
    );
  }

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

  return {
    id: crypto.randomUUID(),
    fileName,
    importedAt: new Date().toISOString(),
    headers,
    rows,
    delimiter,
  };
}

export async function parseCsvFile(file: File): Promise<ImportedDataset> {
  const text = await file.text();
  return parseCsvText(text, file.name);
}

export function toCsv(headers: string[], rows: CsvRow[], delimiter = ";"): string {
  const escape = (value: string) => {
    if (/["\n\r]/.test(value) || value.includes(delimiter)) {
      return `"${value.replaceAll('"', '""')}"`;
    }
    return value;
  };

  const lines = [
    headers.map(escape).join(delimiter),
    ...rows.map((row) => headers.map((header) => escape(row[header] ?? "")).join(delimiter)),
  ];

  return `\uFEFF${lines.join("\r\n")}`;
}

export const SAMPLE_CSV = `Techniker;Auftrag;Datum;Status;Ort
Leonard Apel;A-1001;2026-08-03;Erledigt;Berlin
Philip Arndt;A-1002;2026-08-03;Erledigt;Hamburg
Leonard Apel;A-1003;2026-08-04;Erledigt;Berlin
Yoldas Ates;A-1004;2026-08-04;Erledigt;München
External Partner GmbH;A-1005;2026-08-04;Erledigt;Köln
Stephan Fecke;A-1006;2026-08-05;Erledigt;Dortmund
Marc Gruneberg;A-1007;2026-08-05;Erledigt;Essen
LKS Partner Team;A-1008;2026-08-05;Erledigt;Bochum
Christian Jenke;A-1009;2026-08-06;Erledigt;Leipzig
Anja Kleindl;A-1010;2026-08-06;Erledigt;Dresden
Leonard Apel;A-1011;2026-08-06;Erledigt;Berlin
Burak Köseler;A-1012;2026-08-07;Erledigt;Stuttgart
`;
