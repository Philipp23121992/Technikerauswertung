import { findBestColumn, findTechnicianColumn } from "@/lib/analyze";
import { slaDueDate } from "@/lib/disposition/priority";
import { kennzeichenHasPartsArrived, kennzeichenTags } from "@/lib/disposition/types";
import { parseFlexibleDate } from "@/lib/ticket-import";
import type { ImportedDataset } from "@/lib/types";
import { countBusinessDaysUsed } from "@/sla/lib/businessDays";
import { matchCustomer } from "@/sla/lib/match";
import type { Customer, SlaType } from "@/sla/types";
import type { Aelter3TageStoredTicket } from "./aelter-3-tage-types";

export function businessDaysBetween(
  fromDate: string | null | undefined,
  toDate: string | null | undefined,
): number | null {
  if (!fromDate || !toDate) return null;
  return countBusinessDaysUsed(`${fromDate}T12:00:00`, `${toDate}T12:00:00`);
}

export function matchSlaCustomerForName(customer: string, customers: Customer[]): Customer | null {
  return matchCustomer(customer, customers);
}

export function slaOverdueWorkdays(
  createdAt: string,
  referenceDate: string,
  slaType: SlaType | null,
): number | null {
  if (!slaType) return null;
  const slaDue = slaDueDate(createdAt, slaType);
  if (!slaDue || referenceDate <= slaDue) return null;
  return businessDaysBetween(slaDue, referenceDate);
}

export const DEFAULT_AGE_THRESHOLD_DAYS = 3;

const CREATED_ALIASES = [
  "erstelltam",
  "erstellt",
  "erstellungsdatum",
  "anlagedatum",
  "angelegtam",
  "openedat",
  "opened",
  "createdat",
  "createdon",
  "created",
  "syscreatedon",
  "opendate",
  "openeddate",
  "ticketdatum",
];

const ZIELTERMIN_ALIASES = [
  "zieltermin",
  "targetdate",
  "target_date",
  "duedate",
  "due_date",
];

const WUNSCHTERMIN_ALIASES = [
  "wunschtermin",
  "wunschdatum",
  "wunschterminvomkunden",
  "kundenwunschtermin",
  "desireddate",
  "requesteddate",
  "preferreddate",
  "customerrequesteddate",
  "geplanterwunschtermin",
];

const TICKET_ALIASES = [
  "ticketnummer",
  "ticketnr",
  "ticketno",
  "ticket",
  "vorgangsnummer",
  "vorgang",
  "auftrag",
  "casenumber",
  "incident",
  "nummer",
];

const CUSTOMER_ALIASES = [
  "kundenname",
  "kunde",
  "firma",
  "customer",
  "unternehmen",
  "endkunde",
  "account",
  "company",
];

const STATUS_ALIASES = ["status", "ticketstatus", "state", "zustand", "phase"];

const KENNZEICHEN_ALIASES = [
  "kennzeichen",
  "kennzeichenliste",
  "ticketkennzeichen",
  "merkmale",
  "tags",
  "label",
  "flags",
];

const LAST_ACTION_ALIASES = [
  "letzteaktion",
  "letzteaktivitaet",
  "letzteaenderung",
  "letzterkommentar",
  "lastaction",
  "lastactivity",
  "lastupdate",
  "letztesupdate",
  "dateoflastaction",
  "letztebearbeitung",
];

function normalizeHeaderKey(header: string): string {
  return header
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function headersExcept(headers: string[], ...exclude: Array<string | null | undefined>): string[] {
  const skip = new Set(
    exclude
      .filter((item): item is string => Boolean(item))
      .map((item) => normalizeHeaderKey(item)),
  );
  return headers.filter((header) => !skip.has(normalizeHeaderKey(header)));
}

function findZielterminColumn(headers: string[], createdColumn: string | null): string | null {
  const pool = headersExcept(headers, createdColumn);
  const fromAliases = findBestColumn(pool, ZIELTERMIN_ALIASES);
  if (fromAliases) return fromAliases;
  for (const header of pool) {
    const key = normalizeHeaderKey(header);
    if (key.includes("wunsch")) continue;
    if (key.includes("zieltermin")) return header;
    if (key.includes("ziel") && key.includes("termin")) return header;
  }
  return null;
}

function findWunschterminColumn(
  headers: string[],
  zielterminColumn: string | null,
  createdColumn: string | null,
): string | null {
  const pool = headersExcept(headers, zielterminColumn, createdColumn);
  const fromAliases = findBestColumn(pool, WUNSCHTERMIN_ALIASES);
  if (fromAliases) return fromAliases;
  for (const header of pool) {
    const key = normalizeHeaderKey(header);
    if (key.includes("wunsch") && (key.includes("termin") || key.includes("datum"))) return header;
    if (key.includes("requested") && key.includes("date")) return header;
    if (key.includes("desired") && key.includes("date")) return header;
  }
  return null;
}

function findLastActionColumn(headers: string[]): string | null {
  const fromAliases = findBestColumn(headers, LAST_ACTION_ALIASES);
  if (fromAliases) return fromAliases;
  for (const header of headers) {
    const key = normalizeHeaderKey(header);
    if (key.includes("letzteaktion") || key.includes("lastaction")) return header;
    if (key.includes("letzte") && key.includes("aktion")) return header;
    if (key.includes("letzte") && key.includes("aktivitaet")) return header;
  }
  return null;
}

const CLOSED_STATUS_RE =
  /\b(geschlossen|closed|resolved|erledigt|abgeschlossen|cancelled|canceled|storniert|completed|done)\b/i;

export type TicketAgeRow = {
  ticketNo: string;
  technician: string;
  customer: string;
  status: string;
  kennzeichen: string;
  lastAction: string;
  createdAt: string;
  zieltermin: string | null;
  wunschtermin: string | null;
  hasZieltermin: boolean;
  zielterminOverdue: boolean;
  wunschterminOverdue: boolean;
  ageDays: number;
  ageWorkdays: number;
  olderThanThreshold: boolean;
  overdueDays: number | null;
  overdueZielWorkdays: number | null;
  slaType: SlaType | null;
  slaCustomerName: string | null;
  slaOverdueWorkdays: number | null;
  ersatzteileAngekommen: boolean;
  lidlBerechnen: boolean;
  umzugUmbauInstallation: boolean;
  skippedClosed: boolean;
};

export type TechnicianAgeSummary = {
  technician: string;
  total: number;
  older: number;
  within: number;
};

export type TicketAgeAnalysis = {
  fileName: string;
  referenceDate: string;
  thresholdDays: number;
  totalRows: number;
  parsedRows: number;
  skippedRows: number;
  skippedClosedRows: number;
  olderCount: number;
  withinCount: number;
  withZielterminCount: number;
  overdueCount: number;
  ersatzteileCount: number;
  lidlCount: number;
  umzugCount: number;
  techColumn: string | null;
  createdColumn: string | null;
  ticketColumn: string | null;
  customerColumn: string | null;
  zielterminColumn: string | null;
  wunschterminColumn: string | null;
  statusColumn: string | null;
  kennzeichenColumn: string | null;
  lastActionColumn: string | null;
  rows: TicketAgeRow[];
  byTechnician: TechnicianAgeSummary[];
};

export function calendarDayDiff(fromDate: string, toDate: string): number {
  const from = new Date(`${fromDate}T12:00:00`);
  const to = new Date(`${toDate}T12:00:00`);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

export function ticketStableKey(row: Pick<TicketAgeRow, "ticketNo" | "createdAt" | "customer">): string {
  const no = row.ticketNo.trim().toUpperCase();
  if (no) return `t:${no}`;
  const customer = row.customer.trim().toLowerCase().replace(/\s+/g, " ");
  return `f:${row.createdAt}|${customer}`;
}

export function kennzeichenHasLidlBerechnen(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  const lower = value.toLowerCase();
  if (/lidl\s*[-–]?\s*berechnen/.test(lower)) return true;
  return kennzeichenTags(value).some((tag) => /lidl\s*[-–]?\s*berechnen/i.test(tag));
}

export function kennzeichenHasUmzugUmbauInstallation(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  const re = /\b(umzug|umbau|installation)\b/i;
  if (re.test(value)) return true;
  return kennzeichenTags(value).some((tag) => re.test(tag));
}

function isClosedStatus(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return CLOSED_STATUS_RE.test(trimmed);
}

function pickColumn(headers: string[], aliases: string[], exclude: string | null = null): string | null {
  return findBestColumn(headers, aliases, exclude);
}

function computeZielOverdueWorkdays(
  zieltermin: string | null,
  referenceDate: string,
): number | null {
  if (!zieltermin || referenceDate <= zieltermin) return null;
  return businessDaysBetween(zieltermin, referenceDate);
}

export function buildTicketAgeRow(
  input: {
    ticketNo: string;
    technician: string;
    customer: string;
    status: string;
    kennzeichen: string;
    lastAction: string;
    createdAt: string;
    zieltermin: string | null;
    wunschtermin: string | null;
  },
  referenceDate: string,
  thresholdDays: number,
  customers: Customer[] = [],
): TicketAgeRow {
  const kennzeichen = input.kennzeichen ?? "";
  const ageWorkdays = businessDaysBetween(input.createdAt, referenceDate) ?? 0;
  const ageDays = calendarDayDiff(input.createdAt, referenceDate);
  const hasZieltermin = Boolean(input.zieltermin);
  const overdueZielWorkdays = computeZielOverdueWorkdays(input.zieltermin, referenceDate);
  const zielterminOverdue = overdueZielWorkdays != null && overdueZielWorkdays > 0;
  const wunschterminOverdue =
    !hasZieltermin &&
    Boolean(input.wunschtermin) &&
    referenceDate > input.wunschtermin!;
  const slaCustomer = matchSlaCustomerForName(input.customer, customers);

  return {
    ...input,
    kennzeichen,
    hasZieltermin,
    zielterminOverdue,
    wunschterminOverdue,
    ageDays,
    ageWorkdays,
    olderThanThreshold: ageWorkdays > thresholdDays,
    overdueDays: overdueZielWorkdays,
    overdueZielWorkdays,
    slaType: slaCustomer?.slaType ?? null,
    slaCustomerName: slaCustomer?.name ?? null,
    slaOverdueWorkdays: slaOverdueWorkdays(input.createdAt, referenceDate, slaCustomer?.slaType ?? null),
    ersatzteileAngekommen: kennzeichenHasPartsArrived(kennzeichen),
    lidlBerechnen: kennzeichenHasLidlBerechnen(kennzeichen),
    umzugUmbauInstallation: kennzeichenHasUmzugUmbauInstallation(kennzeichen),
    skippedClosed: false,
  };
}

export function refreshStoredTicketAges(
  ticket: Aelter3TageStoredTicket,
  referenceDate: string,
  thresholdDays: number,
  customers: Customer[] = [],
): Aelter3TageStoredTicket {
  const base = buildTicketAgeRow(
    {
      ticketNo: ticket.ticketNo,
      technician: ticket.technician,
      customer: ticket.customer,
      status: ticket.status,
      kennzeichen: ticket.kennzeichen,
      lastAction: ticket.lastAction ?? "",
      createdAt: ticket.createdAt,
      zieltermin: ticket.zieltermin,
      wunschtermin: ticket.wunschtermin ?? null,
    },
    referenceDate,
    thresholdDays,
    customers,
  );
  return {
    ...ticket,
    ...base,
  };
}

export function analyzeTicketsOlderThan(
  dataset: ImportedDataset,
  referenceDate: string,
  thresholdDays = DEFAULT_AGE_THRESHOLD_DAYS,
  customers: Customer[] = [],
): TicketAgeAnalysis {
  const headers = dataset.headers;
  const techColumn = findTechnicianColumn(headers);
  const createdColumn = pickColumn(headers, CREATED_ALIASES);
  const ticketColumn = pickColumn(headers, TICKET_ALIASES, createdColumn);
  const customerColumn = pickColumn(headers, CUSTOMER_ALIASES);
  const zielterminColumn = findZielterminColumn(headers, createdColumn);
  const wunschterminColumn = findWunschterminColumn(headers, zielterminColumn, createdColumn);
  const statusColumn = pickColumn(headers, STATUS_ALIASES);
  const kennzeichenColumn = pickColumn(headers, KENNZEICHEN_ALIASES);
  const lastActionColumn = findLastActionColumn(headers);

  const rows: TicketAgeRow[] = [];
  let parsedRows = 0;
  let skippedRows = 0;
  let skippedClosedRows = 0;

  for (const row of dataset.rows) {
    const createdAt = createdColumn ? parseFlexibleDate(row[createdColumn] ?? "") : null;
    if (!createdAt) {
      skippedRows += 1;
      continue;
    }

    const status = statusColumn ? (row[statusColumn] ?? "").trim() : "";
    if (status && isClosedStatus(status)) {
      skippedClosedRows += 1;
      continue;
    }

    const zieltermin = zielterminColumn ? parseFlexibleDate(row[zielterminColumn] ?? "") : null;
    const wunschtermin = wunschterminColumn ? parseFlexibleDate(row[wunschterminColumn] ?? "") : null;
    const kennzeichen = kennzeichenColumn ? (row[kennzeichenColumn] ?? "").trim() : "";
    const lastAction = lastActionColumn ? (row[lastActionColumn] ?? "").trim() : "";

    parsedRows += 1;
    rows.push(
      buildTicketAgeRow(
        {
          ticketNo: ticketColumn ? (row[ticketColumn] ?? "").trim() : "",
          technician: techColumn ? (row[techColumn] ?? "").trim() : "",
          customer: customerColumn ? (row[customerColumn] ?? "").trim() : "",
          status,
          kennzeichen,
          lastAction,
          createdAt,
          zieltermin,
          wunschtermin,
        },
        referenceDate,
        thresholdDays,
        customers,
      ),
    );
  }

  rows.sort(
    (a, b) =>
      a.technician.localeCompare(b.technician, "de") ||
      Number(b.olderThanThreshold) - Number(a.olderThanThreshold) ||
      (b.overdueZielWorkdays ?? 0) - (a.overdueZielWorkdays ?? 0) ||
      b.ageWorkdays - a.ageWorkdays ||
      a.ticketNo.localeCompare(b.ticketNo, "de"),
  );

  const byTechMap = new Map<string, TechnicianAgeSummary>();
  for (const item of rows) {
    const key = item.technician || "(ohne Bearbeiter)";
    const existing = byTechMap.get(key);
    if (existing) {
      existing.total += 1;
      if (item.olderThanThreshold) existing.older += 1;
      else existing.within += 1;
    } else {
      byTechMap.set(key, {
        technician: key,
        total: 1,
        older: item.olderThanThreshold ? 1 : 0,
        within: item.olderThanThreshold ? 0 : 1,
      });
    }
  }

  const byTechnician = [...byTechMap.values()].sort(
    (a, b) => b.older - a.older || b.total - a.total || a.technician.localeCompare(b.technician, "de"),
  );

  const olderCount = rows.filter((item) => item.olderThanThreshold).length;
  const withinCount = rows.length - olderCount;

  return {
    fileName: dataset.fileName,
    referenceDate,
    thresholdDays,
    totalRows: dataset.rows.length,
    parsedRows,
    skippedRows,
    skippedClosedRows,
    olderCount,
    withinCount,
    withZielterminCount: rows.filter((item) => item.hasZieltermin).length,
    overdueCount: rows.filter((item) => item.zielterminOverdue).length,
    ersatzteileCount: rows.filter((item) => item.ersatzteileAngekommen).length,
    lidlCount: rows.filter((item) => item.lidlBerechnen).length,
    umzugCount: rows.filter((item) => item.umzugUmbauInstallation).length,
    techColumn,
    createdColumn,
    ticketColumn,
    customerColumn,
    zielterminColumn,
    wunschterminColumn,
    statusColumn,
    kennzeichenColumn,
    lastActionColumn,
    rows,
    byTechnician,
  };
}

export function exportTicketAgeCsv(
  tickets: Array<TicketAgeRow & { note?: string }>,
): string {
  const header = [
    "Ticket",
    "Erstellt",
    "Bearbeiter",
    "Kunde",
    "Alter AT",
    "Zieltermin",
    "Wunschtermin",
    "Überfällig Zieltermin AT",
    "SLA Typ",
    "SLA überfällig AT",
    "Kennzeichen",
    "Letzte Aktion",
    "Notiz Serviceleitung",
  ];
  const lines = [header.join(";")];
  for (const row of tickets) {
    lines.push(
      [
        row.ticketNo,
        row.createdAt,
        row.technician,
        row.customer,
        String(row.ageWorkdays),
        row.zieltermin ?? "",
        row.wunschtermin ?? "",
        row.overdueZielWorkdays != null ? String(row.overdueZielWorkdays) : "",
        row.slaType ?? "",
        row.slaOverdueWorkdays != null ? String(row.slaOverdueWorkdays) : "",
        row.kennzeichen,
        row.lastAction,
        row.note ?? "",
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(";"),
    );
  }
  return `\uFEFF${lines.join("\r\n")}`;
}
