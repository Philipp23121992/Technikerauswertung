"use client";

import { useId, useRef, useState } from "react";
import { FileUp } from "lucide-react";
import {
  analyzeAufgabenCsvFile,
  formatTaskFieldLabel,
  previewReadyRows,
  skippedReasonCounts,
  type AufgabenCsvAnalysis,
} from "@/lib/aufgaben/csv-import";
import { type Task } from "@/lib/aufgaben/types";

type AufgabenCsvImportProps = {
  canEdit: boolean;
  saving: boolean;
  existing: Task[];
  defaultEmail: string;
  onConfirm: (analysis: AufgabenCsvAnalysis) => Promise<boolean>;
};

function formatDateDe(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

export function AufgabenCsvImport({
  canEdit,
  saving,
  existing,
  defaultEmail,
  onConfirm,
}: AufgabenCsvImportProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AufgabenCsvAnalysis | null>(null);

  async function handleFile(file: File | undefined) {
    if (!canEdit || !file) return;
    setBusy(true);
    setError(null);
    try {
      const next = await analyzeAufgabenCsvFile({
        file,
        existing,
        defaultEmail,
      });
      setAnalysis(next);
    } catch (err) {
      setAnalysis(null);
      setError(
        err instanceof Error ? err.message : "CSV konnte nicht gelesen werden.",
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function closePanel() {
    if (saving) return;
    setAnalysis(null);
    setError(null);
  }

  async function confirmImport() {
    if (!analysis || analysis.ready.length === 0) return;
    const ok = await onConfirm(analysis);
    if (ok) setAnalysis(null);
  }

  const preview = analysis ? previewReadyRows(analysis) : [];
  const skipCounts = analysis ? skippedReasonCounts(analysis.skipped) : [];
  const canImport = Boolean(
    analysis && analysis.ready.length > 0 && analysis.missingRequired.length === 0,
  );

  return (
    <>
      <label
        className={`csv-import-icon-btn ${busy ? "is-busy" : ""}`}
        htmlFor={inputId}
        title={busy ? "Datei wird gelesen…" : "CSV importieren"}
      >
        <FileUp size={18} aria-hidden />
        <span className="sr-only">CSV importieren</span>
      </label>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        className="sr-only"
        disabled={!canEdit || busy || saving}
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />

      {error || analysis ? (
        <div
          className="csv-import-backdrop"
          role="presentation"
          onClick={closePanel}
        >
          <div
            className="csv-import-modal"
            role="dialog"
            aria-labelledby="aufgaben-import-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="csv-import-modal-head">
              <h2 id="aufgaben-import-title">CSV-Import</h2>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={closePanel}
                disabled={saving}
              >
                Schließen
              </button>
            </header>

            <div className="csv-import-modal-body">
              {error ? <p className="aufgaben-banner is-error">{error}</p> : null}

              {analysis ? (
                <div className="urlaub-import-report">
                  <h3>Analyse von „{analysis.fileName}“</h3>
                  <p className="muted-meta">Noch nichts gespeichert.</p>

                  <div className="urlaub-import-kpis">
                    <article>
                      <span>Zeilen</span>
                      <strong>{analysis.totalRows}</strong>
                    </article>
                    <article>
                      <span>Importbereit</span>
                      <strong>{analysis.ready.length}</strong>
                    </article>
                    <article>
                      <span>Aktiv</span>
                      <strong>{analysis.openCount}</strong>
                    </article>
                    <article>
                      <span>Abgeschlossen</span>
                      <strong>{analysis.doneCount}</strong>
                    </article>
                    <article>
                      <span>Übersprungen</span>
                      <strong>{analysis.skipped.length}</strong>
                    </article>
                  </div>

                  <ul className="urlaub-import-columns">
                    <li>
                      <span>Name (CSV) → Titel</span>
                      <strong>{analysis.columns.title ?? "nicht gefunden"}</strong>
                    </li>
                    <li>
                      <span>Person (CSV)</span>
                      <strong>
                        {analysis.columns.person
                          ? `${analysis.columns.person} · wird weggelassen`
                          : "nicht vorhanden"}
                      </strong>
                    </li>
                    <li>
                      <span>Priority (CSV) → Priorität</span>
                      <strong>
                        {analysis.columns.priority
                          ? `${analysis.columns.priority} (leer = Niedrig)`
                          : "fehlt (Standard: Niedrig)"}
                      </strong>
                    </li>
                    <li>
                      <span>Status (CSV) → Status</span>
                      <strong>
                        {analysis.columns.status ?? "fehlt (Standard: Offen)"}
                      </strong>
                    </li>
                    <li>
                      <span>Fälligkeitsdatum (CSV) → Fälligkeitsdatum</span>
                      <strong>{analysis.columns.dueDate ?? "optional"}</strong>
                    </li>
                  </ul>

                  {analysis.missingRequired.length > 0 ? (
                    <p className="aufgaben-banner is-error">
                      Pflichtspalten fehlen: {analysis.missingRequired.join(", ")}.
                      Bitte eine CSV mit Titel- oder Aufgaben-Spalte verwenden.
                    </p>
                  ) : null}

                  {preview.length > 0 ? (
                    <div className="urlaub-import-table-wrap">
                      <table className="urlaub-import-table">
                        <thead>
                          <tr>
                            <th>Zeile</th>
                            <th>Titel</th>
                            <th>Status</th>
                            <th>Prio</th>
                            <th>Fällig</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.map((row) => {
                            const labels = formatTaskFieldLabel(row);
                            return (
                              <tr key={`${row.rowNumber}-${row.title}`}>
                                <td>{row.rowNumber}</td>
                                <td>{row.title}</td>
                                <td>{labels.status}</td>
                                <td>{labels.priority}</td>
                                <td>{formatDateDe(row.dueDate)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {analysis.ready.length > preview.length ? (
                        <p className="muted-meta">
                          … und {analysis.ready.length - preview.length} weitere bereite
                          Zeilen.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {skipCounts.length > 0 ? (
                    <div>
                      <h4>Übersprungene Zeilen</h4>
                      <ul className="urlaub-import-skipped">
                        {skipCounts.map((item) => (
                          <li key={item.reason}>
                            {item.count}× {item.reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="urlaub-import-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={!canEdit || saving || !canImport}
                      onClick={() => void confirmImport()}
                    >
                      {saving
                        ? "Importiere…"
                        : `${analysis.ready.length} Aufgaben importieren`}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={saving}
                      onClick={closePanel}
                    >
                      Abbrechen
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
