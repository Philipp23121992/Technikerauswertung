"use client";

import { formatDisplayDate } from "@/lib/tracker";
import type { TicketImportResult } from "@/lib/ticket-import";

type ImportAnalysisReportProps = {
  fileName: string;
  analysis: TicketImportResult;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ImportAnalysisReport({
  fileName,
  analysis,
  onConfirm,
  onCancel,
}: ImportAnalysisReportProps) {
  const skipUnmatched = analysis.unmatchedMode === "skip";
  const unmatchedLabel = skipUnmatched
    ? "Nicht berücksichtigt"
    : "Partner / LKS Partner";
  const unmatchedTitle = skipUnmatched
    ? "Nicht zuordenbar (werden nicht importiert)"
    : "Nicht zuordenbar → Partner / LKS Partner";

  return (
    <section className="content-card import-report" aria-label="Import-Analyse">
      <div className="content-card-head">
        <div>
          <h2>Import-Analysebericht</h2>
          <p>
            Vorschau für „{fileName}“ – noch nichts übernommen. Bitte prüfen und erst dann
            bestätigen.
          </p>
        </div>
      </div>

      <div className="import-report-kpis">
        <article>
          <span>Zeilen gesamt</span>
          <strong>{analysis.totalRows}</strong>
        </article>
        <article>
          <span>Zugeordnet</span>
          <strong>{analysis.matchedRows}</strong>
        </article>
        <article>
          <span>{unmatchedLabel}</span>
          <strong>
            {skipUnmatched ? analysis.unmatchedSkippedRows : analysis.partnerRows}
          </strong>
        </article>
        <article>
          <span>Übersprungen</span>
          <strong>{analysis.skippedRows + (analysis.dateFilteredRows ?? 0)}</strong>
        </article>
      </div>

      <div className="import-report-meta">
        <p>
          <strong>Techniker-Spalte:</strong> {analysis.techColumn}
        </p>
        {!analysis.ignoreCsvDate && analysis.dateColumn ? (
          <p>
            <strong>Datumsspalte:</strong> {analysis.dateColumn} ({analysis.dateColumnLabel})
          </p>
        ) : null}
        {analysis.onlyDate ? (
          <p>
            <strong>Import-Tag:</strong> {formatDisplayDate(analysis.onlyDate)}
            {analysis.ignoreCsvDate
              ? " (aktuelles Datum · Gelöst am wird nicht berücksichtigt)"
              : " (nur nächster Arbeitstag)"}
            {analysis.dateFilteredRows
              ? ` · ${analysis.dateFilteredRows} andere Zieltermine ausgefiltert`
              : ""}
          </p>
        ) : null}
        {!analysis.ignoreCsvDate ? (
          <p>
            <strong>Zeitraum:</strong>{" "}
            {analysis.dateFrom && analysis.dateTo
              ? `${formatDisplayDate(analysis.dateFrom)} – ${formatDisplayDate(analysis.dateTo)}`
              : "—"}
          </p>
        ) : null}
      </div>

      <div className="import-report-grid">
        <section>
          <h3>Zuordnung je Techniker</h3>
          <div className="tracker-table-wrap">
            <table className="tracker-table">
              <thead>
                <tr>
                  <th>Techniker</th>
                  <th>Gruppe</th>
                  <th>Tickets</th>
                </tr>
              </thead>
              <tbody>
                {analysis.byTechnicianTotals.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="eval-empty-cell">
                      Keine zuordenbaren Einträge.
                    </td>
                  </tr>
                ) : (
                  analysis.byTechnicianTotals.map((row) => (
                    <tr key={row.technicianId}>
                      <td className="tech-name">{row.technicianName}</td>
                      <td>{row.roleLabel}</td>
                      <td>{row.tickets}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h3>{unmatchedTitle}</h3>
          {analysis.unmatchedPeople.length === 0 ? (
            <p className="eval-empty">Alle Bearbeiter konnten zugeordnet werden.</p>
          ) : (
            <div className="tracker-table-wrap">
              <table className="tracker-table">
                <thead>
                  <tr>
                    <th>CSV-Bearbeiter</th>
                    <th>Tickets</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.unmatchedPeople.map((row) => (
                    <tr key={row.csvName}>
                      <td>{row.csvName}</td>
                      <td>{row.tickets}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <div className="import-report-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Abbrechen
        </button>
        <button type="button" className="btn btn-primary" onClick={onConfirm}>
          Import übernehmen
        </button>
      </div>
    </section>
  );
}
