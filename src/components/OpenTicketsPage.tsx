"use client";

import { useRef, useState } from "react";
import { parseCsvFile } from "@/lib/csv";
import {
  availableYears,
  formatDisplayDate,
  isMonthInEvaluationRange,
} from "@/lib/tracker";
import type { TicketImportResult } from "@/lib/ticket-import";
import { MONTH_LABELS } from "@/lib/tracker-types";
import { ImportAnalysisReport } from "./ImportAnalysisReport";
import { MonthOverviewTab } from "./MonthOverviewTab";
import { OpenTicketsEvaluation } from "./OpenTicketsEvaluation";
import { useEditAccess } from "./EditAccessProvider";
import { useTracker } from "./TrackerProvider";

type PendingImport = {
  fileName: string;
  analysis: TicketImportResult;
};

type OpenTab = "monat" | "auswertung";

export function OpenTicketsPage() {
  const {
    ready,
    year,
    selectedDate,
    setSelectedDate,
    setMonth,
    setYear,
    analyzeOpenTicketImport,
    applyOpenTicketImport,
  } = useTracker();
  const { canEdit } = useEditAccess();
  const [tab, setTab] = useState<OpenTab>("monat");
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const selectedMonth = Number(selectedDate.slice(5, 7)) - 1;
  const years = availableYears(new Date().getFullYear());

  async function handleImportFiles(files: FileList | null) {
    if (!canEdit) return;
    if (!files?.length) return;
    const file = files[0];
    setImportBusy(true);
    setImportError(null);
    setImportMessage(null);

    try {
      const dataset = await parseCsvFile(file);
      const analysis = analyzeOpenTicketImport(dataset);
      setPendingImport({ fileName: dataset.fileName, analysis });
    } catch (err) {
      setPendingImport(null);
      setImportError(err instanceof Error ? err.message : "Import fehlgeschlagen.");
    } finally {
      setImportBusy(false);
      if (importRef.current) importRef.current.value = "";
    }
  }

  function confirmImport() {
    if (!pendingImport) return;
    const { analysis, fileName } = pendingImport;
    applyOpenTicketImport(analysis);
    setPendingImport(null);
    setImportMessage(
      `Offene-Tickets-Import „${fileName}“ übernommen: ${analysis.matchedRows} für ${analysis.onlyDate ? formatDisplayDate(analysis.onlyDate) : "heute"} zugeordnet, ${analysis.partnerRows} als Partner / LKS Partner` +
        (analysis.skippedRows ? `, ${analysis.skippedRows} übersprungen` : "") +
        ".",
    );
  }

  if (!ready) {
    return (
      <div className="page-panel">
        <div className="tracker-loading">Lade Offene Tickets…</div>
      </div>
    );
  }

  return (
    <div className="page-panel">
      <header className="section-header">
        <div>
          <h1>Offene Tickets Gesamt</h1>
          <p>Monatsübersicht, Import &amp; Auswertung (Eintrag immer am aktuellen Datum)</p>
        </div>
      </header>

      <div className="toolbar-row">
        <div className="toolbar-period">
          <label className="year-select-wrap">
            <span className="sr-only">Jahr</span>
            <select
              className="year-select"
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
              aria-label="Jahr wählen"
            >
              {years.map((optionYear) => (
                <option key={optionYear} value={optionYear}>
                  {optionYear}
                </option>
              ))}
            </select>
          </label>

          <div className="month-pills" role="group" aria-label="Monat">
            {MONTH_LABELS.map((label, monthIndex) => {
              const allowed = isMonthInEvaluationRange(year, monthIndex);
              return (
                <button
                  key={label}
                  type="button"
                  className={`month-pill ${selectedMonth === monthIndex ? "is-active" : ""}`}
                  disabled={!allowed}
                  title={allowed ? label : "Auswertung startet ab 01.07.2026"}
                  onClick={() => setMonth(monthIndex)}
                >
                  {label.slice(0, 3)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="toolbar-actions-row">
          <button
            type="button"
            className="btn btn-import"
            disabled={importBusy || !canEdit}
            onClick={() => importRef.current?.click()}
          >
            <svg viewBox="0 0 24 24" aria-hidden className="btn-icon">
              <path
                fill="currentColor"
                d="M4 18V6h2v10.5L18 5l1.4 1.4L7.4 18H20v2H4z"
              />
            </svg>
            {importBusy ? "Analysiere…" : "Offene Tickets Import"}
          </button>
          <input
            ref={importRef}
            className="sr-only-date"
            type="file"
            disabled={!canEdit}
            accept=".csv,text/csv,text/plain"
            onChange={(event) => handleImportFiles(event.target.files)}
          />

          <button
            type="button"
            className="btn btn-date"
            onClick={() => dateRef.current?.showPicker?.() ?? dateRef.current?.focus()}
          >
            <svg viewBox="0 0 24 24" aria-hidden className="btn-icon">
              <path
                fill="currentColor"
                d="M7 2h2v2h6V2h2v2h3v16H4V4h3V2zm13 8H6v8h14v-8z"
              />
            </svg>
            {formatDisplayDate(selectedDate)}
          </button>
          <input
            ref={dateRef}
            className="sr-only-date"
            type="date"
            min="2026-07-01"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            aria-label="Datum wählen"
          />
        </div>
      </div>

      {importError ? (
        <div className="error-banner" role="alert">
          {importError}
        </div>
      ) : null}
      {importMessage ? (
        <div className="success-banner" role="status">
          <p>{importMessage}</p>
        </div>
      ) : null}

      {pendingImport ? (
        <ImportAnalysisReport
          fileName={pendingImport.fileName}
          analysis={pendingImport.analysis}
          onConfirm={confirmImport}
          onCancel={() => setPendingImport(null)}
        />
      ) : null}

      <div className="soft-tabs" role="tablist" aria-label="Bereiche">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "monat"}
          className={`soft-tab ${tab === "monat" ? "is-active" : ""}`}
          onClick={() => setTab("monat")}
        >
          Monatsübersicht
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "auswertung"}
          className={`soft-tab ${tab === "auswertung" ? "is-active" : ""}`}
          onClick={() => setTab("auswertung")}
        >
          Auswertung
        </button>
      </div>

      <div role="tabpanel">
        {tab === "monat" ? (
          <MonthOverviewTab
            variant="offen"
            title="Monatsübersicht Offene Tickets"
          />
        ) : (
          <OpenTicketsEvaluation />
        )}
      </div>

      <p className="year-note">Techniker-Auswertung {year}</p>
    </div>
  );
}
