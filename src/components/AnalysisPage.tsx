"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import {
  filterRows,
  findNumericColumns,
  findTechnicianColumn,
  sortRows,
  summarizeByTechnician,
  uniqueValues,
} from "@/lib/analyze";
import { toCsv } from "@/lib/csv";
import type { SortState } from "@/lib/types";
import { DataTable } from "./DataTable";
import { useDataset } from "./DatasetProvider";
import { StatsPanel } from "./StatsPanel";

const PAGE_SIZE = 50;

export function AnalysisPage() {
  const { dataset, clearDataset } = useDataset();
  const [query, setQuery] = useState("");
  const [technicianFilter, setTechnicianFilter] = useState("all");
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);
  const deferredQuery = useDeferredValue(query);

  const technicianColumn = useMemo(
    () => (dataset ? findTechnicianColumn(dataset.headers) : null),
    [dataset],
  );

  const numericColumns = useMemo(
    () => (dataset ? findNumericColumns(dataset.headers, dataset.rows) : []),
    [dataset],
  );

  const technicianOptions = useMemo(() => {
    if (!dataset || !technicianColumn) return [];
    return uniqueValues(dataset.rows, technicianColumn);
  }, [dataset, technicianColumn]);

  const filteredRows = useMemo(() => {
    if (!dataset) return [];

    let rows = filterRows(dataset.rows, deferredQuery);
    if (technicianColumn && technicianFilter !== "all") {
      rows = rows.filter((row) => (row[technicianColumn] ?? "").trim() === technicianFilter);
    }
    return sortRows(rows, sort);
  }, [dataset, deferredQuery, technicianColumn, technicianFilter, sort]);

  const summaries = useMemo(
    () => summarizeByTechnician(filteredRows, technicianColumn, numericColumns),
    [filteredRows, technicianColumn, numericColumns],
  );

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filteredRows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  function toggleSort(column: string) {
    setSort((current) => {
      if (!current || current.column !== column) return { column, direction: "asc" };
      if (current.direction === "asc") return { column, direction: "desc" };
      return null;
    });
    setPage(0);
  }

  function downloadFiltered() {
    if (!dataset) return;
    const csv = toCsv(dataset.headers, filteredRows, dataset.delimiter);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = dataset.fileName.replace(/\.csv$/i, "") + "-gefiltert.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (!dataset || dataset.rows.length === 0) {
    return (
      <div className="page">
        <header className="page-header">
          <p className="page-kicker">Auswertung</p>
          <h1>Noch keine Daten</h1>
          <p className="page-copy">
            Importiere eine CSV-Datei oder erfasse Einträge manuell, um die Auswertung zu starten.
          </p>
        </header>
        <div className="entry-actions">
          <Link href="/import" className="btn btn-primary">
            Zur Importseite
          </Link>
          <Link href="/eingabe" className="btn btn-ghost">
            Zur Eingabe
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <p className="page-kicker">Auswertung</p>
        <h1>Einsätze analysieren</h1>
        <p className="page-copy">
          Filtere, sortiere und gruppiere die geladenen Technikerdaten. Export bleibt jederzeit
          möglich.
        </p>
      </header>

      <section className="workspace" aria-label="Datenauswertung">
        <StatsPanel
          totalRows={dataset.rows.length}
          filteredRows={filteredRows.length}
          columnCount={dataset.headers.length}
          fileName={dataset.fileName}
          delimiter={dataset.delimiter}
          technicianColumn={technicianColumn}
          summaries={summaries}
          numericColumns={numericColumns}
        />

        <div className="toolbar">
          <label className="field">
            <span>Suche</span>
            <input
              type="search"
              value={query}
              placeholder="Text in allen Spalten…"
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
            />
          </label>

          {technicianColumn ? (
            <label className="field">
              <span>Techniker</span>
              <select
                value={technicianFilter}
                onChange={(event) => {
                  setTechnicianFilter(event.target.value);
                  setPage(0);
                }}
              >
                <option value="all">Alle</option>
                {technicianOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="toolbar-actions">
            <button type="button" className="btn btn-ghost" onClick={downloadFiltered}>
              CSV exportieren
            </button>
            <button
              type="button"
              className="btn btn-ghost danger"
              onClick={() => {
                clearDataset();
                setQuery("");
                setTechnicianFilter("all");
                setSort(null);
                setPage(0);
              }}
            >
              Daten leeren
            </button>
          </div>
        </div>

        <DataTable headers={dataset.headers} rows={pageRows} sort={sort} onSort={toggleSort} />

        <div className="pager">
          <p>
            Seite {safePage + 1} von {pageCount}
          </p>
          <div className="pager-actions">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={safePage === 0}
              onClick={() => setPage((value) => Math.max(0, value - 1))}
            >
              Zurück
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
            >
              Weiter
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
