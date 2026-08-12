"use client";

import type { CsvRow, SortState } from "@/lib/types";

type DataTableProps = {
  headers: string[];
  rows: CsvRow[];
  sort: SortState;
  onSort: (column: string) => void;
};

export function DataTable({ headers, rows, sort, onSort }: DataTableProps) {
  if (rows.length === 0) {
    return (
      <div className="empty-panel">
        <p>Keine Zeilen für den aktuellen Filter.</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {headers.map((header) => {
              const active = sort?.column === header;
              const indicator = !active ? "↕" : sort.direction === "asc" ? "↑" : "↓";

              return (
                <th key={header} scope="col">
                  <button type="button" className="sort-btn" onClick={() => onSort(header)}>
                    <span>{header}</span>
                    <span className="sort-indicator" aria-hidden>
                      {indicator}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${index}-${headers.map((header) => row[header]).join("|")}`}>
              {headers.map((header) => (
                <td key={header}>{row[header] || "—"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
