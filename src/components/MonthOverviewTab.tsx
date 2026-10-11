"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  daysInMonth,
  formatDayHeader,
  isWeekend,
  ticketTone,
  toDateInputValue,
} from "@/lib/tracker";
import { normalizePersonName, personNameKeys } from "@/lib/ticket-import";
import {
  ROLE_OPTIONS,
  STATUS_OPTIONS,
  statusNeedsNote,
  ticketKey,
  type DayStatus,
  type Technician,
  type TechnicianRole,
} from "@/lib/tracker-types";
import type { VacationRequest } from "@/lib/urlaube/types";
import { useTracker } from "./TrackerProvider";
import { useEditAccess } from "./EditAccessProvider";

type VacationSyncMap = Record<string, DayStatus>;

function buildVacationSyncMap(
  technicians: Technician[],
  requests: VacationRequest[],
): VacationSyncMap {
  const byName = new Map<string, string>();
  const roster = technicians
    .map((tech) => ({
      id: tech.id,
      name: tech.name.trim(),
      normalized: normalizePersonName(tech.name),
    }))
    .filter((tech) => tech.name.length > 0 && tech.normalized.length > 0);

  const resolveTechnicianId = (applicantName: string): string | null => {
    const raw = applicantName.trim();
    if (!raw) return null;

    // 1) exakte Namenskeys (z. B. "Leonard Apel" oder "Apel Leonard")
    const keys = new Set(personNameKeys(raw));
    const exactHits = roster.filter((tech) =>
      personNameKeys(tech.name).some((key) => keys.has(key)),
    );
    if (exactHits.length === 1) return exactHits[0]?.id ?? null;

    // 2) eindeutiger Teiltreffer (z. B. "Apel" -> "Leonard Apel")
    const needle = normalizePersonName(raw);
    if (!needle || needle.length < 3) return null;
    const partialHits = roster.filter((tech) => {
      const tokens = tech.normalized.split(" ").filter(Boolean);
      return tokens.some(
        (token) =>
          token === needle ||
          token.startsWith(needle) ||
          token.includes(needle) ||
          needle.includes(token),
      );
    });
    if (partialHits.length === 1) return partialHits[0]?.id ?? null;

    return null;
  };

  for (const tech of technicians) {
    const key = normalizePersonName(tech.name);
    if (key) byName.set(key, tech.id);
  }

  const synced: VacationSyncMap = {};
  for (const item of requests) {
    if (item.scope !== "techniker") continue;
    const status =
      item.kind === "urlaub"
        ? "urlaub"
        : item.kind === "ueberstunden"
          ? "ueberstunden"
          : null;
    if (!status) continue;

    const technicianId =
      byName.get(normalizePersonName(item.applicantName)) ?? resolveTechnicianId(item.applicantName);
    if (!technicianId) continue;

    let cursor = new Date(`${item.dateFrom}T12:00:00`);
    const end = new Date(`${item.dateTo}T12:00:00`);
    if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) continue;

    while (cursor.getTime() <= end.getTime()) {
      synced[ticketKey(technicianId, toDateInputValue(cursor))] = status;
      cursor = new Date(cursor);
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return synced;
}

function vacationLabel(status: DayStatus | undefined) {
  if (status === "urlaub") return "Urlaub";
  if (status === "ueberstunden") return "Überstunden";
  return "";
}

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
  const [vacationSyncMap, setVacationSyncMap] = useState<VacationSyncMap>({});
  const shouldOverlayVacations = variant === "gefahren" || variant === "touren";

  const readCount =
    variant === "offen" ? getOpenCount : variant === "touren" ? getTourCount : getCount;
  const readStatus = (technicianId: string, date: string) =>
    variant === "offen"
      ? getOpenStatus(technicianId, date)
      : vacationSyncMap[ticketKey(technicianId, date)] ?? getStatus(technicianId, date);
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

  useEffect(() => {
    if (!shouldOverlayVacations) {
      setVacationSyncMap({});
      return;
    }

    let cancelled = false;

    const loadVacationSync = async () => {
      try {
        const res = await fetch("/api/backup", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!res.ok) {
          if (!cancelled) setVacationSyncMap({});
          return;
        }
        const data = (await res.json().catch(() => null)) as {
          urlaube?: { requests?: VacationRequest[] };
        } | null;
        const requests = Array.isArray(data?.urlaube?.requests) ? data.urlaube.requests : [];
        if (!cancelled) setVacationSyncMap(buildVacationSyncMap(technicians, requests));
      } catch {
        if (!cancelled) setVacationSyncMap({});
      }
    };

    void loadVacationSync();
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadVacationSync();
    };
    const timer = window.setInterval(() => {
      void loadVacationSync();
    }, 60_000);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [shouldOverlayVacations, technicians]);

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
                      const syncedStatus = shouldOverlayVacations
                        ? vacationSyncMap[ticketKey(tech.id, date)]
                        : undefined;
                      return (
                        <td
                          key={date}
                          className={[weekend ? "is-weekend" : "", isToday ? "is-today" : ""]
                            .filter(Boolean)
                            .join(" ") || undefined}
                        >
                          {weekend ? (
                            <div className="weekend-label">Wochenende</div>
                          ) : syncedStatus ? (
                            <div className="day-cell day-cell-tickets-only">
                              <div
                                className={`day-status-chip ${
                                  syncedStatus === "urlaub" ? "is-urlaub" : "is-ueberstunden"
                                }`}
                              >
                                {vacationLabel(syncedStatus)}
                              </div>
                            </div>
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
