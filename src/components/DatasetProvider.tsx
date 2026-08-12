"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  createEmptyDataset,
  createEmptyRow,
  loadDatasetFromStorage,
  saveDatasetToStorage,
} from "@/lib/dataset";
import type { CsvRow, ImportedDataset } from "@/lib/types";

type DatasetContextValue = {
  dataset: ImportedDataset | null;
  ready: boolean;
  setDataset: (dataset: ImportedDataset | null) => void;
  clearDataset: () => void;
  addRow: (row: CsvRow) => void;
  ensureDataset: () => ImportedDataset;
};

const DatasetContext = createContext<DatasetContextValue | null>(null);

export function DatasetProvider({ children }: { children: React.ReactNode }) {
  const [dataset, setDatasetState] = useState<ImportedDataset | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setDatasetState(loadDatasetFromStorage());
    } finally {
      setReady(true);
    }
  }, []);

  const setDataset = useCallback((next: ImportedDataset | null) => {
    startTransition(() => {
      setDatasetState(next);
      saveDatasetToStorage(next);
    });
  }, []);

  const clearDataset = useCallback(() => {
    setDataset(null);
  }, [setDataset]);

  const ensureDataset = useCallback(() => {
    if (dataset) return dataset;
    const empty = createEmptyDataset();
    setDataset(empty);
    return empty;
  }, [dataset, setDataset]);

  const addRow = useCallback(
    (row: CsvRow) => {
      const base = dataset ?? createEmptyDataset();
      const normalized = createEmptyRow(base.headers);
      for (const header of base.headers) {
        normalized[header] = (row[header] ?? "").trim();
      }

      const next: ImportedDataset = {
        ...base,
        rows: [...base.rows, normalized],
        importedAt: new Date().toISOString(),
      };
      setDataset(next);
    },
    [dataset, setDataset],
  );

  const value = useMemo(
    () => ({
      dataset,
      ready,
      setDataset,
      clearDataset,
      addRow,
      ensureDataset,
    }),
    [dataset, ready, setDataset, clearDataset, addRow, ensureDataset],
  );

  return <DatasetContext.Provider value={value}>{children}</DatasetContext.Provider>;
}

export function useDataset() {
  const context = useContext(DatasetContext);
  if (!context) {
    throw new Error("useDataset muss innerhalb von DatasetProvider verwendet werden.");
  }
  return context;
}
