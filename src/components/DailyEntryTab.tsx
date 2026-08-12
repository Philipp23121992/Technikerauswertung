"use client";

import { useMemo, useState } from "react";
import {
  ROLE_OPTIONS,
  STATUS_OPTIONS,
  statusNeedsNote,
  type DayStatus,
  type TechnicianRole,
} from "@/lib/tracker-types";
import { ticketTone } from "@/lib/tracker";
import { useTracker } from "./TrackerProvider";

type DailyEntryTabProps = {
  onRefresh: () => void;
};

export function DailyEntryTab({ onRefresh }: DailyEntryTabProps) {
  const {
    selectedDate,
    technicians,
    getCount,
    getStatus,
    getNote,
    setTicketCount,
    setStatus,
    setNote,
  } = useTracker();
  const [group, setGroup] = useState<TechnicianRole>("fieldservice");

  const visibleTechnicians = useMemo(
    () => technicians.filter((tech) => tech.role === group),
    [technicians, group],
  );

  const groupLabel = ROLE_OPTIONS.find((item) => item.id === group)?.label ?? group;

  return (
    <section className="content-card">
      <div className="content-card-head">
        <div>
          <h2>Tageserfassung</h2>
          <p>Erfassen Sie die Anzahl der gefahrenen Tickets oder den Status für jeden Techniker</p>
        </div>
        <button type="button" className="btn btn-refresh" onClick={onRefresh}>
          <svg viewBox="0 0 24 24" aria-hidden className="btn-icon">
            <path
              fill="currentColor"
              d="M12 6V3L8 7l4 4V8a4 4 0 1 1-4 4H6a6 6 0 1 0 6-6z"
            />
          </svg>
          Aktualisieren
        </button>
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

      <div className="tracker-table-wrap">
        <table className="tracker-table">
          <thead>
            <tr>
              <th>Techniker</th>
              <th>Status / Tätigkeit</th>
              <th>Notiz</th>
              <th>Anzahl Tickets</th>
            </tr>
          </thead>
          <tbody>
            {visibleTechnicians.length === 0 ? (
              <tr>
                <td colSpan={4} className="eval-empty-cell">
                  Keine {groupLabel} in der Techniker-DB. Bitte dort anlegen.
                </td>
              </tr>
            ) : (
              visibleTechnicians.map((tech) => {
                const count = getCount(tech.id, selectedDate);
                const status = getStatus(tech.id, selectedDate);
                const note = getNote(tech.id, selectedDate);
                const option = STATUS_OPTIONS.find((item) => item.id === status);
                const showNote = statusNeedsNote(status);

                return (
                  <tr key={tech.id}>
                    <td className="tech-name">{tech.name}</td>
                    <td>
                      <label className="status-select-wrap">
                        <span
                          className="status-dot"
                          style={{ background: option?.color ?? "#dc2626" }}
                          aria-hidden
                        />
                        <select
                          className="status-select"
                          value={status}
                          onChange={(event) =>
                            setStatus(tech.id, selectedDate, event.target.value as DayStatus)
                          }
                        >
                          {STATUS_OPTIONS.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </td>
                    <td>
                      {showNote ? (
                        <input
                          className="note-input"
                          value={note}
                          placeholder={
                            status === "projekt" ? "Projekt eintragen…" : "Vertretung eintragen…"
                          }
                          onChange={(event) => setNote(tech.id, selectedDate, event.target.value)}
                          aria-label={`Notiz für ${tech.name}`}
                        />
                      ) : (
                        <span className="note-empty">—</span>
                      )}
                    </td>
                    <td>
                      <input
                        className={`ticket-input tone-${status === "tickets" ? ticketTone(count) : "muted"}`}
                        type="number"
                        min={0}
                        step={1}
                        value={count ?? ""}
                        placeholder=""
                        disabled={status !== "tickets"}
                        onChange={(event) => {
                          const raw = event.target.value;
                          setTicketCount(
                            tech.id,
                            selectedDate,
                            raw === "" ? null : Number(raw),
                          );
                        }}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="legend-bar" aria-label="Legende">
        <span className="legend-title">Legende:</span>
        {STATUS_OPTIONS.map((item) => (
          <span key={item.id} className="legend-item">
            <span className="status-dot" style={{ background: item.color }} aria-hidden />
            {item.label}
          </span>
        ))}
      </div>
    </section>
  );
}
