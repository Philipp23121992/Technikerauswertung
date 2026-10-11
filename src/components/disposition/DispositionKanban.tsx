"use client";

import { DragEvent, FormEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { Globe } from "lucide-react";
import {
  DEFAULT_SERVICE_MIN,
  MAX_CUSTOM_DURATION_MIN,
  SNAP_MIN,
  TIMELINE_END_MIN,
  TIMELINE_START_MIN,
  WORK_START_MIN,
  addDaysIso,
  addWorkdays,
  autoPlaceStarts,
  clampDuration,
  formatClock,
  formatWeekdayHeader,
  mondayOfWeek,
  shiftDateSpan,
  snapMin,
  timelineSlots,
  todayIso,
  workdayEndMin,
  workdaysOfWeek,
} from "@/lib/disposition/schedule";
import { overlayLabelForKind, technicianBlocksForDay, technicianDayLoad, type DayBlock } from "@/lib/disposition/load";
import { DispositionLoadMeter } from "./DispositionLoadMeter";
import {
  DISPOSITION_READINESS_LABELS,
  isCustomTicket,
  isKanbanTicket,
  isOpenTicket,
  kennzeichenTags,
  ticketBoardDate,
  ticketDisplayTitle,
  ticketOccupiesBoardDate,
  ticketOccupiesZielDate,
  ticketHasPartsArrived,
  ticketReadiness,
  ticketScheduleStart,
  ticketSpanEnd,
  type DispositionBoardMode,
  type DispositionTicket,
} from "@/lib/disposition/types";
import { type AutoTourAssignment } from "@/lib/disposition/auto-tour";
import {
  formatOpenWorkdays,
  TICKET_PRIO_LABELS,
  TICKET_WORK_KIND_LABELS,
  ticketPrioInfo,
  ticketWorkKind,
} from "@/lib/disposition/priority";
import { formatDisplayDate } from "@/lib/tracker";
import { ROUTE_COLORS } from "@/lib/disposition/route";
import type { DayStatus } from "@/lib/tracker-types";
import { type VacationRequest } from "@/lib/urlaube/types";
import type { Customer } from "@/sla/types";

const PX_PER_MIN = 1.35;
const CUSTOM_DURATION_PRESETS = [30, 45, 60, 90, 120, 180, 240, 360, 540];

type Tech = { id: string; name: string };

type DragMeta = {
  id: string;
  offsetMin: number;
};

type ResizeState = {
  id: string;
  originDay: string;
  startMin: number;
  durationMin: number;
  zieltermin: string | null;
  spanEnd: string | null;
};

function laneFromPoint(clientX: number, clientY: number): { day: string; rect: DOMRect } | null {
  const node = document.elementFromPoint(clientX, clientY);
  const lane = node?.closest("[data-disp-day]") as HTMLElement | null;
  const day = lane?.dataset.dispDay;
  if (!lane || !day) return null;
  return { day, rect: lane.getBoundingClientRect() };
}

function minFromY(clientY: number, laneTop: number, offsetMin = 0): number {
  const raw = TIMELINE_START_MIN + (clientY - laneTop) / PX_PER_MIN - offsetMin;
  return Math.max(TIMELINE_START_MIN, Math.min(TIMELINE_END_MIN - SNAP_MIN, snapMin(raw)));
}

function stackOffset(
  list: DispositionTicket[],
  ticket: DispositionTicket,
  starts: Map<string, number>,
): number {
  const start = starts.get(ticket.id) ?? ticket.plannedStartMin ?? TIMELINE_START_MIN;
  const end = start + (ticket.durationMin || DEFAULT_SERVICE_MIN);
  let index = 0;
  for (const other of list) {
    if (other.id === ticket.id) break;
    const otherStart = starts.get(other.id) ?? other.plannedStartMin ?? TIMELINE_START_MIN;
    const otherEnd = otherStart + (other.durationMin || DEFAULT_SERVICE_MIN);
    if (otherStart < end && otherEnd > start) index += 1;
  }
  return index;
}

export function DispositionKanban({
  mode = "plan",
  tickets,
  allTickets: _allTickets,
  technicians,
  technicianId,
  onTechnicianId,
  weekDate,
  onWeekDate,
  canEdit,
  vacations,
  dayStatus,
  dayNote,
  onMove,
  onCreate,
  onAllTechnicians,
  onOpenTicket,
  onOpenDayMap,
  possibleAssignments,
}: {
  mode?: DispositionBoardMode;
  tickets: DispositionTicket[];
  allTickets: DispositionTicket[];
  technicians: Tech[];
  technicianId: string;
  onTechnicianId: (id: string) => void;
  weekDate: string;
  onWeekDate: (iso: string) => void;
  canEdit: boolean;
  vacations: VacationRequest[];
  dayStatus?: (technicianId: string, day: string) => DayStatus;
  dayNote?: (technicianId: string, day: string) => string;
  onMove: (patch: {
    id: string;
    technicianId: string;
    technicianName: string;
    zieltermin?: string | null;
    termin?: string | null;
    spanEnd?: string | null;
    plannedStartMin?: number | null;
    durationMin?: number;
    tourDate?: string | null;
    tourStartMin?: number | null;
  }) => void;
  onCreate: (input: {
    technicianId: string;
    technicianName: string;
    title: string;
    zieltermin: string | null;
    spanEnd: string | null;
    plannedStartMin: number | null;
    durationMin: number;
    note?: string;
  }) => Promise<void>;
  onAllTechnicians: () => void;
  onOpenTicket: (id: string) => void;
  onOpenDayMap: (day: string) => void;
  possibleAssignments?: AutoTourAssignment[];
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [resize, setResize] = useState<ResizeState | null>(null);
  const dragMeta = useRef<DragMeta | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const today = todayIso();
  const days = useMemo(() => workdaysOfWeek(weekDate), [weekDate]);
  const weekSet = useMemo(() => new Set(days), [days]);
  const slots = useMemo(() => timelineSlots(), []);
  const laneHeight = (TIMELINE_END_MIN - TIMELINE_START_MIN) * PX_PER_MIN;
  const [customers, setCustomers] = useState<Customer[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/disposition/sla-customers", { credentials: "same-origin" })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as { customers?: Customer[] } | null;
        if (!cancelled && res.ok && Array.isArray(data?.customers)) {
          setCustomers(data.customers);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const tech = technicians.find((item) => item.id === technicianId) ?? technicians[0];
  const color = ROUTE_COLORS[Math.max(0, technicians.findIndex((item) => item.id === tech?.id)) % ROUTE_COLORS.length];

  const mine = useMemo(
    () => tickets.filter((item) => item.technicianId === tech?.id && isKanbanTicket(item)),
    [tech?.id, tickets],
  );

  const previewMine = useMemo(
    () =>
      mine.map((item) => {
        if (!resize || resize.id !== item.id) return item;
        return {
          ...item,
          durationMin: resize.durationMin,
          zieltermin: mode === "plan" ? resize.zieltermin : item.zieltermin,
          spanEnd: mode === "plan" ? resize.spanEnd : item.spanEnd,
          termin: mode === "nachfrage" ? resize.zieltermin : item.termin,
          tourDate: mode === "moeglich" ? resize.zieltermin : item.tourDate,
        };
      }),
    [mine, mode, resize],
  );

  const possibleLookup = useMemo(
    () => new Map((possibleAssignments ?? []).map((item) => [item.id, item])),
    [possibleAssignments],
  );

  const possibleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of possibleAssignments ?? []) map.set(item.id, item.tourDate);
    return map;
  }, [possibleAssignments]);

  const boardMine = useMemo(() => {
    if (mode === "moeglich") {
      return previewMine
        .filter((item) => ticketHasPartsArrived(item) && isOpenTicket(item) && !isCustomTicket(item))
        .map((item) => {
          const next = possibleLookup.get(item.id);
          return {
            ...item,
            tourDate: next?.tourDate ?? null,
            tourStartMin: next?.tourStartMin ?? null,
          };
        });
    }
    if (mode === "ist") return previewMine.filter((item) => !isOpenTicket(item));
    if (mode === "nachfrage") {
      return previewMine.filter((item) => isOpenTicket(item) && !isCustomTicket(item));
    }
    return previewMine.filter(isOpenTicket);
  }, [mode, possibleLookup, previewMine]);

  const openCount = useMemo(() => boardMine.filter(isOpenTicket).length, [boardMine]);
  const doneCount = useMemo(() => boardMine.filter((item) => !isOpenTicket(item)).length, [boardMine]);

  const pool = useMemo(
    () => boardMine.filter((item) => !ticketBoardDate(item, mode)),
    [mode, boardMine],
  );

  const elsewhere = useMemo(() => {
    const counts = new Map<string, number>();
    let total = 0;
    for (const ticket of boardMine) {
      const start = ticketBoardDate(ticket, mode);
      if (!start) continue;
      const occupies = (day: string) => ticketOccupiesBoardDate(ticket, day, mode);
      if (days.some(occupies)) continue;
      counts.set(start, (counts.get(start) ?? 0) + 1);
      total += 1;
    }
    const dates = [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([iso, count]) => {
        const head = formatWeekdayHeader(iso);
        return `${head.date} (${count})`;
      });
    return { total, dates };
  }, [days, mode, boardMine]);

  const byDay = useMemo(() => {
    const map = new Map<string, DispositionTicket[]>();
    for (const day of days) map.set(day, []);
    for (const ticket of boardMine) {
      for (const day of days) {
        const occupies = ticketOccupiesBoardDate(ticket, day, mode);
        if (occupies) map.get(day)?.push(ticket);
      }
    }
    for (const [day, list] of map) {
      const starts = autoPlaceStarts(
        list.map((item) => ({
          id: item.id,
          plannedStartMin: mode === "moeglich" ? item.tourStartMin : item.plannedStartMin,
          durationMin: item.durationMin,
        })),
      );
      list.sort((a, b) => (starts.get(a.id) ?? 0) - (starts.get(b.id) ?? 0));
      map.set(day, list);
    }
    return map;
  }, [days, mode, boardMine]);

  const blockedByDay = useMemo(() => {
    const map = new Map<string, DayBlock[]>();
    if (!tech) return map;
    for (const day of days) {
      const blocks = technicianBlocksForDay(vacations, tech.name, day);
      if (dayStatus?.(tech.id, day) === "vertretung" && !blocks.some((item) => !item.fillsCapacity)) {
        blocks.push({
          kind: "vertretung",
          label: overlayLabelForKind("vertretung"),
          note: dayNote?.(tech.id, day) || "",
          fillsCapacity: false,
        });
      }
      map.set(day, blocks);
    }
    return map;
  }, [dayNote, dayStatus, days, tech, vacations]);

  const loadByDay = useMemo(() => {
    const map = new Map<string, ReturnType<typeof technicianDayLoad>>();
    for (const day of days) {
      map.set(day, technicianDayLoad(previewMine, day, blockedByDay.get(day) ?? [], today, possibleById));
    }
    return map;
  }, [blockedByDay, days, possibleById, previewMine, today]);

  useEffect(() => {
    function onMove(event: PointerEvent) {
      const current = resizeRef.current;
      if (!current) return;
      const originLane = document.querySelector(`[data-disp-day="${current.originDay}"]`) as HTMLElement | null;
      if (!originLane) return;
      const originRect = originLane.getBoundingClientRect();
      const endMin = minFromY(event.clientY, originRect.top, 0);
      const durationMin = clampDuration(
        Math.max(SNAP_MIN, endMin - current.startMin),
        DEFAULT_SERVICE_MIN,
        MAX_CUSTOM_DURATION_MIN,
      );
      let spanEnd = current.spanEnd;
      const hit = laneFromPoint(event.clientX, event.clientY);
      if (hit && current.zieltermin && hit.day !== current.originDay && hit.day >= current.zieltermin) {
        spanEnd = hit.day > current.zieltermin ? hit.day : null;
      } else if (event.clientY > originRect.bottom + 16 && current.zieltermin) {
        const extraDays = Math.min(8, Math.max(1, Math.round((event.clientY - originRect.bottom) / 52)));
        spanEnd = addWorkdays(current.originDay, extraDays);
      }
      const next = { ...current, durationMin, spanEnd };
      resizeRef.current = next;
      setResize(next);
    }
    function onUp() {
      const current = resizeRef.current;
      if (!current || !tech) return;
      onMoveRef.current({
        id: current.id,
        technicianId: tech.id,
        technicianName: tech.name,
        ...(mode === "plan"
          ? {
              zieltermin: current.zieltermin,
              spanEnd: current.spanEnd,
              plannedStartMin: current.startMin,
              durationMin: current.durationMin,
            }
          : mode === "nachfrage"
            ? { termin: current.zieltermin, plannedStartMin: current.startMin, durationMin: current.durationMin }
            : {}),
      });
      resizeRef.current = null;
      setResize(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [mode, tech]);

  function topPx(min: number) {
    return (min - TIMELINE_START_MIN) * PX_PER_MIN;
  }

  function moveTicket(
    id: string,
    date: string | null,
    startMin: number | null,
    spanEnd: string | null,
    termin?: string | null,
  ) {
    if (!tech) return;
    if (mode === "nachfrage") {
      onMove({
        id,
        technicianId: tech.id,
        technicianName: tech.name,
        termin: date,
        plannedStartMin: startMin,
      });
    } else if (mode === "plan") {
      onMove({
        id,
        technicianId: tech.id,
        technicianName: tech.name,
        zieltermin: date,
        spanEnd,
        plannedStartMin: startMin,
      });
    }
    setDragId(null);
    dragMeta.current = null;
  }

  function handleDropOnDay(event: DragEvent<HTMLElement>, day: string) {
    event.preventDefault();
    const capacityBlocks = (blockedByDay.get(day) ?? []).filter((item) => item.fillsCapacity);
    if (capacityBlocks.length) {
      setDragId(null);
      dragMeta.current = null;
      return;
    }
    const id = event.dataTransfer.getData("text/plain") || dragId;
    if (!id) return;
    const ticket = previewMine.find((item) => item.id === id) ?? tickets.find((item) => item.id === id);
    if (!ticket) return;
    const duration = ticket.durationMin || DEFAULT_SERVICE_MIN;
    const offset = dragMeta.current?.id === id ? dragMeta.current.offsetMin : 0;
    const start = minFromY(event.clientY, event.currentTarget.getBoundingClientRect().top, offset);
    const maxStart = TIMELINE_END_MIN - Math.min(duration, SNAP_MIN * 4);
    const plannedStart = Math.min(start, Math.max(TIMELINE_START_MIN, maxStart));
    if (mode === "nachfrage") {
      moveTicket(id, day, plannedStart, null, day);
      return;
    }
    if (mode === "plan") {
      if (ticket.zieltermin && ticketOccupiesZielDate(ticket, day)) {
        moveTicket(id, ticket.zieltermin, plannedStart, ticket.spanEnd);
        return;
      }
      const shifted = shiftDateSpan(ticket.zieltermin, ticket.spanEnd, day);
      moveTicket(id, shifted.zieltermin, plannedStart, shifted.spanEnd);
    }
  }

  function handleDropOnPool(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain") || dragId;
    if (!id) return;
    moveTicket(id, null, null, null, null);
  }

  function beginResize(
    event: ReactPointerEvent<HTMLButtonElement>,
    ticket: DispositionTicket,
    day: string,
    startMin: number,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const state: ResizeState = {
      id: ticket.id,
      originDay: day,
      startMin,
      durationMin: ticket.durationMin || DEFAULT_SERVICE_MIN,
      zieltermin:
        (mode === "plan"
          ? ticket.zieltermin
          : mode === "nachfrage"
            ? ticket.termin
            : ticket.tourDate) || day,
      spanEnd: ticket.spanEnd,
    };
    resizeRef.current = state;
    setResize(state);
  }

  if (!tech) {
    return <p className="mv-empty">Kein Techniker ausgewählt.</p>;
  }

  return (
    <div className="disp-week">
      <div className="disp-week-toolbar">
        <label className="disp-week-tech">
          <span>Techniker</span>
          <select
            className="status-select"
            value={tech.id}
            onChange={(event) => onTechnicianId(event.target.value)}
            aria-label="Techniker für Kanban"
          >
            {technicians.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <small>
            {openCount} offen · {doneCount} abgeschlossen
          </small>
        </label>
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
        <div className="disp-week-nav">
          {mode === "plan" ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canEdit}
              onClick={() => setCreating(true)}
            >
              Eigener Task
            </button>
          ) : null}
          <button type="button" className="btn btn-secondary" onClick={onAllTechnicians}>
            Alle Techniker
          </button>
        </div>
      </div>

      <p className="smtp-hint">
        {mode === "plan"
          ? "Plan: Hier siehst du offene Tickets am Zieltermin – das ist der Fahrttag. Links liegen Tickets ohne Zieltermin. Abgeschlossene Tickets sind unter Ist."
          : mode === "nachfrage"
            ? "Nachfrage: Hier siehst du offene Tickets am Wunschtermin (Vorplanung). Der Wunschtermin ist keine Fahrt. Zieltermine liegen unter Plan."
            : mode === "moeglich"
              ? "Mögliche Tour: Tickets mit „Ersatzteile angekommen“, als sinnvolle Tagestour – nah beieinander, inkl. Fahrt und Rückfahrt im Arbeitstag. Vorschau, der Plan wird nicht überschrieben."
              : "Ist: Hier siehst du abgeschlossene Tickets am Abschlusstag. Offene Tickets liegen unter Plan oder Nachfrage."}
      </p>
      <div className="disp-prio-legend" aria-label="Prio-Farben">
        <span className="disp-prio-chip is-nbd-overdue">NBD überfällig</span>
        <span className="disp-prio-chip is-nbd2-overdue">2nd NBD überfällig</span>
        <span className="disp-prio-chip is-nbd">NBD</span>
        <span className="disp-prio-chip is-nbd2">2nd NBD</span>
        <span className="disp-prio-chip is-none">Kein SLA</span>
      </div>
      {elsewhere.total ? (
        <p className="smtp-hint">
          {elsewhere.total}{" "}
          {elsewhere.total === 1 ? "Ticket liegt" : "Tickets liegen"} außerhalb dieser Woche
          {elsewhere.dates.length ? `: ${elsewhere.dates.join(" · ")}` : ""}.
        </p>
      ) : null}

      <div className="disp-week-board">
        <aside
          className="disp-week-pool"
          onDragOver={(event) => {
            if (!canEdit) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={(event) => {
            if (!canEdit) return;
            handleDropOnPool(event);
          }}
        >
          <header>
            {mode === "plan"
              ? "Ohne Zieltermin"
              : mode === "nachfrage"
                ? "Ohne Wunschtermin"
                : mode === "moeglich"
                  ? "Ohne mögliche Tour"
                  : "Ohne Abschlussdatum"}{" "}
            · {pool.length}
          </header>
          <div className="disp-week-pool-list">
            {pool.length === 0 ? (
              <em>
                {mode === "plan"
                  ? "Keine Tickets ohne Zieltermin"
                  : mode === "nachfrage"
                    ? "Keine Tickets ohne Wunschtermin"
                    : mode === "moeglich"
                      ? "Keine Tickets ohne mögliche Tour"
                      : "Keine abgeschlossenen Tickets ohne Datum"}
              </em>
            ) : (
              pool.map((ticket) => (
                <KanbanCard
                  key={ticket.id}
                  ticket={ticket}
                  customers={customers}
                  color={color}
                  canEdit={canEdit && !resize}
                  compact
                  onOpen={() => onOpenTicket(ticket.id)}
                  onDragStart={(offsetMin) => {
                    dragMeta.current = { id: ticket.id, offsetMin };
                    setDragId(ticket.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    dragMeta.current = null;
                  }}
                />
              ))
            )}
          </div>
        </aside>

        <div className="disp-week-grid">
          <div className="disp-week-axis-head">Zeitstrahl</div>
          {days.map((day) => {
            const head = formatWeekdayHeader(day);
            const tickets = byDay.get(day) ?? [];
            const count = tickets.length;
            const blocked = blockedByDay.get(day) ?? [];
            const capacityBlocks = blocked.filter((item) => item.fillsCapacity);
            const overlays = blocked.filter((item) => !item.fillsCapacity);
            const load = loadByDay.get(day);
            return (
              <div
                key={day}
                className={`disp-week-dayhead${day === today ? " is-today" : ""}${capacityBlocks.length ? " is-blocked" : ""}`}
              >
                {load ? <DispositionLoadMeter load={load} layout="kanban" focus={mode} /> : null}
                <div className="disp-week-dayhead-row">
                  <strong>
                    {head.weekday} ({head.date})
                  </strong>
                  <button
                    type="button"
                    className="disp-day-globe"
                    title={`Route am ${head.weekday} auf der Karte`}
                    aria-label={`Weltkarte für ${head.weekday}`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onOpenDayMap(day);
                    }}
                  >
                    <Globe size={15} strokeWidth={2.2} />
                  </button>
                </div>
                <span className="disp-week-dayhead-meta">
                  {capacityBlocks.length
                    ? capacityBlocks.map((item) => item.label).join(" · ")
                    : overlays.length
                      ? `${overlays.map((item) => item.label).join(" · ")}${count ? ` · ${count} in der Spalte` : ""}`
                      : `${count} ${count === 1 ? "Ticket" : "Tickets"} in der Spalte`}
                </span>
              </div>
            );
          })}

          <div className="disp-week-axis" style={{ height: laneHeight }}>
            {slots.map((slot) => (
              <span key={slot} style={{ top: topPx(slot) }}>
                {formatClock(slot)}
              </span>
            ))}
          </div>

          {days.map((day) => {
            const dayTickets = byDay.get(day) ?? [];
            const starts = autoPlaceStarts(
              dayTickets.map((item) => ({
                id: item.id,
                plannedStartMin: mode === "moeglich" ? item.tourStartMin : item.plannedStartMin,
                durationMin: item.durationMin,
              })),
            );
            const dayEnd = workdayEndMin(day);
            const blocked = blockedByDay.get(day) ?? [];
            const capacityBlocks = blocked.filter((item) => item.fillsCapacity);
            return (
            <div
              key={day}
              data-disp-day={day}
              className={`disp-week-lane${day === today ? " is-today" : ""}${capacityBlocks.length ? " is-blocked" : ""}`}
              style={{ height: laneHeight }}
              onDragOver={(event) => {
                if (!canEdit || capacityBlocks.length || resize) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                if (!canEdit || resize) return;
                handleDropOnDay(event, day);
              }}
            >
              <i
                className="disp-week-workband"
                style={{
                  top: topPx(WORK_START_MIN),
                  height: (dayEnd - WORK_START_MIN) * PX_PER_MIN,
                }}
              />
              {slots.map((slot) => (
                <b key={slot} style={{ top: topPx(slot) }} />
              ))}
              {blocked.map((block) => {
                const overlay = !block.fillsCapacity;
                return (
                <div
                  key={`${day}-${block.kind}-${block.label}`}
                  className={`disp-week-block is-${block.kind}${overlay ? " is-overlay" : ""}`}
                  style={{
                    top: overlay ? topPx(TIMELINE_START_MIN) : topPx(WORK_START_MIN),
                    height: overlay ? 38 : (dayEnd - WORK_START_MIN) * PX_PER_MIN,
                  }}
                  title={block.note || block.label}
                >
                  {block.label}
                </div>
                );
              })}
              {dayTickets.map((ticket) => {
                const start =
                  starts.get(ticket.id) ??
                  (mode === "moeglich" ? ticket.tourStartMin : ticket.plannedStartMin) ??
                  TIMELINE_START_MIN;
                const duration = ticket.durationMin || DEFAULT_SERVICE_MIN;
                const overflow = start + duration > dayEnd;
                const stack = stackOffset(dayTickets, ticket, starts);
                const resizing = resize?.id === ticket.id;
                return (
                  <div
                    key={ticket.id}
                    className={`disp-week-placed${overflow ? " is-overflow" : ""}${resizing ? " is-resizing" : ""}`}
                    style={{
                      top: topPx(start),
                      height: Math.max(44, duration * PX_PER_MIN),
                      left: `${0.28 + stack * 0.38}rem`,
                      right: "0.28rem",
                    }}
                  >
                    <KanbanCard
                      ticket={ticket}
                      customers={customers}
                      color={color}
                      canEdit={canEdit && !resize}
                      compact
                      displayStart={start}
                      onOpen={() => onOpenTicket(ticket.id)}
                      onDragStart={(offsetMin) => {
                        dragMeta.current = { id: ticket.id, offsetMin };
                        setDragId(ticket.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        dragMeta.current = null;
                      }}
                    />
                    {canEdit ? (
                      <button
                        type="button"
                        className="disp-week-resize"
                        aria-label="Dauer ziehen"
                        title="Ziehen zum Verlängern"
                        onPointerDown={(event) => beginResize(event, ticket, day, start)}
                        onClick={(event) => event.stopPropagation()}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
            );
          })}
        </div>
      </div>

      {creating ? (
        <CreateTaskModal
          technicianName={tech.name}
          defaultDate={weekSet.has(today) ? today : days[0] ?? today}
          canEdit={canEdit}
          onClose={() => setCreating(false)}
          onSave={async (input) => {
            await onCreate({
              technicianId: tech.id,
              technicianName: tech.name,
              ...input,
            });
            setCreating(false);
          }}
        />
      ) : null}
    </div>
  );
}

function KanbanCard({
  ticket,
  customers,
  color,
  canEdit,
  compact,
  displayStart,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  ticket: DispositionTicket;
  customers: Customer[];
  color: string;
  canEdit: boolean;
  compact?: boolean;
  displayStart?: number;
  onOpen: () => void;
  onDragStart: (offsetMin: number) => void;
  onDragEnd: () => void;
}) {
  const dragged = useRef(false);
  const custom = isCustomTicket(ticket);
  const done = !isOpenTicket(ticket);
  const readiness = ticketReadiness(ticket.flags);
  const start = displayStart ?? ticket.plannedStartMin;
  const duration = ticket.durationMin || DEFAULT_SERVICE_MIN;
  const boardStart = ticketScheduleStart(ticket);
  const span = ticketSpanEnd(ticket);
  const multiDay = Boolean(boardStart && span && span > boardStart);
  const workKind = custom ? "none" : ticketWorkKind(ticket);
  const tags = kennzeichenTags(ticket.kennzeichen);
  const prio = custom ? null : ticketPrioInfo(ticket, customers);
  const openLabel = prio ? formatOpenWorkdays(prio.openWorkdays, done) : null;
  return (
    <article
      className={`disp-kanban-card${compact ? " is-compact" : ""}${done ? " is-done" : ""}${custom ? " is-custom" : ""}${prio && prio.level !== "none" ? ` is-${prio.level}` : ""}`}
      draggable={canEdit}
      onClick={(event) => {
        event.stopPropagation();
        if (dragged.current) {
          dragged.current = false;
          return;
        }
        onOpen();
      }}
      onDragStart={(event: DragEvent<HTMLElement>) => {
        dragged.current = true;
        const rect = event.currentTarget.getBoundingClientRect();
        const offsetMin = Math.max(0, (event.clientY - rect.top) / PX_PER_MIN);
        event.dataTransfer.setData("text/plain", ticket.id);
        event.dataTransfer.effectAllowed = "move";
        onDragStart(offsetMin);
      }}
      onDragEnd={() => {
        window.setTimeout(() => {
          dragged.current = false;
        }, 0);
        onDragEnd();
      }}
      style={{ borderLeftColor: color }}
    >
      <strong>{ticketDisplayTitle(ticket)}</strong>
      {prio && prio.level !== "none" ? (
        <span className={`disp-prio-chip is-${prio.level}`}>{TICKET_PRIO_LABELS[prio.level]}</span>
      ) : null}
      {openLabel ? (
        <small className="disp-kanban-open-days">
          {done ? "bis Abschluss" : "offen"} {openLabel}
          {!compact && ticket.erstelltAm ? ` · erstellt ${formatDisplayDate(ticket.erstelltAm)}` : ""}
        </small>
      ) : ticket.erstelltAm && !compact ? (
        <small className="disp-kanban-open-days">erstellt {formatDisplayDate(ticket.erstelltAm)}</small>
      ) : null}
      {ticket.customer && ticket.customer !== ticketDisplayTitle(ticket) ? <span>{ticket.customer}</span> : null}
      {!compact && !custom && ticket.service ? <span className="disp-kanban-service">{ticket.service}</span> : null}
      {!compact && workKind !== "none" ? (
        <span className={`disp-work-chip is-${workKind}`}>{TICKET_WORK_KIND_LABELS[workKind]}</span>
      ) : null}
      {!compact && !custom ? <small>{ticket.addressLabel}</small> : null}
      {tags.length ? (
        <div className="disp-kennzeichen">
          {tags.map((tag) => (
            <span key={tag} className="disp-kennzeichen-chip">
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      {ticket.note ? <small className="disp-kanban-note">{ticket.note}</small> : null}
      {ticket.plannerNote ? <small className="disp-kanban-note is-planner">{ticket.plannerNote}</small> : null}
      <div className="disp-kanban-tags">
        {done ? <b>abgeschlossen</b> : null}
        {custom ? <b className="is-custom">Eigener Task</b> : null}
        {multiDay ? <b className="is-span">mehrere Tage</b> : null}
      </div>
      <em>
        {start != null
          ? `${formatClock(start)}–${formatClock(start + duration)}`
          : boardStart
            ? `${formatDisplayDate(boardStart)}${ticket.zieltermin ? "" : " · Wunschtermin"}`
            : "ohne Zeit"}
        {custom ? "" : ` · ${DISPOSITION_READINESS_LABELS[readiness]}`}
      </em>
    </article>
  );
}

function CreateTaskModal({
  technicianName,
  defaultDate,
  canEdit,
  onClose,
  onSave,
}: {
  technicianName: string;
  defaultDate: string;
  canEdit: boolean;
  onClose: () => void;
  onSave: (input: {
    title: string;
    zieltermin: string | null;
    spanEnd: string | null;
    plannedStartMin: number | null;
    durationMin: number;
    note?: string;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [from, setFrom] = useState(defaultDate);
  const [to, setTo] = useState(defaultDate);
  const [startMin, setStartMin] = useState(WORK_START_MIN);
  const [durationMin, setDurationMin] = useState(DEFAULT_SERVICE_MIN);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Bitte einen Titel angeben.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const start = from <= to ? from : to;
      const end = from <= to ? to : from;
      await onSave({
        title: trimmed,
        zieltermin: start,
        spanEnd: end > start ? end : null,
        plannedStartMin: startMin,
        durationMin: clampDuration(durationMin, DEFAULT_SERVICE_MIN, MAX_CUSTOM_DURATION_MIN),
        note: note.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Task konnte nicht angelegt werden.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="aufgaben-modal-backdrop" role="presentation" onClick={onClose}>
      <form
        className="aufgaben-modal disp-ticket-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="disp-create-task-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => void handleSave(event)}
      >
        <header className="aufgaben-modal-head">
          <div>
            <h2 id="disp-create-task-title">Eigener Task</h2>
            <p className="smtp-hint" style={{ margin: "0.2rem 0 0" }}>
              {technicianName} · Dauer je Tag, bei Bedarf über mehrere Tage
            </p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Schließen
          </button>
        </header>
        <div className="aufgaben-form disp-ticket-modal-body">
          <label className="full">
            <span>Titel</span>
            <input
              value={title}
              autoFocus
              required
              placeholder="z. B. Lager, Schulung, interne Abstimmung"
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            <span>Von</span>
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label>
            <span>Bis</span>
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          <label>
            <span>Startzeit</span>
            <input
              type="time"
              step={900}
              value={formatClock(startMin)}
              onChange={(event) => {
                const [h, m] = event.target.value.split(":").map(Number);
                const minutes = (h || 0) * 60 + (m || 0);
                setStartMin(snapMin(minutes));
              }}
            />
          </label>
          <label className="full">
            <span>Dauer je Tag</span>
            <div className="disp-duration-presets">
              {CUSTOM_DURATION_PRESETS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`btn ${durationMin === value ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setDurationMin(value)}
                >
                  {value >= 60 && value % 60 === 0 ? `${value / 60} h` : `${value} min`}
                </button>
              ))}
            </div>
            <input
              type="number"
              min={15}
              max={MAX_CUSTOM_DURATION_MIN}
              step={15}
              value={durationMin}
              onChange={(event) =>
                setDurationMin(
                  clampDuration(Number(event.target.value), DEFAULT_SERVICE_MIN, MAX_CUSTOM_DURATION_MIN),
                )
              }
            />
          </label>
          <label className="full">
            <span>Notiz (optional)</span>
            <textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          {error ? (
            <div className="error-banner" role="alert">
              {error}
            </div>
          ) : null}
        </div>
        <footer className="aufgaben-modal-foot">
          <div className="aufgaben-modal-foot-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Abbrechen
            </button>
            <button type="submit" className="btn btn-primary" disabled={!canEdit || busy}>
              {busy ? "Lege an…" : "Task anlegen"}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
