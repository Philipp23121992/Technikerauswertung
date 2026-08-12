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
import { useEditAccess } from "./EditAccessProvider";
import { useTracker } from "./TrackerProvider";

type PendingImport = {
  fileName: string;
  analysis: TicketImportResult;
};

export function TourenPage() {
  const {
    ready,
    year,
    selectedDate,
    setSelectedDate,
    setMonth,
    setYear,
    analyzeTourTicketImport,
    applyTourTicketImport,
  } = useTracker();
  const { canEdit } = useEditAccess();
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
      const analysis = analyzeTourTicketImport(dataset);
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
    applyTourTicketImport(analysis);
    setPendingImport(null);
    setImportMessage(
      `Touren-Import „${fileName}“ übernommen: ${analysis.matchedRows} für ${analysis.onlyDate ? formatDisplayDate(analysis.onlyDate) : "nächsten Arbeitstag"} zugeordnet` +
        (analysis.dateFilteredRows
          ? `, ${analysis.dateFilteredRows} andere Zieltermine ausgefiltert`
          : "") +
        (analysis.unmatchedSkippedRows
          ? `, ${analysis.unmatchedSkippedRows} nicht berücksichtigt`
          : "") +
        (analysis.skippedRows ? `, ${analysis.skippedRows} übersprungen` : "") +
        ".",
    );
  }

  if (!ready) {
    return (
      <div className="page-panel">
        <div className="tracker-loading">Lade Geplante Touren…</div>
      </div>
    );
  }

  return (
    <div className="page-panel">
      <header className="section-header">
        <div>
          <h1>Geplante Touren Fieldservice</h1>
          <p>Monatsübersicht &amp; Import (nur nächster Arbeitstag · Zieltermin)</p>
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
            {importBusy ? "Analysiere…" : "Geplante Touren Import"}
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

      <MonthOverviewTab
        variant="touren"
        title="Monatsübersicht Geplante Touren"
      />

      <p className="year-note">Techniker-Auswertung {year}</p>
    </div>
  );
}
