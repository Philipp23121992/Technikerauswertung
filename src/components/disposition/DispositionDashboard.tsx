"use client";

import { useMemo } from "react";
import {
  addDaysIso,
  formatWeekdayHeader,
  mondayOfWeek,
  todayIso,
  workdaysOfWeek,
} from "@/lib/disposition/schedule";
import { technicianWeekLoad, weekLoadAsDay, type DayBlock } from "@/lib/disposition/load";
import type { DispositionBoardMode, DispositionTicket } from "@/lib/disposition/types";
import type { TechnicianRole } from "@/lib/tracker-types";
import type { VacationRequest } from "@/lib/urlaube/types";
import { DispositionLoadMeter } from "./DispositionLoadMeter";

type Tech = { id: string; name: string; role?: TechnicianRole };

export function DispositionDashboard({
  technicians,
  tickets,
  vacations,
  weekDate,
  onWeekDate,
  onOpenTechnician,
  extraBlocks,
  possibleById,
}: {
  technicians: Tech[];
  tickets: DispositionTicket[];
  vacations: VacationRequest[];
  weekDate: string;
  onWeekDate: (iso: string) => void;
  onOpenTechnician: (id: string, board?: DispositionBoardMode) => void;
  extraBlocks?: (technicianId: string, day: string) => DayBlock[];
  possibleById?: Map<string, string>;
}) {
  const days = useMemo(() => workdaysOfWeek(weekDate), [weekDate]);
  const today = todayIso();
  const fieldTechnicians = useMemo(
    () => technicians.filter((item) => item.role !== "onsite"),
    [technicians],
  );
  const rows = useMemo(() => {
    return fieldTechnicians
      .map((tech) =>
        technicianWeekLoad(
          tech.id,
          tech.name,
          tickets,
          days,
          vacations,
          (day) => extraBlocks?.(tech.id, day) ?? [],
          today,
          possibleById,
        ),
      )
      .sort((a, b) => {
        const aBlocked = a.days.length > 0 && a.days.every((day) => day.blocked) ? 1 : 0;
        const bBlocked = b.days.length > 0 && b.days.every((day) => day.blocked) ? 1 : 0;
        if (aBlocked !== bBlocked) return aBlocked - bBlocked;
        return (
          b.plan.ticketCount - a.plan.ticketCount ||
          b.percent - a.percent ||
          a.technicianName.localeCompare(b.technicianName, "de")
        );
      });
  }, [days, extraBlocks, fieldTechnicians, possibleById, tickets, today, vacations]);

  const teamPlanSlots = rows.reduce(
    (sum, row) => sum + row.days.reduce((daySum, day) => daySum + (day.blocked ? day.capTickets : day.plan.ticketCount), 0),
    0,
  );
  const teamCapSlots = rows.reduce((sum, row) => sum + row.capTickets, 0);
  const teamPercent = teamCapSlots <= 0 ? 0 : Math.round((teamPlanSlots / teamCapSlots) * 100);
  const teamDemandSlots = rows.reduce((sum, row) => sum + row.days.reduce((daySum, day) => daySum + day.demand.ticketCount, 0), 0);
  const teamDemandPercent = teamCapSlots <= 0 ? 0 : Math.round((teamDemandSlots / teamCapSlots) * 100);
  const pastCap = rows.reduce(
    (sum, row) => sum + row.days.filter((day) => day.showActual).reduce((daySum, day) => daySum + day.capTickets, 0),
    0,
  );
  const teamActualSlots = rows.reduce(
    (sum, row) => sum + row.days.filter((day) => day.showActual).reduce((daySum, day) => daySum + day.actual.ticketCount, 0),
    0,
  );
  const teamActualPercent = pastCap <= 0 ? null : Math.round((teamActualSlots / pastCap) * 100);
  const teamPossibleSlots = rows.reduce(
    (sum, row) => sum + row.days.reduce((daySum, day) => daySum + day.possible.ticketCount, 0),
    0,
  );
  const teamPossiblePercent = teamCapSlots <= 0 ? 0 : Math.round((teamPossibleSlots / teamCapSlots) * 100);
  const first = days[0] ? formatWeekdayHeader(days[0]) : null;
  const last = days[days.length - 1] ? formatWeekdayHeader(days[days.length - 1]) : null;

  return (
    <section className="content-card">
      <div className="disp-week-toolbar">
        <div>
          <h2 style={{ margin: 0 }}>Wochenauslastung</h2>
          <p className="smtp-hint" style={{ margin: "0.25rem 0 0" }}>
            {first && last ? `${first.date} – ${last.date}` : ""} · nur Fieldservice · 4 Tickets = 100 % · Plan =
            Zieltermin · Nachfrage = Wunschtermin · Ist = abgeschlossen · Mögliche Tour = „Ersatzteile angekommen“ ·
            Onsite-Priotickets unter Prio · Mögliche Tour plant nah beieinander im Arbeitstag · Klick auf eine KPI
            öffnet die passende Kanban
          </p>
          <div className="disp-dash-legend" aria-label="Legende">
            <span className="is-plan">Plan</span>
            <span className="is-demand">Nachfrage</span>
            <span className="is-actual">Ist</span>
            <span className="is-possible">Mögliche Tour</span>
          </div>
        </div>
        <div className="disp-week-nav">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => onWeekDate(addDaysIso(mondayOfWeek(weekDate), -7))}
          >
            Vorherige Woche
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => onWeekDate(todayIso())}>
            Diese Woche
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => onWeekDate(addDaysIso(mondayOfWeek(weekDate), 7))}
          >
            Nächste Woche
          </button>
        </div>
      </div>

      <div className="disp-dash-kpis">
        <article>
          <button type="button" className="disp-dash-kpi-btn" onClick={() => onOpenTechnician(fieldTechnicians[0]?.id ?? "", "plan")}>
            <span>Plan</span>
            <strong>{teamPercent} %</strong>
            <small>
              {teamPlanSlots} / {teamCapSlots} Tickets · Zieltermin · Kanban Plan
            </small>
          </button>
        </article>
        <article>
          <button type="button" className="disp-dash-kpi-btn" onClick={() => onOpenTechnician(fieldTechnicians[0]?.id ?? "", "nachfrage")}>
            <span>Nachfrage</span>
            <strong>{teamDemandPercent} %</strong>
            <small>
              {teamDemandSlots} / {teamCapSlots} Tickets · Wunschtermin · Kanban Nachfrage
            </small>
          </button>
        </article>
        <article>
          <button type="button" className="disp-dash-kpi-btn" onClick={() => onOpenTechnician(fieldTechnicians[0]?.id ?? "", "ist")}>
            <span>Ist</span>
            <strong>{teamActualPercent == null ? "–" : `${teamActualPercent} %`}</strong>
            <small>
              {pastCap ? `${teamActualSlots} / ${pastCap} Tickets` : "Tag noch nicht vorbei"} · Kanban Ist
            </small>
          </button>
        </article>
        <article>
          <button type="button" className="disp-dash-kpi-btn" onClick={() => onOpenTechnician(fieldTechnicians[0]?.id ?? "", "moeglich")}>
            <span>Mögliche Tour</span>
            <strong>{teamPossiblePercent} %</strong>
            <small>
              {teamPossibleSlots} / {teamCapSlots} Tickets · Ersatzteile angekommen
            </small>
          </button>
        </article>
      </div>

      {rows.length === 0 ? (
        <p className="mv-empty">Keine Fieldservicetechniker vorhanden.</p>
      ) : (
        <div className="disp-dash-table-wrap">
          <table className="disp-dash-table">
            <thead>
              <tr>
                <th>Techniker</th>
                {days.map((day) => {
                  const head = formatWeekdayHeader(day);
                  return (
                    <th key={day} className={day === today ? "is-today" : undefined}>
                      {head.weekday.slice(0, 2)}
                      <span>{head.date}</span>
                    </th>
                  );
                })}
                <th>Woche</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                return (
                  <tr key={row.technicianId} className="is-fieldservice">
                    <th>
                      <button
                        type="button"
                        className="disp-dash-name"
                        onClick={() => onOpenTechnician(row.technicianId)}
                      >
                        {row.technicianName}
                        <small>
                          Plan {row.plan.percent} % · N {row.demand.percent} %{row.days.some((day) => day.showActual) ? ` · I ${row.actual.percent} %` : ""} · M {row.possible.percent} %
                        </small>
                      </button>
                    </th>
                    {row.days.map((day) => (
                      <td key={day.day} className={day.day === today ? "is-today" : undefined}>
                        <DispositionLoadMeter
                          load={day}
                          onClick={() => onOpenTechnician(row.technicianId)}
                        />
                      </td>
                    ))}
                    <td>
                      <DispositionLoadMeter
                        load={weekLoadAsDay(row)}
                        onClick={() => onOpenTechnician(row.technicianId)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
