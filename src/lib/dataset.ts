import { createId } from "./id";
import type { CsvRow, ImportedDataset } from "./types";

export const DEFAULT_HEADERS = [
  "Techniker",
  "Auftrag",
  "Datum",
  "Dauer_Min",
  "Status",
  "Ort",
] as const;

export const STORAGE_KEY = "technikerauswertung.dataset.v1";

export function createEmptyDataset(fileName = "manuelle-eingabe.csv"): ImportedDataset {
  return {
    id: createId("dataset"),
    fileName,
    importedAt: new Date().toISOString(),
    headers: [...DEFAULT_HEADERS],
    rows: [],
    delimiter: ";",
  };
}

export function createEmptyRow(headers: string[]): CsvRow {
  return Object.fromEntries(headers.map((header) => [header, ""]));
}

export function loadDatasetFromStorage(): ImportedDataset | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ImportedDataset;
    if (!parsed?.headers?.length || !Array.isArray(parsed.rows)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveDatasetToStorage(dataset: ImportedDataset | null) {
  if (typeof window === "undefined") return;

  if (!dataset) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(dataset));
}
