"use client";

import { useId, useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { formatDateDe, vacationKindLabel } from "@/lib/urlaube/types";
import {
  analyzeUrlaubCsvFile,
  previewReadyRows,
  skippedReasonCounts,
  type UrlaubCsvAnalysis,
} from "@/lib/urlaube/csv-import";
import type { Technician } from "@/lib/tracker-types";
import type { VacationRequest } from "@/lib/urlaube/types";

type UrlaubCsvImportProps = {
  canEdit: boolean;
  saving: boolean;
  technicians: Technician[];
  existing: VacationRequest[];
  onConfirm: (analysis: UrlaubCsvAnalysis) => Promise<boolean>;
};

export function UrlaubCsvImport({
  canEdit,
  saving,
  technicians,
  existing,
  onConfirm,
}: UrlaubCsvImportProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<UrlaubCsvAnalysis | null>(null);

  async function handleFile(file: File | undefined) {
    if (!canEdit || !file) return;
    setBusy(true);
    setError(null);
    try {
      const next = await analyzeUrlaubCsvFile({
        file,
        technicians,
        existing,
      });
      setAnalysis(next);
    } catch (err) {
      setAnalysis(null);
      setError(
        err instanceof Error
          ? err.message
          : "CSV konnte nicht gelesen werden.",
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
  const canImport = Boolean(analysis && analysis.ready.length > 0 && analysis.missingRequired.length === 0);

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
            aria-labelledby="urlaub-import-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="csv-import-modal-head">
              <h2 id="urlaub-import-title">CSV-Import</h2>
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
              {error ? <p className="urlaub-banner is-error">{error}</p> : null}

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
                      <span>Urlaub</span>
                      <strong>{analysis.urlaubCount}</strong>
                    </article>
                    <article>
                      <span>Überstunden</span>
                      <strong>{analysis.overtimeCount}</strong>
                    </article>
                    <article>
                      <span>Abwesend</span>
                      <strong>{analysis.absentCount}</strong>
                    </article>
                    <article>
                      <span>Nur 1 Tag</span>
                      <strong>{analysis.oneDayCount}</strong>
                    </article>
                    <article>
                      <span>Übersprungen</span>
                      <strong>{analysis.skipped.length}</strong>
                    </article>
                  </div>

                  <ul className="urlaub-import-columns">
                    <li>
                      <span>Name → Antragsteller</span>
                      <strong>{analysis.columns.name ?? "nicht gefunden"}</strong>
                    </li>
                    <li>
                      <span>Urlaub Start → Von</span>
                      <strong>{analysis.columns.start ?? "nicht gefunden"}</strong>
                    </li>
                    <li>
                      <span>Urlaub Ende → Bis</span>
                      <strong>
                        {analysis.columns.end
                          ? `${analysis.columns.end} (leer = 1 Tag)`
                          : "nicht gefunden (leer = 1 Tag)"}
                      </strong>
                    </li>
                    <li>
                      <span>Status → Art</span>
                      <strong>
                        {analysis.columns.status
                          ? `${analysis.columns.status} (Schulung → Abwesend)`
                          : "fehlt (Standard: Urlaub)"}
                      </strong>
                    </li>
                    <li>
                      <span>Drop-down → Vertretung</span>
                      <strong>
                        {analysis.columns.representative
                          ? `${analysis.columns.representative} (leer = keine Vertretung)`
                          : "nicht gefunden (→ keine Vertretung)"}
                      </strong>
                    </li>
                  </ul>

                  {analysis.missingRequired.length > 0 ? (
                    <p className="urlaub-banner is-error">
                      Pflichtspalten fehlen: {analysis.missingRequired.join(", ")}.
                      Bitte die CSV-Köpfe prüfen.
                    </p>
                  ) : null}

                  {analysis.newRepresentatives.length > 0 ? (
                    <p>
                      Neue Vertretungen (werden ins Drop-down übernommen):{" "}
                      <strong>{analysis.newRepresentatives.join(", ")}</strong>
                    </p>
                  ) : null}

                  {analysis.unmatchedApplicants.length > 0 ? (
                    <p>
                      Antragsteller ohne Techniker-Match (werden trotzdem importiert):{" "}
                      <strong>{analysis.unmatchedApplicants.join(", ")}</strong>
                    </p>
                  ) : null}

                  {preview.length > 0 ? (
                    <div className="urlaub-import-table-wrap">
                      <table className="urlaub-import-table">
                        <thead>
                          <tr>
                            <th>Zeile</th>
                            <th>Antragsteller</th>
                            <th>Von</th>
                            <th>Bis</th>
                            <th>Art</th>
                            <th>Vertretung</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.map((row) => (
                            <tr key={`${row.rowNumber}-${row.applicantName}`}>
                              <td>{row.rowNumber}</td>
                              <td>
                                {row.applicantName}
                                {row.applicantMatched ? "" : " · neu"}
                              </td>
                              <td>{formatDateDe(row.dateFrom)}</td>
                              <td>{formatDateDe(row.dateTo)}</td>
                              <td>{vacationKindLabel(row.kind)}</td>
                              <td>
                                {row.representativeName}
                                {row.representativeKnown ? "" : " · neu"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {analysis.ready.length > preview.length ? (
                        <p className="muted-meta">
                          … und {analysis.ready.length - preview.length} weitere bereite Zeilen.
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
                        : `${analysis.ready.length} Einträge importieren`}
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
