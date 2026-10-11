import { parseDateInput, toDateInputValue } from "@/lib/tracker";

export const TIMELINE_START_MIN = 7 * 60;
export const TIMELINE_END_MIN = 18 * 60;
export const WORK_START_MIN = 8 * 60;
export const WORKDAY_MIN = 9 * 60;
export const FRIDAY_WORKDAY_MIN = 6 * 60;
export const WORK_END_MIN = WORK_START_MIN + WORKDAY_MIN;
export const FRIDAY_WORK_END_MIN = WORK_START_MIN + FRIDAY_WORKDAY_MIN;
export const DEFAULT_SERVICE_MIN = 60;
/** Ein Arbeitstag (auch Freitag) gilt als voll bei dieser Ticketanzahl. */
export const TICKETS_PER_DAY = 4;
export const SNAP_MIN = 15;
export const MAX_TICKET_DURATION_MIN = TIMELINE_END_MIN - TIMELINE_START_MIN;
export const MAX_CUSTOM_DURATION_MIN = TIMELINE_END_MIN - TIMELINE_START_MIN;

export function clampDuration(
  value: unknown,
  fallback = DEFAULT_SERVICE_MIN,
  max = MAX_TICKET_DURATION_MIN,
): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  const ceiling = Math.max(SNAP_MIN, max);
  return Math.min(ceiling, Math.max(SNAP_MIN, Math.round(n / SNAP_MIN) * SNAP_MIN));
}

export function parseClockMin(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n / SNAP_MIN) * SNAP_MIN;
  if (rounded < 0 || rounded > 24 * 60) return null;
  return rounded;
}

export function formatClock(min: number): string {
  const safe = Math.max(0, Math.round(min));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function snapMin(min: number): number {
  return Math.round(min / SNAP_MIN) * SNAP_MIN;
}

export function timelineSlots(): number[] {
  const slots: number[] = [];
  for (let min = TIMELINE_START_MIN; min <= TIMELINE_END_MIN; min += 30) {
    slots.push(min);
  }
  return slots;
}

export function todayIso(now = new Date()): string {
  return toDateInputValue(now);
}

export function addDaysIso(iso: string, days: number): string {
  const date = parseDateInput(iso);
  date.setDate(date.getDate() + days);
  return toDateInputValue(date);
}

export function mondayOfWeek(iso: string): string {
  const date = parseDateInput(iso);
  const weekday = date.getDay();
  const offset = weekday === 0 ? -6 : 1 - weekday;
  date.setDate(date.getDate() + offset);
  return toDateInputValue(date);
}

export function workdaysOfWeek(iso: string): string[] {
  const monday = mondayOfWeek(iso);
  return [0, 1, 2, 3, 4].map((offset) => addDaysIso(monday, offset));
}

export function isFriday(iso: string): boolean {
  return parseDateInput(iso).getDay() === 5;
}

export function isWorkday(iso: string): boolean {
  const weekday = parseDateInput(iso).getDay();
  return weekday !== 0 && weekday !== 6;
}

export function nextWorkday(iso: string): string {
  let date = addDaysIso(iso, 1);
  while (!isWorkday(date)) date = addDaysIso(date, 1);
  return date;
}

export function addWorkdays(iso: string, count: number): string {
  let date = iso;
  for (let i = 0; i < Math.max(0, count); i += 1) date = nextWorkday(date);
  return date;
}

export function workdaysInRange(from: string, to: string): string[] {
  const start = from <= to ? from : to;
  const end = from <= to ? to : from;
  const days: string[] = [];
  let date = start;
  let guard = 0;
  while (date <= end && guard < 90) {
    if (isWorkday(date)) days.push(date);
    date = addDaysIso(date, 1);
    guard += 1;
  }
  return days;
}

export function shiftDateSpan(
  from: string | null,
  to: string | null,
  newStart: string,
): { zieltermin: string; spanEnd: string | null } {
  if (!from) return { zieltermin: newStart, spanEnd: null };
  const end = to && to > from ? to : from;
  const length = Math.max(1, workdaysInRange(from, end).length);
  if (length <= 1) return { zieltermin: newStart, spanEnd: null };
  return { zieltermin: newStart, spanEnd: addWorkdays(newStart, length - 1) };
}

export function workdayMinutes(iso: string): number {
  return isFriday(iso) ? FRIDAY_WORKDAY_MIN : WORKDAY_MIN;
}

export function workdayEndMin(iso: string): number {
  return WORK_START_MIN + workdayMinutes(iso);
}

export function workdayLabel(iso: string): string {
  return isFriday(iso) ? "6 Stunden (Freitag, 08:00–14:00)" : "9 Stunden (08:00–17:00)";
}

export function formatHoursDe(min: number): string {
  const hours = Math.max(0, min) / 60;
  if (Number.isInteger(hours)) return String(hours);
  return hours.toFixed(1).replace(".", ",");
}

export function dayLoadPercent(usedMin: number, iso: string): number {
  const cap = workdayMinutes(iso);
  if (cap <= 0) return 0;
  return Math.round((Math.max(0, usedMin) / cap) * 100);
}

export function ticketSlotCap(days = 1): number {
  return TICKETS_PER_DAY * Math.max(0, days);
}

export function ticketSlotPercent(ticketCount: number, days = 1): number {
  const cap = ticketSlotCap(days);
  if (cap <= 0) return 0;
  return Math.round((Math.max(0, ticketCount) / cap) * 100);
}

export type DayLoadTone = "empty" | "ok" | "warn" | "over" | "blocked";

export function dayLoadTone(percent: number, blocked = false): DayLoadTone {
  if (blocked) return "blocked";
  if (percent <= 0) return "empty";
  if (percent < 80) return "ok";
  if (percent <= 100) return "warn";
  return "over";
}

export function autoPlaceStarts(
  tickets: Array<{ id: string; plannedStartMin: number | null; durationMin: number }>,
): Map<string, number> {
  const placed = [...tickets]
    .filter((item) => item.plannedStartMin != null)
    .sort((a, b) => (a.plannedStartMin ?? 0) - (b.plannedStartMin ?? 0));
  const open = tickets.filter((item) => item.plannedStartMin == null);
  const blocks = placed.map((item) => {
    const start = item.plannedStartMin as number;
    const duration = item.durationMin || DEFAULT_SERVICE_MIN;
    return { start, end: start + duration };
  });
  const result = new Map<string, number>();
  for (const item of placed) {
    result.set(item.id, item.plannedStartMin as number);
  }
  let clock = WORK_START_MIN;
  for (const item of open) {
    const duration = item.durationMin || DEFAULT_SERVICE_MIN;
    let start = clock;
    let collision = true;
    while (collision) {
      collision = false;
      for (const block of blocks) {
        if (start < block.end && start + duration > block.start) {
          start = snapMin(block.end);
          collision = true;
        }
      }
    }
    result.set(item.id, start);
    blocks.push({ start, end: start + duration });
    clock = start + duration;
  }
  return result;
}

export function formatWeekdayHeader(iso: string): { weekday: string; date: string } {
  const date = parseDateInput(iso);
  return {
    weekday: new Intl.DateTimeFormat("de-DE", { weekday: "long" }).format(date),
    date: `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.`,
  };
}
