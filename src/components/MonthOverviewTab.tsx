"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  daysInMonth,
  formatDayHeader,
  isWeekend,
  ticketTone,
  toDateInputValue,
} from "@/lib/tracker";
import {
  ROLE_OPTIONS,
  STATUS_OPTIONS,
  statusNeedsNote,
  type DayStatus,
  type TechnicianRole,
} from "@/lib/tracker-types";
import { useTracker } from "./TrackerProvider";
import { useEditAccess } from "./EditAccessProvider";

type MonthOverviewTabProps = {
  variant?: "gefahren" | "offen" | "touren";
  title?: string;
  description?: string;
};

export function MonthOverviewTab({
  variant = "gefahren",
  title = "Monatsübersicht",
  description,
}: MonthOverviewTabProps) {
  const tracker = useTracker();
  const {
    selectedDate,
    technicians,
    getCount,
    getStatus,
    getNote,
    setTicketCount,
    setStatus,
    setNote,
    getOpenCount,
    getOpenStatus,
    getOpenNote,
    setOpenTicketCount,
    setOpenStatus,
    setOpenNote,
    getTourCount,
    setTourTicketCount,
  } = tracker;
  const { canEdit } = useEditAccess();

  const readCount =
    variant === "offen" ? getOpenCount : variant === "touren" ? getTourCount : getCount;
  const readStatus = variant === "offen" ? getOpenStatus : getStatus;
  const readNote = variant === "offen" ? getOpenNote : getNote;
  const writeCount =
    variant === "offen"
      ? setOpenTicketCount
      : variant === "touren"
        ? setTourTicketCount
        : setTicketCount;
  const writeStatus = variant === "offen" ? setOpenStatus : setStatus;
  const writeNote = variant === "offen" ? setOpenNote : setNote;
  const ticketsOnly = variant === "offen" || variant === "touren";

  const [group, setGroup] = useState<TechnicianRole>("fieldservice");
  const wrapRef = useRef<HTMLDivElement>(null);
  const todayColRef = useRef<HTMLTableCellElement>(null);
  const todayValue = toDateInputValue(new Date());

  const visibleTechnicians = useMemo(
    () => technicians.filter((tech) => tech.role === group),
    [technicians, group],
  );

  const groupLabel = ROLE_OPTIONS.find((item) => item.id === group)?.label ?? group;

  const monthDays = useMemo(() => {
    const [y, month] = selectedDate.split("-").map(Number);
    return daysInMonth(y, (month ?? 1) - 1);
  }, [selectedDate]);

  const todayInView = monthDays.some((day) => toDateInputValue(day) === todayValue);

  const monthLabel = useMemo(() => {
    const date = new Date(selectedDate + "T12:00:00");
    return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(date);
  }, [selectedDate]);

  const defaultDescription = ticketsOnly
    ? `${monthLabel} · Nur Ticketanzahl · Wochenende gesperrt · ${visibleTechnicians.length} ${groupLabel}`
    : `${monthLabel} · Status oder Tickets je Tag · Wochenende gesperrt · ${visibleTechnicians.length} ${groupLabel}`;

  useEffect(() => {
    if (!todayInView) return;
    const wrap = wrapRef.current;
    const col = todayColRef.current;
    if (!wrap || !col) return;

    const sticky = wrap.querySelector<HTMLElement>(".sticky-col");
    const stickyWidth = sticky?.offsetWidth ?? 0;
    const target =
      col.offsetLeft - stickyWidth - Math.max(0, (wrap.clientWidth - stickyWidth - col.offsetWidth) / 2);

    wrap.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [monthDays, todayValue, group, todayInView]);

  return (
    <section className="content-card">
      <div className="content-card-head">
        <div>
          <h2>{title}</h2>
          <p>{description ?? defaultDescription}</p>
        </div>
      </div>

      <div className="soft-tabs entry-group-tabs" role="tablist" aria-label="Technikergruppen">
        {ROLE_OPTIONS.map((item) => {
          const count = technicians.filter((tech) => tech.role === item.id).length;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={group === item.id}
              className={`soft-tab ${group === item.id ? "is-active" : ""}`}
              onClick={() => setGroup(item.id)}
            >
              {item.label}
              <span className="entry-group-count">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="month-grid-wrap" ref={wrapRef}>
        <table className="month-grid month-grid-rich">
          <thead>
            <tr>
              <th className="sticky-col">Techniker</th>
              {monthDays.map((day) => {
                const weekend = isWeekend(day);
                const date = toDateInputValue(day);
                const isToday = date === todayValue;
                return (
                  <th
                    key={day.toISOString()}
                    ref={isToday ? todayColRef : undefined}
                    className={[weekend ? "is-weekend" : "", isToday ? "is-today" : ""]
                      .filter(Boolean)
                      .join(" ") || undefined}
                  >
                    {formatDayHeader(day)}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleTechnicians.length === 0 ? (
              <tr>
                <td colSpan={monthDays.length + 1} className="eval-empty-cell">
                  Keine {groupLabel} in der Techniker-DB. Bitte dort anlegen.
                </td>
              </tr>
            ) : (
              visibleTechnicians.map((tech) => (
                <tr key={tech.id}>
                  <th className="sticky-col tech-name">{tech.name}</th>
                  {monthDays.map((day) => {
                    const date = toDateInputValue(day);
                    const weekend = isWeekend(day);
                    const isToday = date === todayValue;
                    const count = readCount(tech.id, date);
                    const tone = ticketTone(count);

                    if (ticketsOnly) {
                      return (
                        <td
                          key={date}
                          className={[weekend ? "is-weekend" : "", isToday ? "is-today" : ""]
                            .filter(Boolean)
                            .join(" ") || undefined}
                        >
                          {weekend ? (
                            <div className="weekend-label">Wochenende</div>
                          ) : (
                            <div className="day-cell day-cell-tickets-only">
                              <input
                                className={`day-ticket-box tone-${tone}`}
                                type="number"
                                min={0}
                                step={1}
                                value={count ?? ""}
                                placeholder=""
                                disabled={!canEdit}
                                onChange={(event) => {
                                  const raw = event.target.value;
                                  writeCount(tech.id, date, raw === "" ? null : Number(raw));
                                }}
                                aria-label={`${tech.name} ${formatDayHeader(day)} Offene Tickets`}
                              />
                            </div>
                          )}
                        </td>
                      );
                    }

                    const status = readStatus(tech.id, date);
                    const note = readNote(tech.id, date);
                    const option = STATUS_OPTIONS.find((item) => item.id === status);
                    const showNote = statusNeedsNote(status);

                    return (
                      <td
                        key={date}
                        className={[weekend ? "is-weekend" : "", isToday ? "is-today" : ""]
                          .filter(Boolean)
                          .join(" ") || undefined}
                      >
                        {weekend ? (
                          <div className="weekend-label">Wochenende</div>
                        ) : (
                          <div className="day-cell">
                            <label className="day-status-wrap">
                              <span
                                className="status-dot"
                                style={{
                                  background:
                                    status === "tickets"
                                      ? "transparent"
                                      : (option?.color ?? "#dc2626"),
                                }}
                                aria-hidden
                              />
                              <select
                                className="day-status-select"
                                value={status}
                                disabled={!canEdit}
                                onChange={(event) =>
                                  writeStatus(tech.id, date, event.target.value as DayStatus)
                                }
                                aria-label={`${tech.name} ${formatDayHeader(day)} Status`}
                              >
                                {STATUS_OPTIONS.map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.id === "tickets" ? "Tickets" : item.label}
                                  </option>
                                ))}
                              </select>
                            </label>

                            {showNote ? (
                              <input
                                className="day-note-input"
                                value={note}
                                placeholder="Notiz..."
                                disabled={!canEdit}
                                onChange={(event) => writeNote(tech.id, date, event.target.value)}
                                aria-label={`${tech.name} ${formatDayHeader(day)} Notiz`}
                              />
                            ) : null}

                            <input
                              className={`day-ticket-box tone-${status === "tickets" ? tone : "muted"}`}
                              type="number"
                              min={0}
                              step={1}
                              value={count ?? ""}
                              placeholder=""
                              disabled={!canEdit || status !== "tickets"}
                              onChange={(event) => {
                                const raw = event.target.value;
                                writeCount(tech.id, date, raw === "" ? null : Number(raw));
                              }}
                              aria-label={`${tech.name} ${formatDayHeader(day)} Tickets`}
                            />
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {ticketsOnly ? (
        <div className="legend-bar" aria-label="Legende">
          <span className="legend-title">Legende:</span>
          <span className="legend-item">
            <span className="status-dot" style={{ background: "#ef4444" }} aria-hidden />0
          </span>
          <span className="legend-item">
            <span className="status-dot" style={{ background: "#fee2e2" }} aria-hidden />
            1–2
          </span>
          <span className="legend-item">
            <span className="status-dot" style={{ background: "#dcfce7" }} aria-hidden />
            ≥ 3
          </span>
        </div>
      ) : (
        <div className="legend-bar" aria-label="Legende">
          <span className="legend-title">Legende:</span>
          {STATUS_OPTIONS.map((item) => (
            <span key={item.id} className="legend-item">
              <span className="status-dot" style={{ background: item.color }} aria-hidden />
              {item.label}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
