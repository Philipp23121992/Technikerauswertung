import {
  DEFAULT_TECHNICIANS,
  ROLE_OPTIONS,
  STATUS_OPTIONS,
  ticketKey,
  type DayStatus,
  type NoteMap,
  type StatusMap,
  type Technician,
  type TechnicianRole,
  type TicketMap,
  type TrackerState,
} from "./tracker-types";

export const TRACKER_STORAGE_KEY = "technikerauswertung.tracker.v4";
export const TRACKER_PENDING_BACKUP_KEY = "technikerauswertung.tracker.pending-backup.v1";

/** Früher fälschlich als eigener Partner-Eintrag angelegt; zählt zu Partner / LKS Partner. */
const LEGACY_CHRISTIAN_ZIMMERMANN_ID = "p1";
const LEGACY_PARTNER_BUCKET_ID = "partner-lks";

const VALID_ROLES = new Set<TechnicianRole>(ROLE_OPTIONS.map((item) => item.id));

export function normalizeTechnician(raw: Partial<Technician> & { name?: string }): Technician | null {
  if (!raw?.id || typeof raw.name !== "string" || raw.name.trim().length === 0) return null;
  const role: TechnicianRole = VALID_ROLES.has(raw.role as TechnicianRole)
    ? (raw.role as TechnicianRole)
    : "fieldservice";
  return {
    id: raw.id,
    name: raw.name.trim(),
    role,
    email: typeof raw.email === "string" ? raw.email.trim() : "",
    street: typeof raw.street === "string" ? raw.street.trim() : "",
    plz: typeof raw.plz === "string" ? raw.plz.replace(/\D/g, "").slice(0, 5) : "",
    city: typeof raw.city === "string" ? raw.city.trim() : "",
    endStreet: typeof raw.endStreet === "string" ? raw.endStreet.trim() : "",
    endPlz: typeof raw.endPlz === "string" ? raw.endPlz.replace(/\D/g, "").slice(0, 5) : "",
    endCity: typeof raw.endCity === "string" ? raw.endCity.trim() : "",
  };
}

export function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateInput(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function formatDisplayDate(value: string): string {
  const date = parseDateInput(value);
  return new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatDayHeader(date: Date): string {
  const weekday = new Intl.DateTimeFormat("de-DE", { weekday: "short" }).format(date);
  const day = String(date.getDate()).padStart(2, "0");
  return `${weekday} ${day}`;
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/** Letzter Werktag vor dem angegebenen Tag (Mo–Fr, Wochenenden übersprungen). */
export function previousWorkday(from: Date = new Date()): Date {
  const date = new Date(from);
  date.setHours(12, 0, 0, 0);
  do {
    date.setDate(date.getDate() - 1);
  } while (isWeekend(date));
  return date;
}

/** Nächster Werktag nach dem angegebenen Tag (Mo–Fr, Wochenenden übersprungen). */
export function nextWorkday(from: Date = new Date()): Date {
  const date = new Date(from);
  date.setHours(12, 0, 0, 0);
  do {
    date.setDate(date.getDate() + 1);
  } while (isWeekend(date));
  return date;
}

export function daysInMonth(year: number, monthIndex: number): Date[] {
  const days: Date[] = [];
  const total = new Date(year, monthIndex + 1, 0).getDate();
  for (let day = 1; day <= total; day += 1) {
    days.push(new Date(year, monthIndex, day));
  }
  return days;
}

export function getTicketCount(
  tickets: TicketMap,
  technicianId: string,
  date: string,
): number | null {
  const key = ticketKey(technicianId, date);
  return Object.prototype.hasOwnProperty.call(tickets, key) ? tickets[key]! : null;
}

export function getDayStatus(
  statuses: StatusMap,
  technicianId: string,
  date: string,
): DayStatus {
  return statuses[ticketKey(technicianId, date)] ?? "tickets";
}

export function getDayNote(notes: NoteMap, technicianId: string, date: string): string {
  return notes[ticketKey(technicianId, date)] ?? "";
}

export function getStatusMeta(status: DayStatus) {
  return STATUS_OPTIONS.find((item) => item.id === status) ?? STATUS_OPTIONS[0];
}

export function ticketTone(count: number | null): "blank" | "zero" | "low" | "ok" {
  if (count === null) return "blank";
  if (count <= 0) return "zero";
  if (count < 3) return "low";
  return "ok";
}

export function createDefaultTracker(year = new Date().getFullYear()): TrackerState {
  return {
    year,
    technicians: DEFAULT_TECHNICIANS.map((tech) => ({ ...tech })),
    tickets: {},
    statuses: {},
    notes: {},
    openTickets: {},
    openStatuses: {},
    openNotes: {},
    tourTickets: {},
  };
}

/** Ergänzt fehlende Standard-Techniker (z. B. neue Onsite-Liste), ohne vorhandene zu überschreiben. */
export function mergeDefaultTechnicians(technicians: Technician[]): Technician[] {
  const byName = new Set(technicians.map((tech) => tech.name.trim().toLowerCase()));
  const byId = new Set(technicians.map((tech) => tech.id));
  const missing = DEFAULT_TECHNICIANS.filter(
    (tech) => !byName.has(tech.name.trim().toLowerCase()) && !byId.has(tech.id),
  ).map((tech) => ({ ...tech }));
  return missing.length > 0 ? [...technicians, ...missing] : technicians;
}

function moveKeyedRecords(
  sourceId: string,
  targetId: string,
  tickets: TicketMap,
  statuses: StatusMap,
  notes: NoteMap,
) {
  const prefix = `${sourceId}|`;
  for (const key of Object.keys(tickets)) {
    if (!key.startsWith(prefix)) continue;
    const date = key.slice(prefix.length);
    const targetKey = ticketKey(targetId, date);
    tickets[targetKey] = (tickets[targetKey] ?? 0) + (tickets[key] ?? 0);
    delete tickets[key];
  }
  for (const key of Object.keys(statuses)) {
    if (!key.startsWith(prefix)) continue;
    const date = key.slice(prefix.length);
    const targetKey = ticketKey(targetId, date);
    if (!statuses[targetKey]) statuses[targetKey] = statuses[key];
    delete statuses[key];
  }
  for (const key of Object.keys(notes)) {
    if (!key.startsWith(prefix)) continue;
    const date = key.slice(prefix.length);
    const targetKey = ticketKey(targetId, date);
    if (!notes[targetKey]) notes[targetKey] = notes[key];
    delete notes[key];
  }
}

/** Christian Zimmermann ist kein eigener DB-Eintrag – Tickets gehören zu Partner / LKS Partner. */
export function foldChristianZimmermannIntoPartner(state: TrackerState): TrackerState {
  const legacy = state.technicians.filter(
    (tech) =>
      tech.id === LEGACY_CHRISTIAN_ZIMMERMANN_ID ||
      tech.name.trim().toLowerCase() === "christian zimmermann",
  );
  if (legacy.length === 0) return state;

  const tickets = { ...state.tickets };
  const statuses = { ...state.statuses };
  const notes = { ...state.notes };
  const openTickets = { ...state.openTickets };
  const openStatuses = { ...state.openStatuses };
  const openNotes = { ...state.openNotes };
  const tourTickets = { ...state.tourTickets };
  for (const tech of legacy) {
    moveKeyedRecords(tech.id, LEGACY_PARTNER_BUCKET_ID, tickets, statuses, notes);
    moveKeyedRecords(tech.id, LEGACY_PARTNER_BUCKET_ID, openTickets, openStatuses, openNotes);
    const prefix = `${tech.id}|`;
    for (const key of Object.keys(tourTickets)) {
      if (!key.startsWith(prefix)) continue;
      const date = key.slice(prefix.length);
      const targetKey = ticketKey(LEGACY_PARTNER_BUCKET_ID, date);
      tourTickets[targetKey] = (tourTickets[targetKey] ?? 0) + (tourTickets[key] ?? 0);
      delete tourTickets[key];
    }
  }

  const removeIds = new Set(legacy.map((tech) => tech.id));
  return {
    ...state,
    technicians: state.technicians.filter((tech) => !removeIds.has(tech.id)),
    tickets,
    statuses,
    notes,
    openTickets,
    openStatuses,
    openNotes,
    tourTickets,
  };
}

export function loadTrackerFromStorage(): TrackerState {
  if (typeof window === "undefined") return createDefaultTracker();

  try {
    const raw =
      window.localStorage.getItem(TRACKER_STORAGE_KEY) ??
      window.localStorage.getItem("technikerauswertung.tracker.v3");
    if (!raw) return createDefaultTracker();
    const parsed = JSON.parse(raw) as TrackerState;
    return parseTrackerState(parsed) ?? createDefaultTracker();
  } catch {
    return createDefaultTracker();
  }
}

export function saveTrackerToStorage(state: TrackerState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TRACKER_STORAGE_KEY, JSON.stringify(state));
}

export function savePendingTrackerBackup(state: TrackerState, source = "tracker-persist") {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    TRACKER_PENDING_BACKUP_KEY,
    JSON.stringify({
      exportedAt: new Date().toISOString(),
      storageKey: TRACKER_STORAGE_KEY,
      source,
      tracker: state,
    }),
  );
}

export function loadPendingTrackerBackup(): { tracker: TrackerState; source: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TRACKER_PENDING_BACKUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { tracker?: unknown; source?: unknown };
    const tracker = parseTrackerState(parsed.tracker);
    if (!tracker) return null;
    return {
      tracker,
      source: typeof parsed.source === "string" ? parsed.source : "tracker-persist",
    };
  } catch {
    return null;
  }
}

export function clearPendingTrackerBackup() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TRACKER_PENDING_BACKUP_KEY);
}

export function hasTrackerInStorage(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.localStorage.getItem(TRACKER_STORAGE_KEY) ??
      window.localStorage.getItem("technikerauswertung.tracker.v3"),
  );
}

export function parseTrackerState(raw: unknown): TrackerState | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = raw as Partial<TrackerState>;
  if (!Array.isArray(parsed.technicians) || typeof parsed.tickets !== "object") {
    return null;
  }
  const technicians = parsed.technicians
    .map((tech) => normalizeTechnician(tech))
    .filter((tech): tech is Technician => tech !== null);

  const loaded: TrackerState = {
    year: typeof parsed.year === "number" ? parsed.year : new Date().getFullYear(),
    technicians: mergeDefaultTechnicians(
      technicians.length > 0
        ? technicians
        : DEFAULT_TECHNICIANS.map((tech) => ({ ...tech })),
    ),
    tickets: parsed.tickets ?? {},
    statuses: parsed.statuses ?? {},
    notes: parsed.notes ?? {},
    openTickets: parsed.openTickets ?? {},
    openStatuses: parsed.openStatuses ?? {},
    openNotes: parsed.openNotes ?? {},
    tourTickets: parsed.tourTickets ?? {},
  };

  return foldChristianZimmermannIntoPartner(loaded);
}

export async function loadTrackerSnapshotFromPublic(): Promise<TrackerState | null> {
  if (typeof window === "undefined") return null;
  try {
    const response = await fetch("/data/tracker-snapshot.json", { cache: "no-store" });
    if (!response.ok) return null;
    const payload = (await response.json()) as { state?: TrackerState } | TrackerState;
    const state = "state" in payload && payload.state ? payload.state : (payload as TrackerState);
    return parseTrackerState(state);
  } catch {
    return null;
  }
}

export function downloadTrackerSnapshot(state: TrackerState, fileName = "tracker-snapshot.json") {
  if (typeof window === "undefined") return;
  const payload = {
    exportedAt: new Date().toISOString(),
    storageKey: TRACKER_STORAGE_KEY,
    state,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function mergeMaps<T extends Record<string, unknown>>(base: T, overlay: T): T {
  return { ...base, ...overlay };
}

function mergeTechnicianLists(base: Technician[], overlay: Technician[]): Technician[] {
  const byId = new Map<string, Technician>();
  for (const tech of base) byId.set(tech.id, tech);
  for (const tech of overlay) byId.set(tech.id, tech);
  const byName = new Map<string, Technician>();
  for (const tech of byId.values()) {
    const key = tech.name.trim().toLowerCase();
    const existing = byName.get(key);
    if (!existing) byName.set(key, tech);
    else byName.set(key, tech);
  }
  return mergeDefaultTechnicians([...byName.values()]);
}

/**
 * Snapshot zuerst, lokaler Stand überschreibt gleiche Keys.
 * So bleiben historische Seed-Daten erhalten; neue Importe/Einträge werden angefügt.
 */
export function mergeTrackerStates(
  base: TrackerState | null | undefined,
  overlay: TrackerState | null | undefined,
): TrackerState {
  const left = base ?? createDefaultTracker();
  const right = overlay ?? createDefaultTracker();
  return foldChristianZimmermannIntoPartner({
    year: right.year || left.year,
    technicians: mergeTechnicianLists(left.technicians, right.technicians),
    tickets: mergeMaps(left.tickets, right.tickets),
    statuses: mergeMaps(left.statuses, right.statuses),
    notes: mergeMaps(left.notes, right.notes),
    openTickets: mergeMaps(left.openTickets, right.openTickets),
    openStatuses: mergeMaps(left.openStatuses, right.openStatuses),
    openNotes: mergeMaps(left.openNotes, right.openNotes),
    tourTickets: mergeMaps(left.tourTickets, right.tourTickets),
  });
}

/** Erkennt stark geleerte lokale Daten (z. B. versehentliches Löschen der Technikerliste). */
export function isTrackerLikelyWiped(
  local: TrackerState | null | undefined,
  snapshot: TrackerState | null | undefined,
): boolean {
  if (!local || !snapshot) return false;
  const localTickets = Object.keys(local.tickets ?? {}).length;
  const snapTickets = Object.keys(snapshot.tickets ?? {}).length;
  const localTechs = local.technicians?.length ?? 0;
  const snapTechs = snapshot.technicians?.length ?? 0;
  if (snapTickets < 20 && snapTechs < 5) return false;
  const ticketsWiped = snapTickets > 0 && localTickets < Math.max(10, snapTickets * 0.35);
  const techsWiped = snapTechs > 0 && localTechs < Math.max(3, snapTechs * 0.5);
  return ticketsWiped || techsWiped;
}

/**
 * Stellt fehlende Techniker/Tickets aus dem Snapshot wieder her,
 * ohne neuere lokale Einträge zu verwerfen.
 */
export function recoverTrackerFromSnapshot(
  local: TrackerState | null | undefined,
  snapshot: TrackerState | null | undefined,
): TrackerState {
  // Snapshot als Overlay: fehlende Keys/Techniker kommen zurück
  return mergeTrackerStates(local, snapshot);
}

/** Auswertung startet ab diesem Datum (kein früherer Monat wählbar). */
export const EVALUATION_START = "2026-01-01";
export const EVALUATION_START_YEAR = 2026;
export const EVALUATION_START_MONTH_INDEX = 0;

export function clampToEvaluationStart(date: string): string {
  return date < EVALUATION_START ? EVALUATION_START : date;
}

export function isMonthInEvaluationRange(year: number, monthIndex: number): boolean {
  const lastDay = toDateInputValue(new Date(year, monthIndex + 1, 0));
  return lastDay >= EVALUATION_START;
}

export function availableYears(currentYear = new Date().getFullYear()): number[] {
  const end = Math.max(currentYear + 1, EVALUATION_START_YEAR);
  const years: number[] = [];
  for (let year = EVALUATION_START_YEAR; year <= end; year += 1) {
    years.push(year);
  }
  return years;
}
