import { createId } from "@/lib/id";

export const URLAUB_SCOPES = ["serviceleitung", "techniker"] as const;
export type UrlaubScope = (typeof URLAUB_SCOPES)[number];

export const VACATION_KINDS = ["urlaub", "ueberstunden", "abwesend"] as const;
export type VacationKind = (typeof VACATION_KINDS)[number];

export const VACATION_KIND_OPTIONS: { id: VacationKind; label: string }[] = [
  { id: "urlaub", label: "Urlaub" },
  { id: "ueberstunden", label: "Überstunden" },
  { id: "abwesend", label: "Abwesend" },
];

export const NO_REPRESENTATIVE = "keine Vertretung";

export const SERVICELEITUNG_NAMES = [
  "Fabian Eberhard",
  "Christian Zimmermann",
  "Philipp Heyser",
  "Korki",
  "Mathias Müller",
] as const;

export type VacationRequest = {
  id: string;
  scope: UrlaubScope;
  dateFrom: string;
  dateTo: string;
  applicantName: string;
  representativeName: string;
  kind: VacationKind;
  note: string;
  sourceTaskId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UrlaubeDb = {
  version: 1;
  requests: VacationRequest[];
};

export function createEmptyUrlaubeDb(): UrlaubeDb {
  return { version: 1, requests: [] };
}

function normalizeIsoDate(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function isScope(value: unknown): value is UrlaubScope {
  return typeof value === "string" && (URLAUB_SCOPES as readonly string[]).includes(value);
}

function isKind(value: unknown): value is VacationKind {
  return typeof value === "string" && (VACATION_KINDS as readonly string[]).includes(value);
}

export function vacationKindLabel(kind: VacationKind): string {
  if (kind === "ueberstunden") return "Überstunden";
  if (kind === "abwesend") return "Abwesend";
  return "Urlaub";
}

export function parseVacationKindSelect(value: string): VacationKind {
  return VACATION_KINDS.includes(value as VacationKind)
    ? (value as VacationKind)
    : "urlaub";
}

export function normalizeVacationRequest(
  raw: Partial<VacationRequest>,
): VacationRequest | null {
  if (!raw?.id || typeof raw.id !== "string") return null;
  const dateFrom = normalizeIsoDate(raw.dateFrom);
  const dateTo = normalizeIsoDate(raw.dateTo);
  const applicantName =
    typeof raw.applicantName === "string" ? raw.applicantName.trim() : "";
  const representativeName =
    typeof raw.representativeName === "string"
      ? raw.representativeName.trim()
      : "";
  if (!dateFrom || !dateTo || !applicantName || !representativeName) return null;
  if (dateTo < dateFrom) return null;
  if (!isScope(raw.scope)) return null;

  const kind = isKind(raw.kind) ? raw.kind : "urlaub";
  const note =
    kind === "abwesend" && typeof raw.note === "string" ? raw.note.trim() : "";

  return {
    id: raw.id,
    scope: raw.scope,
    dateFrom,
    dateTo,
    applicantName,
    representativeName,
    kind,
    note,
    sourceTaskId:
      typeof raw.sourceTaskId === "string" && raw.sourceTaskId.trim()
        ? raw.sourceTaskId.trim()
        : null,
    createdAt:
      typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    updatedAt:
      typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

export function createVacationRequest(input: {
  scope: UrlaubScope;
  dateFrom: string;
  dateTo: string;
  applicantName: string;
  representativeName: string;
  kind?: VacationKind;
  note?: string;
  sourceTaskId?: string | null;
}): VacationRequest {
  const now = new Date().toISOString();
  const kind = input.kind ?? "urlaub";
  return {
    id: createId("url"),
    scope: input.scope,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    applicantName: input.applicantName.trim(),
    representativeName: input.representativeName.trim(),
    kind,
    note: kind === "abwesend" ? (input.note ?? "").trim() : "",
    sourceTaskId: input.sourceTaskId?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };
}

export function formatDateDe(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

export function monthLabelDe(year: number, monthIndex: number): string {
  return new Date(year, monthIndex, 1).toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
  });
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function overlapsMonth(
  request: VacationRequest,
  year: number,
  monthIndex: number,
): boolean {
  const monthStart = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
  const lastDay = daysInMonth(year, monthIndex);
  const monthEnd = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return request.dateFrom <= monthEnd && request.dateTo >= monthStart;
}

export function shortVacationLabel(
  fullName: string,
  kind: VacationKind = "urlaub",
): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const last = parts.length > 1 ? parts[parts.length - 1] : fullName;
  return `${vacationKindLabel(kind)} ${last} | ${fullName}`;
}

/** Stabile, kollisionsfreie Farbe je Name – getrennt pro Scope. */
export function colorForApplicant(
  name: string,
  scope: UrlaubScope,
  roster: readonly string[] = [],
): string {
  const pool = [...new Set(roster.length > 0 ? [...roster] : [name])].sort((a, b) =>
    a.localeCompare(b, "de"),
  );
  let index = pool.indexOf(name);
  if (index < 0) {
    pool.push(name);
    pool.sort((a, b) => a.localeCompare(b, "de"));
    index = pool.indexOf(name);
  }

  // Golden-Angle-Verteilung → jede Person eine eigene Hue
  const offset = scope === "serviceleitung" ? 12 : 48;
  const hue = (offset + index * 137.508) % 360;
  const saturation = scope === "serviceleitung" ? 64 : 70;
  const lightness = scope === "serviceleitung" ? 56 : 50;
  return `hsl(${hue.toFixed(1)} ${saturation}% ${lightness}%)`;
}

export function isoDate(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Montag=0 … Sonntag=6 */
export function mondayFirstWeekday(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export type CalendarCell = {
  key: string;
  iso: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
};

/** 6 Wochen à 7 Tage für Monatskalender (Mo–So). */
export function buildMonthGrid(year: number, monthIndex: number): CalendarCell[][] {
  const first = new Date(year, monthIndex, 1);
  const startOffset = mondayFirstWeekday(first);
  const todayIso = (() => {
    const now = new Date();
    return isoDate(now.getFullYear(), now.getMonth(), now.getDate());
  })();

  const cells: CalendarCell[] = [];
  const start = new Date(year, monthIndex, 1 - startOffset);
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const y = d.getFullYear();
    const m = d.getMonth();
    const day = d.getDate();
    const iso = isoDate(y, m, day);
    cells.push({
      key: iso,
      iso,
      day,
      inMonth: m === monthIndex && y === year,
      isToday: iso === todayIso,
    });
  }

  const weeks: CalendarCell[][] = [];
  for (let w = 0; w < 6; w += 1) {
    weeks.push(cells.slice(w * 7, w * 7 + 7));
  }
  return weeks;
}

export type WeekBar = {
  request: VacationRequest;
  startCol: number; // 1–7
  endCol: number; // 1–7 inclusive
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
};

/** Balken-Segmente je Kalenderwoche (für mehrzeilige Mehrwochen-Urlaube). */
export function buildWeekBars(
  week: CalendarCell[],
  requests: VacationRequest[],
): WeekBar[] {
  const weekStart = week[0]?.iso;
  const weekEnd = week[6]?.iso;
  if (!weekStart || !weekEnd) return [];

  const overlapping = requests
    .filter((item) => item.dateFrom <= weekEnd && item.dateTo >= weekStart)
    .sort(
      (a, b) =>
        a.dateFrom.localeCompare(b.dateFrom) ||
        a.applicantName.localeCompare(b.applicantName, "de"),
    );

  const laneEnds: number[] = [];
  const bars: WeekBar[] = [];

  for (const request of overlapping) {
    const from = request.dateFrom < weekStart ? weekStart : request.dateFrom;
    const to = request.dateTo > weekEnd ? weekEnd : request.dateTo;
    const startCol = week.findIndex((cell) => cell.iso === from) + 1;
    const endCol = week.findIndex((cell) => cell.iso === to) + 1;
    if (startCol < 1 || endCol < 1) continue;

    let lane = 0;
    while (laneEnds[lane] !== undefined && laneEnds[lane] >= startCol) {
      lane += 1;
    }
    laneEnds[lane] = endCol;
    bars.push({
      request,
      startCol,
      endCol,
      lane,
      continuesBefore: request.dateFrom < weekStart,
      continuesAfter: request.dateTo > weekEnd,
    });
  }

  return bars;
}
