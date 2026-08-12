"use client";

import { useMemo } from "react";
import {
  buildOpenTicketsDailyEvaluation,
  formatAverage,
} from "@/lib/evaluation";
import { formatDisplayDate } from "@/lib/tracker";
import { useTracker } from "./TrackerProvider";

export function OpenTicketsEvaluation() {
  const { selectedDate, technicians, getOpenCount } = useTracker();

  const evaluation = useMemo(() => {
    const [year, month] = selectedDate.split("-").map(Number);
    return buildOpenTicketsDailyEvaluation(
      technicians,
      year,
      (month ?? 1) - 1,
      getOpenCount,
    );
  }, [selectedDate, technicians, getOpenCount]);

  const chartMax = Math.max(evaluation.maxTotal, 1);

  return (
    <section className="content-card eval-dashboard">
      <div className="eval-head">
        <div>
          <h2>Auswertung Offene Tickets</h2>
          <p>{evaluation.monthLabel} · Gesamt offen je Tag</p>
        </div>
      </div>

      <div className="eval-kpi-grid">
        <article className="eval-kpi-card is-accent">
          <p className="eval-kpi-label">Höchststand</p>
          <p className="eval-kpi-value">{evaluation.peakDay?.total ?? 0}</p>
          <p className="eval-kpi-foot">
            {evaluation.peakDay
              ? formatDisplayDate(evaluation.peakDay.date)
              : "Keine Daten"}
          </p>
        </article>
        <article className="eval-kpi-card">
          <p className="eval-kpi-label">Ø offen / Tag</p>
          <p className="eval-kpi-value">{formatAverage(evaluation.averageOpen)}</p>
          <p className="eval-kpi-foot">nur Tage mit Einträgen</p>
        </article>
        <article className="eval-kpi-card">
          <p className="eval-kpi-label">Tage mit Daten</p>
          <p className="eval-kpi-value">{evaluation.daysWithData}</p>
          <p className="eval-kpi-foot">von {evaluation.days.length} Tagen</p>
        </article>
      </div>

      <section className="eval-panel open-day-panel">
        <h3>Offene Tickets gesamt je Tag</h3>
        {evaluation.daysWithData === 0 ? (
          <p className="eval-empty">Noch keine offenen Tickets in diesem Monat erfasst.</p>
        ) : (
          <div
            className="open-day-chart"
            role="img"
            aria-label={`Offene Tickets je Tag im ${evaluation.monthLabel}`}
          >
            {evaluation.days.map((item) => {
              const heightPct = item.hasData
                ? Math.max((item.total / chartMax) * 100, item.total > 0 ? 6 : 2)
                : 0;
              return (
                <div
                  key={item.date}
                  className={`open-day-col ${item.isWeekend ? "is-weekend" : ""} ${item.hasData ? "has-data" : ""}`}
                  title={
                    item.hasData
                      ? `${formatDisplayDate(item.date)}: ${item.total} offen`
                      : `${formatDisplayDate(item.date)}: keine Daten`
                  }
                >
                  <span className="open-day-value">
                    {item.hasData ? item.total : "·"}
                  </span>
                  <div className="open-day-track">
                    <div
                      className="open-day-fill"
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                  <span className="open-day-num">{item.day}</span>
                  <span className="open-day-weekday">{item.weekdayShort}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
