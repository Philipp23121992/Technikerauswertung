import { addBusinessDays, countBusinessDaysUsed } from "@/sla/lib/businessDays";
import { matchCustomer, normalizeName } from "@/sla/lib/match";
import { formatSlaType } from "@/sla/lib/slaTypes";
import type { Customer, SlaType } from "@/sla/types";
import { todayIso } from "./schedule";
import {
  isImportedTicket,
  isOpenTicket,
  type DispositionTicket,
} from "./types";

export type TicketPrioLevel =
  | "nbd-overdue"
  | "nbd2-overdue"
  | "nbd"
  | "nbd2"
  | "none";

export const TICKET_PRIO_LABELS: Record<TicketPrioLevel, string> = {
  "nbd-overdue": "NBD überfällig",
  "nbd2-overdue": "2nd NBD überfällig",
  nbd: "NBD",
  nbd2: "2nd NBD",
  none: "Kein SLA",
};

export type RankedDispositionTicket = {
  ticket: DispositionTicket;
  customer: Customer | null;
  slaType: SlaType | null;
  slaDue: string | null;
  level: TicketPrioLevel;
  rank: number;
  isPrio: boolean;
  workKind: TicketWorkKind;
};

export type TicketWorkKind = "stoerung" | "umbau" | "none";

export const TICKET_WORK_KIND_LABELS: Record<TicketWorkKind, string> = {
  stoerung: "Störung",
  umbau: "Umbau / Installation",
  none: "—",
};

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return null;
  }
  return date;
}

export function slaDueDate(createdOn: string | null | undefined, slaType: SlaType): string | null {
  const created = parseIsoDate(createdOn);
  if (!created) return null;
  const days = slaType === "NBD" ? 1 : 2;
  return toIsoDate(addBusinessDays(created, days));
}

export function ticketPrioLevel(slaType: SlaType | null, slaDue: string | null, today: string): TicketPrioLevel {
  if (!slaType) return "none";
  const overdue = Boolean(slaDue && slaDue < today);
  if (slaType === "NBD") return overdue ? "nbd-overdue" : "nbd";
  return overdue ? "nbd2-overdue" : "nbd2";
}

export type TicketPrioInfo = {
  slaType: SlaType | null;
  slaDue: string | null;
  level: TicketPrioLevel;
  openWorkdays: number | null;
  isPrio: boolean;
};

export function ticketPrioInfo(
  ticket: DispositionTicket,
  customers: Customer[],
  today = todayIso(),
): TicketPrioInfo {
  const customer = matchSlaCustomerForTicket(ticket, customers);
  const slaType = slaTypeForTicket(ticket, customer);
  const slaDue = slaType ? slaDueDate(ticket.erstelltAm, slaType) : null;
  const asOf =
    ticket.status === "abgeschlossen" && ticket.closedAt
      ? ticket.closedAt.slice(0, 10)
      : today;
  return {
    slaType,
    slaDue,
    level: ticketPrioLevel(slaType, slaDue, asOf),
    openWorkdays: countBusinessDaysUsed(ticket.erstelltAm, asOf),
    isPrio: Boolean(slaType),
  };
}

export function formatOpenWorkdays(days: number | null | undefined, done = false): string | null {
  if (days == null || Number.isNaN(days)) return null;
  if (days === 0) return done ? "0 AT" : "heute erstellt";
  if (days === 1) return "1 AT";
  return `${days} AT`;
}

function prioRank(level: TicketPrioLevel): number {
  switch (level) {
    case "nbd-overdue":
      return 0;
    case "nbd2-overdue":
      return 1;
    case "nbd":
      return 2;
    case "nbd2":
      return 3;
    default:
      return 4;
  }
}

function dateSortKey(value: string | null | undefined): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "9999-12-31";
}

/** Service aus der Importdatei → SLA-Kunde. `slaType: null` = kein NBD, obwohl der Kunde SLA hat. */
export type ServiceCustomerRule = {
  service: string;
  customer: string;
  slaType?: SlaType | null;
};

export const SERVICE_CUSTOMER_RULES: ServiceCustomerRule[] = [
  { service: "DG-Druckerstörung", customer: "DG Nexolution" },
  { service: "DG Druckerstörung", customer: "DG Nexolution" },
  { service: "DM Umbau", customer: "DM Tech", slaType: null },
  { service: "DM-Umbau", customer: "DM Tech", slaType: null },
];

/** Standort/Kunde in der CSV → SLA-Kunde, wenn der Vertragsname nicht in der Adresse steht. */
export const SITE_CUSTOMER_RULES: { site: string; customer: string }[] = [
  { site: "Volksbank", customer: "DG Nexolution" },
  { site: "VR-Bank", customer: "DG Nexolution" },
  { site: "VR Bank", customer: "DG Nexolution" },
  { site: "Raiffeisenbank", customer: "DG Nexolution" },
  { site: "Raiffeisen", customer: "DG Nexolution" },
  { site: "DM", customer: "DM Tech" },
];

export function matchSlaCustomer(customerName: string, customers: Customer[]): Customer | null {
  return matchCustomer(customerName, customers);
}

export function ticketCustomerKeys(
  ticket: Pick<DispositionTicket, "customer" | "street" | "addressLabel">,
): string[] {
  const firstAddress = ticket.addressLabel.split(",")[0] ?? "";
  return [ticket.customer, ticket.street, firstAddress]
    .map((item) => item.trim())
    .filter((item, index, all) => item.length > 0 && all.indexOf(item) === index);
}

function serviceContainsAlias(service: string, alias: string): boolean {
  const key = normalizeName(service);
  const needle = normalizeName(alias);
  if (!key || !needle) return false;
  if (key === needle) return true;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`).test(key);
}

export function matchServiceRule(service: string): ServiceCustomerRule | null {
  const raw = service.trim();
  if (!raw) return null;
  for (const rule of SERVICE_CUSTOMER_RULES) {
    if (serviceContainsAlias(raw, rule.service)) return rule;
  }
  return null;
}

export function matchSlaCustomerFromService(
  service: string,
  customers: Customer[],
): Customer | null {
  const rule = matchServiceRule(service);
  if (!rule) return null;
  return matchCustomer(rule.customer, customers);
}

export function matchSlaCustomerForTicket(
  ticket: Pick<DispositionTicket, "customer" | "street" | "addressLabel" | "service">,
  customers: Customer[],
): Customer | null {
  const fromService = matchSlaCustomerFromService(ticket.service ?? "", customers);
  if (fromService) return fromService;
  const keys = ticketCustomerKeys(ticket);
  for (const key of keys) {
    const matched = matchCustomer(key, customers);
    if (matched) return matched;
  }
  for (const key of keys) {
    for (const rule of SITE_CUSTOMER_RULES) {
      if (!serviceContainsAlias(key, rule.site)) continue;
      const mapped = matchCustomer(rule.customer, customers);
      if (mapped) return mapped;
    }
  }
  return null;
}

export function classifyWorkKind(ticket: {
  service?: string;
  kennzeichen?: string;
  summary?: string;
  title?: string;
  note?: string;
}): TicketWorkKind {
  const blob = normalizeName(
    [ticket.summary, ticket.kennzeichen, ticket.service, ticket.title, ticket.note]
      .filter(Boolean)
      .join(" "),
  );
  if (!blob) return "none";
  if (/(?:^|\s)(?:umbau|installation|umzug|aufbau|abbau)(?:\s|$)/.test(blob)) return "umbau";
  if (
    /(?:^|\s)(?:stoerung|storung|druckerstoerung|druckerstorung|defekt|repair|fehler)(?:\s|$)/.test(
      blob,
    )
  ) {
    return "stoerung";
  }
  if (/(?:^|\s)break(?:\s|$).*(?:^|\s)fix(?:\s|$)/.test(blob) || /(?:^|\s)break fix(?:\s|$)/.test(blob)) {
    return "stoerung";
  }
  return "none";
}

export function ticketWorkKind(
  ticket: Parameters<typeof classifyWorkKind>[0] & {
    workKindManual?: TicketWorkKind | null;
  },
): TicketWorkKind {
  if (
    ticket.workKindManual === "stoerung" ||
    ticket.workKindManual === "umbau" ||
    ticket.workKindManual === "none"
  ) {
    return ticket.workKindManual;
  }
  return classifyWorkKind(ticket);
}

export function slaTypeForTicket(
  ticket: Pick<DispositionTicket, "service" | "kennzeichen" | "summary" | "title" | "note"> & {
    workKindManual?: TicketWorkKind | null;
  },
  customer: Customer | null,
): SlaType | null {
  if (ticketWorkKind(ticket) !== "stoerung") return null;
  const rule = matchServiceRule(ticket.service ?? "");
  if (rule && "slaType" in rule) return rule.slaType ?? null;
  return customer?.slaType ?? null;
}

export function rankDispositionTickets(
  tickets: DispositionTicket[],
  customers: Customer[],
  today = todayIso(),
): RankedDispositionTicket[] {
  const ranked = tickets
    .filter((ticket) => isImportedTicket(ticket) && isOpenTicket(ticket))
    .map((ticket) => {
      const customer = matchSlaCustomerForTicket(ticket, customers);
      const workKind = ticketWorkKind(ticket);
      const slaType = slaTypeForTicket(ticket, customer);
      const slaDue = slaType ? slaDueDate(ticket.erstelltAm, slaType) : null;
      const level = ticketPrioLevel(slaType, slaDue, today);
      return {
        ticket,
        customer,
        slaType,
        slaDue,
        level,
        rank: prioRank(level),
        isPrio: level !== "none",
        workKind,
      };
    });

  ranked.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    const due = dateSortKey(a.slaDue).localeCompare(dateSortKey(b.slaDue));
    if (due) return due;
    const ziel = dateSortKey(a.ticket.zieltermin).localeCompare(dateSortKey(b.ticket.zieltermin));
    if (ziel) return ziel;
    const wunsch = dateSortKey(a.ticket.termin).localeCompare(dateSortKey(b.ticket.termin));
    if (wunsch) return wunsch;
    const created = dateSortKey(a.ticket.erstelltAm).localeCompare(dateSortKey(b.ticket.erstelltAm));
    if (created) return created;
    return (a.ticket.ticketNo || a.ticket.customer).localeCompare(
      b.ticket.ticketNo || b.ticket.customer,
      "de",
    );
  });

  return ranked;
}

export { formatSlaType };
