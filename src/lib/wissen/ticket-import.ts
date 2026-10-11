import { findBestColumn } from "@/lib/analyze";
import { parseFlexibleDate } from "@/lib/ticket-import";
import type { CsvRow, ImportedDataset } from "@/lib/types";
import { createId } from "@/lib/id";
import {
  extractErrorCodes,
  extractModels,
  extractPartNumbers,
  knowledgeTicketIdentity,
  normalizeKnowledgeTicket,
  pickPrimaryModel,
  type KnowledgeTicket,
} from "./tickets";

const TICKET_ALIASES = [
  "ticketnummer",
  "ticketnr",
  "ticketno",
  "ticketid",
  "ticket",
  "vorgangsnummer",
  "vorgang",
  "casenumber",
  "incident",
];

const MODEL_ALIASES = [
  "modell",
  "model",
  "maschine",
  "geraet",
  "gerät",
  "printer",
  "drucker",
  "produkt",
  "product",
  "produktname",
  "produktbezeichnung",
  "skumodel",
  "productmodel",
];

const SUMMARY_ALIASES = [
  "zusammenfassung",
  "summary",
  "kurzbeschreibung",
  "kurztext",
  "beschreibung",
  "description",
  "problem",
  "stoerung",
  "störung",
  "fehlermeldung",
  "subject",
  "betreff",
];

const NOTE_ALIASES = [
  "abwicklungsnotiz",
  "loesung",
  "lösung",
  "resolution",
  "resolutionnote",
  "worknotes",
  "work_notes",
  "notiz",
  "notizen",
  "notes",
  "kommentar",
  "bemerkung",
  "loesungstext",
];

const CUSTOMER_ALIASES = ["kundenname", "kunde", "customer", "firma", "account"];

const PART_ALIASES = [
  "ersatzteil",
  "ersatzteile",
  "teilenummer",
  "teile",
  "parts",
  "part",
  "fru",
  "usedparts",
];

const ERROR_ALIASES = ["fehlercode", "errorcode", "fehler", "error", "eventcode"];

const STATUS_ALIASES = ["status", "zustand", "state"];

const CLOSED_ALIASES = [
  "geschlossenam",
  "closedat",
  "closedon",
  "erledigtam",
  "abschlussdatum",
  "geloestam",
  "gelostam",
  "resolvedat",
  "solvedat",
];

const SKIP_HEADER_ALIASES = new Set([
  "bearbeiter",
  "techniker",
  "strasse",
  "straße",
  "plz",
  "ort",
  "stadt",
  "adresse",
  "sla",
  "zeitstrahl",
  "prioritaet",
  "prioritat",
  "erstelltam",
  "team",
]);

export type WissenTicketImportResult = {
  tickets: KnowledgeTicket[];
  matchedRows: number;
  skippedRows: number;
  ticketColumn: string | null;
  modelColumn: string | null;
  summaryColumn: string | null;
  noteColumn: string | null;
  totalRows: number;
};

function cell(row: CsvRow, header: string | null): string {
  if (!header) return "";
  return (row[header] ?? "").trim();
}

function isClosedStatus(value: string): boolean {
  const key = value.toLowerCase();
  return /geschlossen|abgeschlossen|erledigt|closed|complete|resolved|done/.test(key);
}

export function buildWissenTicketsFromCsv(
  dataset: ImportedDataset,
  sourceFile: string,
): WissenTicketImportResult {
  const headers = dataset.headers;
  const ticketColumn = findBestColumn(headers, TICKET_ALIASES);
  const modelColumn = findBestColumn(headers, MODEL_ALIASES);
  const summaryColumn = findBestColumn(headers, SUMMARY_ALIASES);
  const noteColumn = findBestColumn(headers, NOTE_ALIASES, summaryColumn);
  const customerColumn = findBestColumn(headers, CUSTOMER_ALIASES);
  const partColumn = findBestColumn(headers, PART_ALIASES);
  const errorColumn = findBestColumn(headers, ERROR_ALIASES);
  const statusColumn = findBestColumn(headers, STATUS_ALIASES);
  const closedColumn = findBestColumn(headers, CLOSED_ALIASES);

  const mapped = new Set(
    [ticketColumn, modelColumn, summaryColumn, noteColumn, customerColumn, partColumn, errorColumn, statusColumn, closedColumn].filter(
      Boolean,
    ) as string[],
  );

  const extraHeaders = headers.filter((header) => {
    const key = header.toLowerCase();
    if (mapped.has(header)) return false;
    return ![...SKIP_HEADER_ALIASES].some((alias) => key.includes(alias));
  });

  const tickets: KnowledgeTicket[] = [];
  let skippedRows = 0;

  for (const row of dataset.rows) {
    const ticketNo = cell(row, ticketColumn);
    const summary = cell(row, summaryColumn);
    const note = cell(row, noteColumn);
    const extra = extraHeaders.map((header) => cell(row, header)).filter(Boolean).join("\n");
    const partsCol = cell(row, partColumn);
    const errorCol = cell(row, errorColumn);
    const modelCol = cell(row, modelColumn);
    const blob = [ticketNo, modelCol, summary, note, extra, partsCol, errorCol].join("\n");
    if (!blob.replace(/\s+/g, "")) {
      skippedRows += 1;
      continue;
    }

    const errorCodes = extractErrorCodes(`${blob}\n${errorCol}`);
    const partNumbers = extractPartNumbers(`${blob}\n${partsCol}`);
    const models = extractModels(`${modelCol}\n${blob}`);
    const closedAt = parseFlexibleDate(cell(row, closedColumn));
    const closed = Boolean(closedAt) || isClosedStatus(cell(row, statusColumn));

    const ticket = normalizeKnowledgeTicket({
      id: createId("kt"),
      ticketNo,
      model: pickPrimaryModel(models, modelCol),
      customer: cell(row, customerColumn),
      summary,
      note,
      text: extra,
      errorCodes,
      partNumbers,
      closed,
      closedAt,
      sourceFile,
      importedAt: new Date().toISOString(),
    });
    if (!ticket) {
      skippedRows += 1;
      continue;
    }
    tickets.push({
      ...ticket,
      summary: ticket.summary.slice(0, 2000),
      note: ticket.note.slice(0, 4000),
      text: ticket.text.slice(0, 4000),
    });
  }

  return {
    tickets,
    matchedRows: tickets.length,
    skippedRows,
    ticketColumn,
    modelColumn,
    summaryColumn,
    noteColumn,
    totalRows: dataset.rows.length,
  };
}

export function mergeWissenTickets(
  existing: KnowledgeTicket[],
  incoming: KnowledgeTicket[],
): { tickets: KnowledgeTicket[]; kept: number; neu: number; updated: number } {
  const byId = new Map<string, KnowledgeTicket>();
  for (const ticket of existing) {
    byId.set(knowledgeTicketIdentity(ticket), ticket);
  }
  let neu = 0;
  let updated = 0;
  for (const ticket of incoming) {
    const key = knowledgeTicketIdentity(ticket);
    const prev = byId.get(key);
    if (!prev) {
      byId.set(key, ticket);
      neu += 1;
      continue;
    }
    byId.set(key, {
      ...prev,
      ...ticket,
      id: prev.id,
      importedAt: ticket.importedAt,
    });
    updated += 1;
  }
  return {
    tickets: [...byId.values()],
    kept: existing.length - updated,
    neu,
    updated,
  };
}
