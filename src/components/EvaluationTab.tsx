"use client";

import { useMemo, useState } from "react";
import {
  buildMonthEvaluation,
  formatAverage,
  resolveEvalMonth,
  type EvalRangeMode,
} from "@/lib/evaluation";
import { useTracker } from "./TrackerProvider";

export function EvaluationTab() {
  const { selectedDate, technicians, getCount, getStatus } = useTracker();
  const [rangeMode, setRangeMode] = useState<EvalRangeMode>("current");

  const evaluation = useMemo(() => {
    const { year, monthIndex } = resolveEvalMonth(selectedDate, rangeMode);
    return buildMonthEvaluation(technicians, year, monthIndex, getCount, getStatus);
  }, [selectedDate, rangeMode, technicians, getCount, getStatus]);

  const ranked = evaluation.technicians;
  const top10 = ranked.filter((row) => row.active).slice(0, 10);
  const chartRows = [...ranked].filter((row) => row.active).reverse();
  const maxAverage = Math.max(...chartRows.map((row) => row.average), 0.01);

  return (
    <section className="content-card eval-dashboard">
      <div className="eval-head">
        <div>
          <h2>Auswertung & KPIs</h2>
          <p>
            {evaluation.monthLabel} · {evaluation.workdaysInMonth} Arbeitstage
          </p>
        </div>
        <div className="eval-range-toggle" role="group" aria-label="Zeitraum">
          <button
            type="button"
            className={`eval-range-btn ${rangeMode === "previous" ? "is-active" : ""}`}
            onClick={() => setRangeMode("previous")}
          >
            Letzter Monat
          </button>
          <button
            type="button"
            className={`eval-range-btn ${rangeMode === "current" ? "is-active" : ""}`}
            onClick={() => setRangeMode("current")}
          >
            Ganzer Monat
          </button>
        </div>
      </div>

      <div className="eval-kpi-grid">
        <article className="eval-kpi-card is-accent">
          <p className="eval-kpi-label">Ø Fieldservice / Tag</p>
          <p className="eval-kpi-value">{formatAverage(evaluation.overallAverage)}</p>
          <p className="eval-kpi-foot">
            Tickets ÷ Arbeitstage · {evaluation.fieldserviceCount} Techniker
          </p>
        </article>
        <article className="eval-kpi-card">
          <p className="eval-kpi-label">Gesamt Tickets</p>
          <p className="eval-kpi-value">{evaluation.totalTickets}</p>
          <p className="eval-kpi-foot">ohne Wochenende & Status-Tage</p>
        </article>
        <article className="eval-kpi-card">
          <p className="eval-kpi-label">Aktive Techniker</p>
          <p className="eval-kpi-value">{evaluation.activeTechnicians}</p>
          <p className="eval-kpi-foot">mit Ticket-Einträgen</p>
        </article>
        <article className="eval-kpi-card">
          <p className="eval-kpi-label">Top Performer</p>
          <p className="eval-kpi-value eval-kpi-value-sm">
            {evaluation.topPerformer
              ? evaluation.topPerformer.firstName
              : "Keine Daten"}
          </p>
          <p className="eval-kpi-foot">
            {evaluation.topPerformer
              ? `${formatAverage(evaluation.topPerformer.average)} Ø / Tag`
              : "—"}
          </p>
        </article>
      </div>

      <div className="eval-panels">
        <section className="eval-panel">
          <h3>Top 10 Techniker</h3>
          {top10.length === 0 ? (
            <p className="eval-empty">Noch keine auswertbaren Ticket-Tage in diesem Monat.</p>
          ) : (
            <ol className="eval-top-list">
              {top10.map((row, index) => (
                <li key={row.id}>
                  <span className="eval-top-rank">{index + 1}</span>
                  <span className="eval-top-name">{row.name}</span>
                  <span className="eval-top-avg">{formatAverage(row.average)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="eval-panel eval-panel-chart">
          <h3>Durchschnitt Techniker Tickets / Tag</h3>
          {chartRows.length === 0 ? (
            <p className="eval-empty">Keine Daten für das Diagramm.</p>
          ) : (
            <div className="eval-bar-chart" role="img" aria-label="Tagesdurchschnitt je Techniker">
              {chartRows.map((row) => (
                <div key={row.id} className="eval-bar-row">
                  <span className="eval-bar-label" title={row.name}>
                    {row.firstName}
                  </span>
                  <div className="eval-bar-track">
                    <div
                      className="eval-bar-fill"
                      style={{ width: `${(row.average / maxAverage) * 100}%` }}
                    >
                      <span className="eval-bar-value">{formatAverage(row.average)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="eval-panel eval-detail">
        <h3>Detaillierte Übersicht</h3>
        <div className="tracker-table-wrap">
          <table className="tracker-table eval-detail-table">
            <thead>
              <tr>
                <th>Rang</th>
                <th>Techniker</th>
                <th>Gruppe</th>
                <th>Tickets</th>
                <th>Arbeitstage</th>
                <th>Ø / Tag</th>
              </tr>
            </thead>
            <tbody>
              {ranked.length === 0 ? (
                <tr>
                  <td colSpan={6} className="eval-empty-cell">
                    Keine Fieldservicetechniker vorhanden.
                  </td>
                </tr>
              ) : (
                ranked.map((row, index) => (
                  <tr key={row.id} className={row.active ? undefined : "is-inactive"}>
                    <td>{index + 1}</td>
                    <td className="tech-name">{row.name}</td>
                    <td>{row.roleLabel}</td>
                    <td>{row.tickets}</td>
                    <td>{row.evaluatedDays}</td>
                    <td>
                      <strong>{formatAverage(row.average)}</strong>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
