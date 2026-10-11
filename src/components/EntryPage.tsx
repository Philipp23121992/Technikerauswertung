"use client";

import { useRef, useState } from "react";
import { parseCsvFile } from "@/lib/csv";
import {
  availableYears,
  EVALUATION_START,
  formatDisplayDate,
  isMonthInEvaluationRange,
} from "@/lib/tracker";
import type { TicketImportResult } from "@/lib/ticket-import";
import { MONTH_LABELS, type EntryTab } from "@/lib/tracker-types";
import { DailyEntryTab } from "./DailyEntryTab";
import { EvaluationTab } from "./EvaluationTab";
import { ImportAnalysisReport } from "./ImportAnalysisReport";
import { MonthOverviewTab } from "./MonthOverviewTab";
import { useEditAccess } from "./EditAccessProvider";
import { useTracker } from "./TrackerProvider";

const TABS: { id: EntryTab; label: string; icon: "user" | "calendar" | "chart" }[] = [
  { id: "eingabe", label: "Eingabe", icon: "user" },
  { id: "monat", label: "Monatsübersicht", icon: "calendar" },
  { id: "auswertung", label: "Auswertung", icon: "chart" },
];

function TabIcon({ type }: { type: "user" | "calendar" | "chart" }) {
  if (type === "user") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="tab-icon">
        <path
          fill="currentColor"
          d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-4 0-8 2-8 4v2h16v-2c0-2-4-4-8-4z"
        />
      </svg>
    );
  }
  if (type === "calendar") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="tab-icon">
        <path
          fill="currentColor"
          d="M7 2h2v2h6V2h2v2h3v16H4V4h3V2zm13 8H6v8h14v-8z"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="tab-icon">
      <path fill="currentColor" d="M4 18h3V9H4v9zm5 0h3V5H9v13zm5 0h3v-6h-3v6zm5 0h3V8h-3v10z" />
    </svg>
  );
}

type PendingImport = {
  fileName: string;
  analysis: TicketImportResult;
};

export function EntryPage() {
  const {
    ready,
    year,
    selectedDate,
    setSelectedDate,
    setMonth,
    setYear,
    refresh,
    analyzeTicketImport,
    applyTicketImport,
  } = useTracker();
  const { canEdit } = useEditAccess();
  const [tab, setTab] = useState<EntryTab>("monat");
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
      const analysis = analyzeTicketImport(dataset);
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
    applyTicketImport(analysis);
    setPendingImport(null);
    setTab("monat");
    setImportMessage(
      `Import „${fileName}“ übernommen: ${analysis.matchedRows} zugeordnet, ${analysis.partnerRows} als Partner / LKS Partner` +
        (analysis.skippedRows ? `, ${analysis.skippedRows} übersprungen` : "") +
        ".",
    );
  }

  if (!ready) {
    return (
      <div className="page-panel">
        <div className="tracker-loading">Lade Techniker…</div>
      </div>
    );
  }

  return (
    <div className="page-panel">
      <header className="section-header">
        <div>
          <h1>Gefahrene Tickets</h1>
          <p>Erfassung &amp; Auswertung</p>
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
            {importBusy ? "Analysiere…" : "Gefahrene Tickets Import"}
          </button>
          <input
            ref={importRef}
            className="sr-only-date"
            type="file"
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
            min={EVALUATION_START}
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
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`soft-tab ${tab === item.id ? "is-active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            <TabIcon type={item.icon} />
            {item.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === "eingabe" ? <DailyEntryTab onRefresh={refresh} /> : null}
        {tab === "monat" ? <MonthOverviewTab /> : null}
        {tab === "auswertung" ? <EvaluationTab /> : null}
      </div>

      <p className="year-note">Techniker-Auswertung {year}</p>
    </div>
  );
}
