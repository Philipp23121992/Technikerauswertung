import { createId } from "@/lib/id";
import {
  DEFAULT_SERVICE_MIN,
  MAX_CUSTOM_DURATION_MIN,
  MAX_TICKET_DURATION_MIN,
  clampDuration,
  parseClockMin,
  workdaysInRange,
} from "./schedule";

export const DISPOSITION_FLAGS = [
  "ersatzteilBestellt",
  "ersatzteilAusLager",
  "kostenvoranschlag",
  "ohneGarantieBestellt",
  "ersatzteileEingetroffen",
] as const;

export type DispositionFlag = (typeof DISPOSITION_FLAGS)[number];

export const DISPOSITION_FLAG_LABELS: Record<DispositionFlag, string> = {
  ersatzteilBestellt: "Ersatzteil bestellt",
  ersatzteilAusLager: "Ersatzteil aus Lager",
  kostenvoranschlag: "Kostenvoranschlag",
  ohneGarantieBestellt: "Ohne Garantie bestellt",
  ersatzteileEingetroffen: "Ersatzteile angekommen",
};

export type DispositionFlags = Record<DispositionFlag, boolean>;

export type DispositionReadiness = "bereit" | "lager" | "warten" | "kv";

export const DISPOSITION_READINESS_LABELS: Record<DispositionReadiness, string> = {
  bereit: "Einsatzbereit",
  lager: "Lager holen",
  warten: "Wartet auf Teile",
  kv: "Kostenvoranschlag",
};

export type DispositionTicketStatus = "offen" | "abgeschlossen";

export type DispositionTicketKind = "ticket" | "custom";

/** Import-Tickets ohne Fieldservice- oder Onsidetechniker (Partner). */
export const UNASSIGNED_TECH_ID = "unassigned";
export const UNASSIGNED_TECH_NAME = "Kein Bearbeiter";

export type DispositionTicket = {
  id: string;
  fingerprint: string;
  kind: DispositionTicketKind;
  technicianId: string;
  technicianName: string;
  ticketNo: string;
  title: string;
  customer: string;
  /** Service aus der Importdatei (z. B. DG-Druckerstörung). */
  service: string;
  /** Kurztext/Zusammenfassung aus der Importdatei. */
  summary: string;
  street: string;
  plz: string;
  city: string;
  addressLabel: string;
  zieltermin: string | null;
  /** CSV-Fallback (Termin/Einsatzdatum), nur genutzt wenn kein Zieltermin gesetzt ist. */
  termin: string | null;
  /** Ticket-Erstelldatum aus der Importdatei (Erstellt am). */
  erstelltAm: string | null;
  spanEnd: string | null;
  note: string;
  kennzeichen: string;
  /** Manuelle Art; null = aus Zusammenfassung / Kennzeichen erkannt. */
  workKindManual: "stoerung" | "umbau" | "none" | null;
  /** Freie Dispo-Notiz, bleibt beim Import erhalten. */
  plannerNote: string;
  lat: number | null;
  lon: number | null;
  flags: DispositionFlags;
  status: DispositionTicketStatus;
  closedAt: string | null;
  importedAt: string;
  sourceFile: string;
  plannedStartMin: number | null;
  durationMin: number;
  /** Automatische Tour (Kanban Tour) – unabhängig von Wunsch-/Zieltermin. */
  tourDate: string | null;
  tourStartMin: number | null;
  updates: DispositionTicketUpdate[];
};

export type DispositionTicketUpdate = {
  id: string;
  at: string;
  text: string;
};

export type DispositionHome = {
  technicianId: string;
  technicianName: string;
  plz: string;
  city: string;
  street: string;
  lat: number | null;
  lon: number | null;
  endStreet: string;
  endPlz: string;
  endCity: string;
  endLat: number | null;
  endLon: number | null;
};

export type DispositionImportStats = {
  kept: number;
  neu: number;
  closed: number;
  reopened: number;
  moved: number;
  unassigned: number;
};

export type DispositionDb = {
  version: 1;
  tickets: DispositionTicket[];
  homes: DispositionHome[];
  lastImportAt: string | null;
  lastImportFile: string | null;
  lastImportStats: DispositionImportStats | null;
};

export type DispositionTicketDraft = {
  fingerprint: string;
  technicianId: string;
  technicianName: string;
  ticketNo: string;
  customer: string;
  service: string;
  summary: string;
  street: string;
  plz: string;
  city: string;
  addressLabel: string;
  zieltermin: string | null;
  termin: string | null;
  erstelltAm: string | null;
  note: string;
  kennzeichen: string;
};

export function emptyFlags(): DispositionFlags {
  return {
    ersatzteilBestellt: false,
    ersatzteilAusLager: false,
    kostenvoranschlag: false,
    ohneGarantieBestellt: false,
    ersatzteileEingetroffen: false,
  };
}

export function normalizeFlags(raw: Partial<DispositionFlags> | undefined): DispositionFlags {
  const base = emptyFlags();
  for (const key of DISPOSITION_FLAGS) {
    base[key] = Boolean(raw?.[key]);
  }
  return base;
}

export function isOpenTicket(ticket: Pick<DispositionTicket, "status">): boolean {
  return ticket.status !== "abgeschlossen";
}

export function isCustomTicket(ticket: Pick<DispositionTicket, "kind">): boolean {
  return ticket.kind === "custom";
}

export function isImportedTicket(ticket: Pick<DispositionTicket, "kind">): boolean {
  return ticket.kind !== "custom";
}

export function isAssignedTicket(ticket: Pick<DispositionTicket, "technicianId">): boolean {
  const id = ticket.technicianId.trim();
  return Boolean(id) && id !== UNASSIGNED_TECH_ID;
}

export function kennzeichenTags(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const PARTS_ARRIVED_TAGS = new Set([
  "ersatzteile angekommen",
  "ersatzteil angekommen",
  "ersatzteile eingetroffen",
  "ersatzteil eingetroffen",
]);

export function kennzeichenHasPartsArrived(value: string | null | undefined): boolean {
  return kennzeichenTags(value).some((tag) => PARTS_ARRIVED_TAGS.has(tag.toLowerCase()));
}

export function ticketHasPartsArrived(
  ticket: Pick<DispositionTicket, "flags" | "kennzeichen">,
): boolean {
  return ticket.flags.ersatzteileEingetroffen || kennzeichenHasPartsArrived(ticket.kennzeichen);
}

export function isRoutableTicket(
  ticket: Pick<DispositionTicket, "status" | "kind" | "technicianId">,
): boolean {
  return isImportedTicket(ticket) && isOpenTicket(ticket) && isAssignedTicket(ticket);
}

export function isKanbanTicket(ticket: Pick<DispositionTicket, "technicianId">): boolean {
  return isAssignedTicket(ticket);
}

function asIsoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

export function ticketScheduleStart(
  ticket: Pick<DispositionTicket, "zieltermin" | "termin">,
): string | null {
  return ticket.zieltermin || ticket.termin || null;
}

export function ticketSpanEnd(
  ticket: Pick<DispositionTicket, "zieltermin" | "termin" | "spanEnd">,
): string | null {
  const start = ticketScheduleStart(ticket);
  if (!start) return null;
  if (ticket.spanEnd && ticket.spanEnd > start) return ticket.spanEnd;
  return start;
}

export function ticketOccupiesDate(
  ticket: Pick<DispositionTicket, "zieltermin" | "termin" | "spanEnd" | "status" | "closedAt">,
  date: string,
): boolean {
  const start = ticketScheduleStart(ticket);
  if (start) {
    const end = ticketSpanEnd(ticket) ?? start;
    return date >= start && date <= end;
  }
  return closedDay(ticket) === date;
}

export function ticketOccupiesTourDate(
  ticket: Pick<DispositionTicket, "tourDate" | "status" | "closedAt">,
  date: string,
): boolean {
  if (ticket.tourDate) return ticket.tourDate === date;
  return closedDay(ticket) === date;
}

export function ticketClosedDay(ticket: Pick<DispositionTicket, "status" | "closedAt">): string | null {
  if (ticket.status !== "abgeschlossen" || !ticket.closedAt) return null;
  const match = ticket.closedAt.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

function closedDay(ticket: Pick<DispositionTicket, "status" | "closedAt">): string | null {
  return ticketClosedDay(ticket);
}

export type TicketLoadFields = Pick<
  DispositionTicket,
  "kind" | "zieltermin" | "termin" | "spanEnd" | "tourDate" | "status" | "closedAt"
>;

/** Offene Wunschtermine – Nachfrage / Vorplanung, nicht der Zieltermin. */
export function ticketOccupiesDemandDate(ticket: TicketLoadFields, date: string): boolean {
  if (!isOpenTicket(ticket) || isCustomTicket(ticket)) return false;
  const wunsch = ticket.termin;
  if (!wunsch) return false;
  return wunsch === date;
}

export function ticketOccupiesZielDate(
  ticket: Pick<DispositionTicket, "zieltermin" | "spanEnd">,
  date: string,
): boolean {
  const start = ticket.zieltermin;
  if (!start) return false;
  const end = ticket.spanEnd && ticket.spanEnd > start ? ticket.spanEnd : start;
  return date >= start && date <= end;
}

/** Offene Tickets am Zieltermin – Plan / Fahrttag. */
export function ticketOccupiesPlanDate(ticket: TicketLoadFields, date: string): boolean {
  if (!isOpenTicket(ticket)) return false;
  return ticketOccupiesZielDate(ticket, date);
}

/** Abgeschlossene Tickets am Abschlusstag, sonst Tour- oder Zieltermin. */
export function ticketOccupiesActualDate(ticket: TicketLoadFields, date: string): boolean {
  if (isOpenTicket(ticket)) return false;
  const done = closedDay(ticket);
  if (done) return done === date;
  if (ticket.tourDate) return ticket.tourDate === date;
  if (ticket.zieltermin) return ticket.zieltermin === date;
  return ticket.termin === date;
}

export type DispositionBoardMode = "plan" | "nachfrage" | "moeglich" | "ist";

export function ticketBoardDate(
  ticket: Pick<DispositionTicket, "zieltermin" | "termin" | "tourDate" | "status" | "closedAt">,
  mode: DispositionBoardMode,
): string | null {
  if (mode === "plan") return ticket.zieltermin;
  if (mode === "nachfrage") return ticket.termin;
  if (mode === "moeglich") return ticket.tourDate;
  return closedDay(ticket) || ticket.tourDate || ticket.zieltermin || ticket.termin;
}

export function ticketOccupiesBoardDate(
  ticket: TicketLoadFields,
  date: string,
  mode: DispositionBoardMode,
): boolean {
  if (mode === "plan") return ticketOccupiesPlanDate(ticket, date);
  if (mode === "nachfrage") return ticketOccupiesDemandDate(ticket, date);
  if (mode === "moeglich") return ticketOccupiesTourDate(ticket, date);
  return ticketOccupiesActualDate(ticket, date);
}

/** Dashboard-Auslastung: offene Tickets am Zieltermin. */
export function ticketOccupiesLoadDate(ticket: TicketLoadFields, date: string): boolean {
  return ticketOccupiesPlanDate(ticket, date);
}

export function ticketDisplayTitle(ticket: Pick<DispositionTicket, "kind" | "title" | "ticketNo" | "customer">): string {
  if (ticket.kind === "custom") return ticket.title || ticket.customer || "Eigener Task";
  return ticket.ticketNo || ticket.customer || "Ticket";
}

function identityPart(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Ticket-Identität unabhängig vom Bearbeiter – für Import-Abgleich. */
export function ticketIdentityKey(ticket: {
  ticketNo?: string;
  customer?: string;
  street?: string;
  plz?: string;
  addressLabel?: string;
  zieltermin?: string | null;
  termin?: string | null;
  fingerprint?: string;
}): string {
  const no = identityPart(ticket.ticketNo);
  if (no) return `no:${no}`;
  const customer = identityPart(ticket.customer);
  const street = identityPart(ticket.street);
  const plz = identityPart(ticket.plz);
  const place = identityPart(ticket.addressLabel);
  const date = ticket.zieltermin || ticket.termin || "";
  if (customer || street || plz || place || date) {
    return `place:${customer}|${plz}|${street || place}|${date}`;
  }
  const fingerprint = (ticket.fingerprint ?? "").trim();
  return fingerprint ? `fp:${fingerprint}` : "";
}

export function ticketMatchKey(ticket: {
  ticketNo?: string;
  fingerprint?: string;
  customer?: string;
  street?: string;
  plz?: string;
  addressLabel?: string;
  zieltermin?: string | null;
  termin?: string | null;
}): string {
  return ticketIdentityKey(ticket);
}

export function ticketReadiness(flags: DispositionFlags): DispositionReadiness {
  const readyByParts = flags.ersatzteileEingetroffen || flags.ersatzteilAusLager;
  if (flags.kostenvoranschlag && !readyByParts) return "kv";
  if ((flags.ersatzteilBestellt || flags.ohneGarantieBestellt) && !readyByParts) {
    return "warten";
  }
  if (flags.ersatzteilAusLager && !flags.ersatzteileEingetroffen) return "lager";
  return "bereit";
}

export function createEmptyDispositionDb(): DispositionDb {
  return {
    version: 1,
    tickets: [],
    homes: [],
    lastImportAt: null,
    lastImportFile: null,
    lastImportStats: null,
  };
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asWorkKindManual(value: unknown): "stoerung" | "umbau" | "none" | null {
  if (value === "stoerung" || value === "umbau" || value === "none") return value;
  return null;
}

function asCoord(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}

export function normalizeTicket(raw: Partial<DispositionTicket>): DispositionTicket | null {
  const kind: DispositionTicketKind = raw.kind === "custom" ? "custom" : "ticket";
  let technicianId = asString(raw.technicianId).trim();
  let technicianName = asString(raw.technicianName).trim();
  if (kind === "custom") {
    if (!technicianId || !technicianName) return null;
  } else if (!technicianId || technicianId === UNASSIGNED_TECH_ID) {
    technicianId = UNASSIGNED_TECH_ID;
    technicianName = technicianName || UNASSIGNED_TECH_NAME;
  } else if (!technicianName) {
    return null;
  }
  const street = asString(raw.street).trim();
  const plz = asString(raw.plz).trim();
  const city = asString(raw.city).trim();
  const addressLabel =
    asString(raw.addressLabel).trim() ||
    [street, plz, city].filter(Boolean).join(", ");
  const zielRaw = asIsoDate(raw.zieltermin);
  const terminRaw = asIsoDate(raw.termin);
  const spanRaw = asIsoDate(raw.spanEnd);
  const startRaw = zielRaw || terminRaw;
  const spanDays =
    startRaw && spanRaw && spanRaw >= startRaw
      ? workdaysInRange(startRaw, spanRaw)
      : startRaw
        ? [startRaw]
        : [];
  const zieltermin = zielRaw ? (spanDays[0] ?? zielRaw) : null;
  const termin = terminRaw;
  const spanEnd = spanDays.length > 1 ? spanDays[spanDays.length - 1] : null;
  const id = asString(raw.id) || createId(kind === "custom" ? "task" : "disp");
  const title = asString(raw.title).trim();
  const customer = asString(raw.customer).trim() || title;
  return {
    id,
    fingerprint:
      asString(raw.fingerprint) ||
      (kind === "custom"
        ? `custom|${id}`
        : `${asString(raw.ticketNo).trim() || customer}|${addressLabel}|${zieltermin ?? termin ?? ""}`),
    kind,
    technicianId,
    technicianName,
    ticketNo: asString(raw.ticketNo).trim(),
    title,
    customer,
    service: asString(raw.service).trim(),
    summary: asString(raw.summary).trim(),
    street,
    plz,
    city,
    addressLabel,
    zieltermin,
    termin,
    erstelltAm: asIsoDate(raw.erstelltAm),
    spanEnd,
    note: asString(raw.note).trim(),
    kennzeichen: asString(raw.kennzeichen).trim(),
    workKindManual: asWorkKindManual(raw.workKindManual),
    plannerNote: asString(raw.plannerNote).trim(),
    lat: asCoord(raw.lat),
    lon: asCoord(raw.lon),
    flags: (() => {
      const flags = normalizeFlags(raw.flags);
      if (kennzeichenHasPartsArrived(asString(raw.kennzeichen))) {
        flags.ersatzteileEingetroffen = true;
      }
      return flags;
    })(),
    status: raw.status === "abgeschlossen" ? "abgeschlossen" : "offen",
    closedAt: typeof raw.closedAt === "string" ? raw.closedAt : null,
    importedAt: asString(raw.importedAt) || new Date().toISOString(),
    sourceFile: asString(raw.sourceFile) || (kind === "custom" ? "kanban" : ""),
    plannedStartMin: parseClockMin(raw.plannedStartMin),
    durationMin: clampDuration(
      raw.durationMin,
      DEFAULT_SERVICE_MIN,
      kind === "custom" ? MAX_CUSTOM_DURATION_MIN : MAX_TICKET_DURATION_MIN,
    ),
    tourDate: asIsoDate(raw.tourDate),
    tourStartMin: parseClockMin(raw.tourStartMin),
    updates: normalizeUpdates(raw.updates),
  };
}

export function normalizeUpdates(raw: unknown): DispositionTicketUpdate[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Partial<DispositionTicketUpdate>;
      const text = asString(row.text).trim();
      if (!text) return null;
      return {
        id: asString(row.id) || createId("upd"),
        at: typeof row.at === "string" && row.at ? row.at : new Date().toISOString(),
        text,
      };
    })
    .filter((item): item is DispositionTicketUpdate => Boolean(item));
}

export function normalizeHome(raw: Partial<DispositionHome>): DispositionHome | null {
  const technicianId = asString(raw.technicianId).trim();
  if (!technicianId) return null;
  return {
    technicianId,
    technicianName: asString(raw.technicianName).trim() || technicianId,
    plz: asString(raw.plz).trim(),
    city: asString(raw.city).trim(),
    street: asString(raw.street).trim(),
    lat: asCoord(raw.lat),
    lon: asCoord(raw.lon),
    endStreet: asString(raw.endStreet).trim(),
    endPlz: asString(raw.endPlz).trim(),
    endCity: asString(raw.endCity).trim(),
    endLat: asCoord(raw.endLat),
    endLon: asCoord(raw.endLon),
  };
}

export function homeStartLabel(home: DispositionHome | null | undefined): string {
  if (!home) return "";
  return [home.street, home.plz, home.city].filter(Boolean).join(", ");
}

export function homeEndLabel(home: DispositionHome | null | undefined): string {
  if (!home) return "";
  const end = [home.endStreet, home.endPlz, home.endCity].filter(Boolean).join(", ");
  return end || homeStartLabel(home);
}

export function homeEndPoint(home: DispositionHome | null | undefined): {
  lat: number;
  lon: number;
} | null {
  if (!home) return null;
  if (home.endLat != null && home.endLon != null) {
    return { lat: home.endLat, lon: home.endLon };
  }
  if (home.lat != null && home.lon != null) {
    return { lat: home.lat, lon: home.lon };
  }
  return null;
}

export function normalizeDb(raw: Partial<DispositionDb> | null): DispositionDb {
  return {
    version: 1,
    tickets: Array.isArray(raw?.tickets)
      ? raw.tickets
          .map((item) => normalizeTicket(item as Partial<DispositionTicket>))
          .filter((item): item is DispositionTicket => Boolean(item))
      : [],
    homes: Array.isArray(raw?.homes)
      ? raw.homes
          .map((item) => normalizeHome(item as Partial<DispositionHome>))
          .filter((item): item is DispositionHome => Boolean(item))
      : [],
    lastImportAt: typeof raw?.lastImportAt === "string" ? raw.lastImportAt : null,
    lastImportFile: typeof raw?.lastImportFile === "string" ? raw.lastImportFile : null,
    lastImportStats:
      raw?.lastImportStats && typeof raw.lastImportStats === "object"
        ? {
            kept: Number(raw.lastImportStats.kept) || 0,
            neu: Number(raw.lastImportStats.neu) || 0,
            closed: Number(raw.lastImportStats.closed) || 0,
            reopened: Number(raw.lastImportStats.reopened) || 0,
            moved: Number(raw.lastImportStats.moved) || 0,
            unassigned: Number(raw.lastImportStats.unassigned) || 0,
          }
        : null,
  };
}
