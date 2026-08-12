"use client";

import { useMemo, useState } from "react";
import {
  buildPhilippKpi,
  formatAverage,
} from "@/lib/evaluation";
import { availableYears } from "@/lib/tracker";
import { useTracker } from "./TrackerProvider";

export function KpiPhilippPage() {
  const { ready, year, technicians, getCount, getStatus } = useTracker();
  const years = availableYears(new Date().getFullYear());
  const [viewYear, setViewYear] = useState(year);

  const kpi = useMemo(
    () => buildPhilippKpi(technicians, viewYear, getCount, getStatus),
    [technicians, viewYear, getCount, getStatus],
  );

  const chartMax = Math.max(...kpi.months.map((item) => item.overallAverage), 0.01);

  if (!ready) {
    return (
      <div className="page-panel">
        <div className="tracker-loading">Lade KPI Philipp…</div>
      </div>
    );
  }

  return (
    <div className="page-panel">
      <header className="section-header">
        <div>
          <h1>KPI Philipp</h1>
          <p>
            Monats- &amp; Quartalsdurchschnitt Fieldservice (Gesamt-Ø, nicht je Techniker)
          </p>
        </div>
      </header>

      <div className="toolbar-row">
        <div className="toolbar-period">
          <label className="year-select-wrap">
            <span className="sr-only">Jahr</span>
            <select
              className="year-select"
              value={viewYear}
              onChange={(event) => setViewYear(Number(event.target.value))}
              aria-label="Jahr wählen"
            >
              {years.map((optionYear) => (
                <option key={optionYear} value={optionYear}>
                  {optionYear}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <section className="content-card eval-dashboard">
        <div className="eval-head">
          <div>
            <h2>Monatsdurchschnitte Fieldservice</h2>
            <p>
              Ø = Mittel der Techniker-Ø (Tickets ÷ Arbeitstage) · {kpi.fieldserviceCount}{" "}
              Fieldservicetechniker
            </p>
          </div>
        </div>

        <div className="eval-kpi-grid">
          <article className="eval-kpi-card is-accent">
            <p className="eval-kpi-label">Jahres-Ø</p>
            <p className="eval-kpi-value">{formatAverage(kpi.yearAverage)}</p>
            <p className="eval-kpi-foot">
              Mittel der Monats-Ø · {kpi.monthsWithData} Monate mit Daten
            </p>
          </article>
          <article className="eval-kpi-card">
            <p className="eval-kpi-label">Bester Monat</p>
            <p className="eval-kpi-value eval-kpi-value-sm">
              {kpi.bestMonth ? kpi.bestMonth.monthShort : "—"}
            </p>
            <p className="eval-kpi-foot">
              {kpi.bestMonth ? `${formatAverage(kpi.bestMonth.overallAverage)} Ø` : "Keine Daten"}
            </p>
          </article>
          <article className="eval-kpi-card">
            <p className="eval-kpi-label">Fieldservice</p>
            <p className="eval-kpi-value">{kpi.fieldserviceCount}</p>
            <p className="eval-kpi-foot">Techniker in der Berechnung</p>
          </article>
        </div>

        <section className="eval-panel">
          <h3>Gesamt-Ø je Monat</h3>
          {kpi.monthsWithData === 0 ? (
            <p className="eval-empty">Noch keine auswertbaren Monatsdaten für {viewYear}.</p>
          ) : (
            <div
              className="kpi-month-chart"
              role="img"
              aria-label={`Monatsdurchschnitte Fieldservice ${viewYear}`}
            >
              {kpi.months.map((item) => {
                const heightPct = item.hasData
                  ? Math.max((item.overallAverage / chartMax) * 100, item.overallAverage > 0 ? 8 : 2)
                  : 0;
                return (
                  <div
                    key={`${item.year}-${item.monthIndex}`}
                    className={`kpi-month-col ${item.hasData ? "has-data" : ""} ${item.inRange ? "" : "is-out"}`}
                    title={
                      item.inRange
                        ? `${item.monthLabel}: ${formatAverage(item.overallAverage)}`
                        : `${item.monthLabel}: außerhalb Auswertung`
                    }
                  >
                    <span className="kpi-month-value">
                      {item.hasData ? formatAverage(item.overallAverage) : "·"}
                    </span>
                    <div className="kpi-month-track">
                      <div className="kpi-month-fill" style={{ height: `${heightPct}%` }} />
                    </div>
                    <span className="kpi-month-label">{item.monthShort}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="eval-panel eval-detail">
          <h3>Monatsübersicht</h3>
          <div className="tracker-table-wrap">
            <table className="tracker-table eval-detail-table">
              <thead>
                <tr>
                  <th>Monat</th>
                  <th>Ø Fieldservice</th>
                  <th>Aktive Techniker</th>
                  <th>Tickets</th>
                </tr>
              </thead>
              <tbody>
                {kpi.months.filter((item) => item.inRange).map((item) => (
                  <tr key={`${item.year}-${item.monthIndex}`} className={item.hasData ? undefined : "is-inactive"}>
                    <td className="tech-name">{item.monthLabel}</td>
                    <td>
                      <strong>{formatAverage(item.overallAverage)}</strong>
                    </td>
                    <td>{item.activeTechnicians}</td>
                    <td>{item.totalTickets}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <section className="content-card eval-dashboard" style={{ marginTop: "1rem" }}>
        <div className="eval-head">
          <div>
            <h2>Quartalsdurchschnitt Fieldservice</h2>
            <p>
              Mittel der Monats-Gesamt-Ø je Quartal (keine Einzeltechniker)
            </p>
          </div>
        </div>

        <div className="eval-kpi-grid">
          {kpi.quarters.map((quarter) => (
            <article
              key={quarter.id}
              className={`eval-kpi-card ${quarter.hasData ? "is-accent" : ""}`}
            >
              <p className="eval-kpi-label">{quarter.label}</p>
              <p className="eval-kpi-value">{formatAverage(quarter.average)}</p>
              <p className="eval-kpi-foot">
                {quarter.hasData
                  ? `${quarter.monthsWithData} Monate · ${quarter.monthLabels.join(", ")}`
                  : "Keine Monatsdaten"}
              </p>
            </article>
          ))}
        </div>

        <section className="eval-panel eval-detail">
          <h3>Quartalsübersicht</h3>
          <div className="tracker-table-wrap">
            <table className="tracker-table eval-detail-table">
              <thead>
                <tr>
                  <th>Quartal</th>
                  <th>Monate</th>
                  <th>Monats-Ø</th>
                  <th>Quartals-Ø</th>
                </tr>
              </thead>
              <tbody>
                {kpi.quarters.map((quarter) => (
                  <tr key={quarter.id} className={quarter.hasData ? undefined : "is-inactive"}>
                    <td className="tech-name">{quarter.label}</td>
                    <td>
                      {quarter.monthAverages.length > 0
                        ? quarter.monthAverages
                            .map((m) => `${m.monthShort} ${formatAverage(m.overallAverage)}`)
                            .join(" · ")
                        : "—"}
                    </td>
                    <td>{quarter.monthsWithData}</td>
                    <td>
                      <strong>{formatAverage(quarter.average)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </div>
  );
}
