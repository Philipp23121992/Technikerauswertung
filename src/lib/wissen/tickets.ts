import { createId } from "@/lib/id";

export const PART_PN_RE = /\b(\d{2}X\d{4})\b/gi;
export const ERROR_CODE_RE = /\b(\d{2,3}\.\d{1,3}[A-Za-z])\b/g;
export const ERROR_CODE_PLAIN_RE = /\b(\d{3}\.\d{2,3})\b/g;
export const ERROR_CODE_HP_RE = /\b((?:10|11|12|13|20|21|40|41|42|44|48|49|50|51|52|54|55|57|58|59|60|62|65|68|69|79|81|82|98|99)\.\d{2})\b/g;
export const MODEL_RE =
  /\b((?:CX|CM|CP|LJ)\s?-?\d{3,5}[A-Za-z0-9]*|M(?:FP)?\s?-?\d{3,4}[A-Za-z0-9]*|E\d{4,5}[A-Za-z0-9]*)\b/gi;

const DATE_FULL_RE = /\b\d{1,2}\.\d{1,2}\.\d{2,4}\b/g;

export type KnowledgeTicket = {
  id: string;
  ticketNo: string;
  model: string;
  customer: string;
  summary: string;
  note: string;
  text: string;
  errorCodes: string[];
  partNumbers: string[];
  closed: boolean;
  closedAt: string | null;
  sourceFile: string;
  importedAt: string;
};

export type WissenTicketsImportStats = {
  kept: number;
  neu: number;
  updated: number;
  skipped: number;
};

export type WissenTicketsDb = {
  version: 1;
  tickets: KnowledgeTicket[];
  lastImportAt: string | null;
  lastImportFile: string | null;
  lastImportStats: WissenTicketsImportStats | null;
};

export function createEmptyWissenTicketsDb(): WissenTicketsDb {
  return {
    version: 1,
    tickets: [],
    lastImportAt: null,
    lastImportFile: null,
    lastImportStats: null,
  };
}

export function normalizeTicketNo(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function uniqueUpper(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const next = value.replace(/\s+/g, "").toUpperCase();
    if (!next || seen.has(next)) continue;
    seen.add(next);
    out.push(next);
  }
  return out;
}

export function extractPartNumbers(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(PART_PN_RE)) found.push(match[1]);
  return uniqueUpper(found);
}

export function extractErrorCodes(text: string): string[] {
  const withoutDates = text.replace(DATE_FULL_RE, " ");
  const found: string[] = [];
  for (const match of withoutDates.matchAll(ERROR_CODE_RE)) found.push(match[1]);
  for (const match of withoutDates.matchAll(ERROR_CODE_PLAIN_RE)) found.push(match[1]);
  for (const match of withoutDates.matchAll(ERROR_CODE_HP_RE)) found.push(match[1]);
  return uniqueUpper(found);
}

export function extractModels(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(MODEL_RE)) found.push(match[1]);
  return uniqueUpper(found);
}

export function pickPrimaryModel(models: string[], fallback = ""): string {
  const fromFallback = fallback ? extractModels(fallback) : [];
  return fromFallback[0] || models[0] || "";
}

export function ticketSearchBlob(ticket: Pick<KnowledgeTicket, "ticketNo" | "model" | "customer" | "summary" | "note" | "text" | "errorCodes" | "partNumbers">): string {
  return [
    ticket.ticketNo,
    ticket.model,
    ticket.customer,
    ticket.summary,
    ticket.note,
    ticket.text,
    ticket.errorCodes.join(" "),
    ticket.partNumbers.join(" "),
  ]
    .join(" \n ")
    .trim();
}

export function normalizeKnowledgeTicket(
  raw: Partial<KnowledgeTicket>,
): KnowledgeTicket | null {
  const ticketNo = normalizeTicketNo(typeof raw.ticketNo === "string" ? raw.ticketNo : "");
  const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
  const note = typeof raw.note === "string" ? raw.note.trim() : "";
  const text = typeof raw.text === "string" ? raw.text.trim() : "";
  const blob = [ticketNo, summary, note, text, typeof raw.model === "string" ? raw.model : ""].join(" ");
  if (!ticketNo && !summary && !note && !text) return null;

  const errorCodes = Array.isArray(raw.errorCodes)
    ? uniqueUpper(raw.errorCodes.filter((item) => typeof item === "string"))
    : extractErrorCodes(blob);
  const partNumbers = Array.isArray(raw.partNumbers)
    ? uniqueUpper(raw.partNumbers.filter((item) => typeof item === "string"))
    : extractPartNumbers(blob);
  const models = extractModels(blob);
  const model =
    typeof raw.model === "string" && raw.model.trim()
      ? pickPrimaryModel(models, raw.model)
      : models[0] ?? "";

  const now = new Date().toISOString();
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : createId("kt"),
    ticketNo: ticketNo || createId("ticket"),
    model,
    customer: typeof raw.customer === "string" ? raw.customer.trim() : "",
    summary,
    note,
    text,
    errorCodes,
    partNumbers,
    closed: Boolean(raw.closed),
    closedAt: typeof raw.closedAt === "string" ? raw.closedAt : null,
    sourceFile: typeof raw.sourceFile === "string" ? raw.sourceFile : "",
    importedAt: typeof raw.importedAt === "string" ? raw.importedAt : now,
  };
}

export function knowledgeTicketIdentity(ticket: Pick<KnowledgeTicket, "ticketNo" | "summary" | "note">): string {
  const no = ticket.ticketNo.trim().toLowerCase();
  if (no) return `no:${no}`;
  return `text:${ticket.summary.slice(0, 80).toLowerCase()}|${ticket.note.slice(0, 80).toLowerCase()}`;
}

export type CountHit = { value: string; count: number };

export function countValues(values: string[]): CountHit[] {
  const map = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    map.set(value, (map.get(value) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export function ticketStats(tickets: KnowledgeTicket[]) {
  const errors = new Set<string>();
  const parts = new Set<string>();
  const models = new Set<string>();
  for (const ticket of tickets) {
    for (const code of ticket.errorCodes) errors.add(code);
    for (const part of ticket.partNumbers) parts.add(part);
    if (ticket.model) models.add(ticket.model);
  }
  return {
    tickets: tickets.length,
    errorCodes: errors.size,
    partNumbers: parts.size,
    models: models.size,
  };
}
