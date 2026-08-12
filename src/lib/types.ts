export type CsvRow = Record<string, string>;

export type ImportedDataset = {
  id: string;
  fileName: string;
  importedAt: string;
  headers: string[];
  rows: CsvRow[];
  delimiter: string;
};

export type SortDirection = "asc" | "desc";

export type SortState = {
  column: string;
  direction: SortDirection;
} | null;

export type ColumnKind = "text" | "number" | "date";

export type TechnicianSummary = {
  name: string;
  count: number;
  numericTotals: Record<string, number>;
};
