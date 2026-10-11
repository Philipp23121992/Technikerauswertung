"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  DEFAULT_SERVICE_MIN,
  MAX_CUSTOM_DURATION_MIN,
  MAX_TICKET_DURATION_MIN,
  clampDuration,
  formatClock,
} from "@/lib/disposition/schedule";
import {
  DISPOSITION_READINESS_LABELS,
  isCustomTicket,
  isOpenTicket,
  ticketDisplayTitle,
  ticketReadiness,
  ticketScheduleStart,
  ticketSpanEnd,
  type DispositionDb,
  type DispositionTicket,
} from "@/lib/disposition/types";
import { formatDisplayDate } from "@/lib/tracker";
import { WorkKindSelect } from "./WorkKindSelect";

const TICKET_DURATION_PRESETS = [30, 45, 60, 90, 120, 180];
const CUSTOM_DURATION_PRESETS = [30, 45, 60, 90, 120, 180, 240, 360, 510];

function formatUpdateAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function DispositionTicketModal({
  ticket,
  canEdit,
  onClose,
  onSave,
  onDelete,
}: {
  ticket: DispositionTicket;
  canEdit: boolean;
  onClose: () => void;
  onSave: (patch: {
    durationMin?: number;
    title?: string;
    zieltermin?: string | null;
    spanEnd?: string | null;
    newUpdate?: string;
    workKindManual?: "stoerung" | "umbau" | "none" | null;
    plannerNote?: string;
  }) => Promise<DispositionDb | void>;
  onDelete?: () => Promise<void>;
}) {
  const custom = isCustomTicket(ticket);
  const done = !isOpenTicket(ticket);
  const maxDuration = custom ? MAX_CUSTOM_DURATION_MIN : MAX_TICKET_DURATION_MIN;
  const presets = custom ? CUSTOM_DURATION_PRESETS : TICKET_DURATION_PRESETS;
  const [title, setTitle] = useState(ticket.title || ticket.customer);
  const [from, setFrom] = useState(ticket.zieltermin || ticket.termin || "");
  const [to, setTo] = useState(ticketSpanEnd(ticket) || ticket.zieltermin || ticket.termin || "");
  const [durationMin, setDurationMin] = useState(ticket.durationMin || DEFAULT_SERVICE_MIN);
  const [newUpdate, setNewUpdate] = useState("");
  const [plannerNote, setPlannerNote] = useState(ticket.plannerNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const readiness = ticketReadiness(ticket.flags);
  const boardStart = ticketScheduleStart(ticket);
  const updates = [...ticket.updates].sort((a, b) => b.at.localeCompare(a.at));

  useEffect(() => {
    setTitle(ticket.title || ticket.customer);
    setFrom(ticket.zieltermin || ticket.termin || "");
    setTo(ticketSpanEnd(ticket) || ticket.zieltermin || ticket.termin || "");
    setDurationMin(ticket.durationMin || DEFAULT_SERVICE_MIN);
    setPlannerNote(ticket.plannerNote);
  }, [ticket]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    setBusy(true);
    setError("");
    try {
      const start = from && to ? (from <= to ? from : to) : from || null;
      const end = from && to ? (from <= to ? to : from) : null;
      await onSave({
        durationMin: clampDuration(durationMin, DEFAULT_SERVICE_MIN, maxDuration),
        title: custom ? title.trim() : undefined,
        zieltermin: custom ? start : undefined,
        spanEnd: custom ? (start && end && end > start ? end : null) : undefined,
        newUpdate: newUpdate.trim() || undefined,
        plannerNote: plannerNote.trim(),
      });
      setNewUpdate("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!onDelete || !canEdit) return;
    if (!window.confirm("Diesen eigenen Task wirklich löschen?")) return;
    setBusy(true);
    setError("");
    try {
      await onDelete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Löschen fehlgeschlagen.");
      setBusy(false);
    }
  }

  return (
    <div className="aufgaben-modal-backdrop" role="presentation" onClick={onClose}>
      <form
        className="aufgaben-modal disp-ticket-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="disp-ticket-modal-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => void handleSave(event)}
      >
        <header className="aufgaben-modal-head">
          <div>
            <h2 id="disp-ticket-modal-title">{ticketDisplayTitle(ticket)}</h2>
            <p className="smtp-hint" style={{ margin: "0.2rem 0 0" }}>
              {ticket.technicianName}
              {boardStart ? ` · ${formatDisplayDate(boardStart)}${ticket.zieltermin ? "" : " (Wunschtermin)"}` : ""}
              {ticket.spanEnd && boardStart && ticket.spanEnd > boardStart
                ? `–${formatDisplayDate(ticket.spanEnd)}`
                : ""}
              {ticket.plannedStartMin != null
                ? ` · ${formatClock(ticket.plannedStartMin)}–${formatClock(ticket.plannedStartMin + durationMin)}`
                : ""}
              {custom ? " · Eigener Task" : ` · ${DISPOSITION_READINESS_LABELS[readiness]}`}
              {done ? " · abgeschlossen" : ""}
            </p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Schließen
          </button>
        </header>

        <div className="aufgaben-form disp-ticket-modal-body">
          {done ? (
            <p className="full disp-done-banner">
              Dieses Ticket ist <strong>abgeschlossen</strong> und bleibt in der Kanbanansicht
              stehen.
            </p>
          ) : null}

          {custom ? (
            <>
              <label className="full">
                <span>Titel</span>
                <input
                  value={title}
                  disabled={!canEdit}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <label>
                <span>Von</span>
                <input
                  type="date"
                  value={from}
                  disabled={!canEdit}
                  onChange={(event) => setFrom(event.target.value)}
                />
              </label>
              <label>
                <span>Bis</span>
                <input
                  type="date"
                  value={to}
                  disabled={!canEdit}
                  onChange={(event) => setTo(event.target.value)}
                />
              </label>
            </>
          ) : (
            <>
              <p className="full">
                <strong>{ticket.customer || "—"}</strong>
                <br />
                <span>{ticket.addressLabel || "keine Adresse"}</span>
              </p>
              <p className="full disp-ticket-meta">
                <strong>Service</strong>{" "}
                {ticket.service ? <span className="disp-prio-service">{ticket.service}</span> : "—"}
              </p>
              <label>
                <span>Art</span>
                <WorkKindSelect
                  ticket={ticket}
                  disabled={!canEdit}
                  onChange={(workKindManual) => {
                    void onSave({ workKindManual }).catch(() => undefined);
                  }}
                />
              </label>
              <p className="full disp-ticket-meta">
                <strong>Erstellt am</strong> {ticket.erstelltAm ? formatDisplayDate(ticket.erstelltAm) : "—"}
                {" · "}
                <strong>Wunschtermin</strong> {ticket.termin ? formatDisplayDate(ticket.termin) : "—"}
                {" · "}
                <strong>Zieltermin</strong> {ticket.zieltermin ? formatDisplayDate(ticket.zieltermin) : "—"}
              </p>
            </>
          )}

          {!custom && (ticket.kennzeichen || ticket.note) ? (
            <p className="full disp-ticket-meta">
              {ticket.kennzeichen ? (
                <>
                  <strong>Kennzeichen</strong> {ticket.kennzeichen}
                  {ticket.note ? <br /> : null}
                </>
              ) : null}
              {ticket.note ? (
                <>
                  <strong>Abwicklungsnotiz</strong>
                  <br />
                  {ticket.note}
                </>
              ) : null}
            </p>
          ) : null}

          <label className="full">
            <span>Notiz</span>
            <textarea
              rows={3}
              value={plannerNote}
              disabled={!canEdit}
              placeholder="Interne Notiz zur Disposition…"
              onChange={(event) => setPlannerNote(event.target.value)}
              onBlur={() => {
                if (!canEdit) return;
                if (plannerNote.trim() === ticket.plannerNote.trim()) return;
                void onSave({ plannerNote: plannerNote.trim() }).catch(() => undefined);
              }}
            />
          </label>

          <label className="full">
            <span>{custom ? "Dauer je Tag" : "Ticketdauer"}</span>
            <div className="disp-duration-presets">
              {presets.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`btn ${durationMin === value ? "btn-primary" : "btn-secondary"}`}
                  disabled={!canEdit}
                  onClick={() => setDurationMin(value)}
                >
                  {value >= 60 && value % 60 === 0 ? `${value / 60} h` : `${value} min`}
                </button>
              ))}
            </div>
            <input
              type="number"
              min={15}
              max={maxDuration}
              step={15}
              value={durationMin}
              disabled={!canEdit}
              onChange={(event) =>
                setDurationMin(clampDuration(Number(event.target.value), DEFAULT_SERVICE_MIN, maxDuration))
              }
            />
          </label>

          <label className="full">
            <span>Neue Aktualisierung</span>
            <textarea
              rows={4}
              value={newUpdate}
              disabled={!canEdit}
              placeholder="Status, Ersatzteil, Kundeninfo…"
              onChange={(event) => setNewUpdate(event.target.value)}
            />
          </label>

          <div className="disp-ticket-updates full">
            <span>Bisherige Aktualisierungen</span>
            {updates.length === 0 ? (
              <em>Noch keine Einträge.</em>
            ) : (
              <ol>
                {updates.map((item) => (
                  <li key={item.id}>
                    <time dateTime={item.at}>{formatUpdateAt(item.at)}</time>
                    <p>{item.text}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {error ? (
            <div className="error-banner" role="alert">
              {error}
            </div>
          ) : null}
        </div>

        <footer className="aufgaben-modal-foot">
          <div className="aufgaben-modal-foot-actions">
            {custom && onDelete ? (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!canEdit || busy}
                onClick={() => void handleDelete()}
              >
                Task löschen
              </button>
            ) : null}
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Abbrechen
            </button>
            <button type="submit" className="btn btn-primary" disabled={!canEdit || busy}>
              {busy ? "Speichere…" : "Speichern"}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
