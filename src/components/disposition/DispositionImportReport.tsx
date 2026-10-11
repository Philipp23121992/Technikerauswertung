"use client";

import { formatDisplayDate } from "@/lib/tracker";
import type { DispositionImportResult } from "@/lib/disposition/import";

export function DispositionImportReport({
  fileName,
  analysis,
  busy,
  onConfirm,
  onCancel,
}: {
  fileName: string;
  analysis: DispositionImportResult;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="content-card import-report" aria-label="Disposition-Import-Analyse">
      <div className="content-card-head">
        <div>
          <h2>Import-Analysebericht</h2>
          <p>
            Vorschau für „{fileName}“ – noch nichts übernommen. Offene-Tickets-Import bleibt
            unberührt. Beim Übernehmen gilt: Ein Ticket erscheint nur in der Kanban des
            Fieldservice- oder Onsidetechnikers, der in der CSV als Bearbeiter steht. Offene
            Tickets aus der CSV werden abgeglichen (Bearbeiter, Adresse, Termine); Dispo-Planung
            bleibt erhalten. Wechselt der Bearbeiter, wandert das Ticket zum neuen Techniker.
            Tickets, die in der CSV nicht mehr vorkommen, bleiben als abgeschlossen auf den
            vergangenen Tagen stehen. Erscheinen sie wieder in der CSV, werden sie erneut
            geöffnet. Partner laufen unter Kein Bearbeiter.
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
          <span>Mit Zieladresse</span>
          <strong>{analysis.withAddress}</strong>
        </article>
        <article>
          <span>Ohne Adresse / unzugeordnet</span>
          <strong>{analysis.withoutAddress + analysis.unmatchedSkippedRows}</strong>
        </article>
        <article>
          <span>Störung</span>
          <strong>{analysis.workKindCounts.stoerung}</strong>
        </article>
        <article>
          <span>Umbau / Installation</span>
          <strong>{analysis.workKindCounts.umbau}</strong>
        </article>
      </div>

      <div className="import-report-meta">
        <p>
          <strong>Techniker-Spalte:</strong> {analysis.techColumn}
        </p>
        <p>
          <strong>Zieltermin:</strong> {analysis.dateColumn || "nicht erkannt"} (bevorzugt)
          {analysis.dateFrom && analysis.dateTo
            ? ` · ${formatDisplayDate(analysis.dateFrom)} – ${formatDisplayDate(analysis.dateTo)}`
            : ""}
        </p>
        <p>
          <strong>Wunschtermin:</strong> {analysis.terminColumn || "nicht erkannt"}
          {analysis.terminColumn ? " · nur wenn kein Zieltermin gesetzt ist" : ""}
        </p>
        <p>
          <strong>Erstellt am:</strong> {analysis.createdColumn || "nicht erkannt"}
        </p>
        <p>
          <strong>Service:</strong> {analysis.serviceColumn || "nicht erkannt"}
          {analysis.serviceColumn
            ? " · DG-Druckerstörung → DG Nexolution · DM im Kunden → DM Tech · SLA-Typ nur bei Störung"
            : ""}
        </p>
        <p>
          <strong>Zusammenfassung:</strong>{" "}
          {analysis.summaryColumn || analysis.kennzeichenColumn || "nicht erkannt"}
          {" · Aufteilung Störung vs. Umbau / Installation"}
        </p>
        <p>
          <strong>Adresse:</strong>{" "}
          {[
            analysis.addressColumn && `Gesamt „${analysis.addressColumn}“`,
            analysis.streetColumn && `Straße „${analysis.streetColumn}“`,
            analysis.plzColumn && `PLZ „${analysis.plzColumn}“`,
            analysis.cityColumn && `Ort „${analysis.cityColumn}“`,
          ]
            .filter(Boolean)
            .join(" · ") || "keine Adressspalte erkannt"}
        </p>
        {analysis.ticketColumn ? (
          <p>
            <strong>Ticket:</strong> {analysis.ticketColumn}
          </p>
        ) : null}
        {analysis.noteColumn ? (
          <p>
            <strong>Abwicklungsnotiz:</strong> {analysis.noteColumn}
          </p>
        ) : null}
        {analysis.kennzeichenColumn ? (
          <p>
            <strong>Kennzeichen:</strong> {analysis.kennzeichenColumn}
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
                {analysis.matchedPeople.map((row) => (
                  <tr key={row.technicianId}>
                    <td>{row.technicianName}</td>
                    <td>{row.roleLabel}</td>
                    <td>{row.tickets}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section>
          <h3>Partner / Kein Bearbeiter (nicht in der Kanban)</h3>
          {analysis.unmatchedPeople.length === 0 ? (
            <p className="mv-empty">Alle Zeilen konnten einem Techniker zugeordnet werden.</p>
          ) : (
            <div className="tracker-table-wrap">
              <table className="tracker-table">
                <thead>
                  <tr>
                    <th>CSV-Name</th>
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

      <div className="smtp-actions" style={{ marginTop: "1rem" }}>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={onConfirm}>
          {busy ? "Übernehme Import…" : "Import übernehmen"}
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>
          Abbrechen
        </button>
      </div>
    </section>
  );
}
