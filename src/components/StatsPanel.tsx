"use client";

import type { TechnicianSummary } from "@/lib/types";

type StatsPanelProps = {
  totalRows: number;
  filteredRows: number;
  columnCount: number;
  fileName: string;
  delimiter: string;
  technicianColumn: string | null;
  summaries: TechnicianSummary[];
  numericColumns: string[];
};

export function StatsPanel({
  totalRows,
  filteredRows,
  columnCount,
  fileName,
  delimiter,
  technicianColumn,
  summaries,
  numericColumns,
}: StatsPanelProps) {
  const delimiterLabel =
    delimiter === ";" ? "Semikolon" : delimiter === "\t" ? "Tab" : delimiter === "," ? "Komma" : delimiter;

  return (
    <section className="stats-panel" aria-label="Auswertung">
      <div className="metric-grid">
        <article className="metric">
          <p className="metric-label">Zeilen</p>
          <p className="metric-value">
            {filteredRows}
            <span className="metric-sub"> / {totalRows}</span>
          </p>
        </article>
        <article className="metric">
          <p className="metric-label">Spalten</p>
          <p className="metric-value">{columnCount}</p>
        </article>
        <article className="metric">
          <p className="metric-label">Datei</p>
          <p className="metric-file">{fileName}</p>
        </article>
        <article className="metric">
          <p className="metric-label">Trennzeichen</p>
          <p className="metric-value metric-value-sm">{delimiterLabel}</p>
        </article>
      </div>

      {technicianColumn && summaries.length > 0 ? (
        <div className="summary-block">
          <div className="summary-head">
            <h3>Nach Techniker</h3>
            <p>Gruppiert über Spalte „{technicianColumn}“</p>
          </div>
          <div className="summary-list">
            {summaries.map((item) => (
              <article key={item.name} className="summary-item">
                <div className="summary-item-top">
                  <h4>{item.name}</h4>
                  <p>
                    {item.count} {item.count === 1 ? "Eintrag" : "Einträge"}
                  </p>
                </div>
                {numericColumns.length > 0 ? (
                  <ul className="summary-nums">
                    {numericColumns.map((column) => (
                      <li key={column}>
                        <span>{column}</span>
                        <strong>
                          {new Intl.NumberFormat("de-DE", {
                            maximumFractionDigits: 2,
                          }).format(item.numericTotals[column] ?? 0)}
                        </strong>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      ) : (
        <p className="summary-hint">
          Tipp: Spalten wie „Techniker“, „Mitarbeiter“ oder „Name“ werden automatisch für die
          Auswertung erkannt.
        </p>
      )}
    </section>
  );
}
