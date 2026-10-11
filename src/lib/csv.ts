import Papa from "papaparse";
import { createId } from "./id";
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

function decodeCsvBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    throw new Error(
      "Das ist eine Excel-Datei (.xlsx). Bitte in Excel unter „Speichern unter“ als CSV (Trennzeichen-getrennt) exportieren.",
    );
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export function parseCsvText(text: string, fileName: string): ImportedDataset {
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
    const firstError = parsed.errors[0]?.message;
    throw new Error(
      firstError
        ? `CSV konnte nicht gelesen werden: ${firstError}`
        : "Die Datei enthält keine Datenzeilen.",
    );
  }

  return {
    id: createId("csv"),
    fileName,
    importedAt: new Date().toISOString(),
    headers,
    rows,
    delimiter,
  };
}

export async function parseCsvFile(file: File): Promise<ImportedDataset> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  return parseCsvText(decodeCsvBytes(bytes), file.name);
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
