import { promises as fs } from "fs";
import path from "path";
import { writeJsonAtomic } from "@/lib/atomic-write";
import { createId } from "@/lib/id";
import { readSlaDb } from "@/lib/sla-db";
import type { Customer } from "@/sla/types";
import {
  analyzeTicketsOlderThan,
  refreshStoredTicketAges,
  ticketStableKey,
  type TicketAgeRow,
} from "./tickets-aelter-3-tage";
import {
  createEmptyAelter3TageDb,
  normalizeStoredTicket,
  type Aelter3TageDb,
  type Aelter3TageStoredTicket,
} from "./aelter-3-tage-types";
import type { ImportedDataset } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), "data");
export const AELTER_3_TAGE_DB_PATH = path.join(DATA_DIR, "aelter-3-tage-db.json");

function normalizeSlaCustomer(raw: unknown): Customer | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const slaType = row.slaType === "NBD" || row.slaType === "2ND_NBD" ? row.slaType : null;
  if (!id || !name || !slaType) return null;
  const aliases = Array.isArray(row.aliases)
    ? row.aliases
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  return { id, name, aliases, slaType };
}

export async function loadSlaCustomers(): Promise<Customer[]> {
  const db = await readSlaDb();
  return (Array.isArray(db.customers) ? db.customers : [])
    .map((item) => normalizeSlaCustomer(item))
    .filter((item): item is Customer => Boolean(item));
}

export async function readAelter3TageDb(): Promise<Aelter3TageDb> {
  try {
    const raw = await fs.readFile(AELTER_3_TAGE_DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<Aelter3TageDb>;
    if (parsed?.version !== 1 || !Array.isArray(parsed.tickets)) {
      return createEmptyAelter3TageDb();
    }
    return {
      version: 1,
      lastImportAt: parsed.lastImportAt ?? null,
      lastFileName: parsed.lastFileName ?? null,
      tickets: parsed.tickets
        .map((item) => normalizeStoredTicket(item as Partial<Aelter3TageStoredTicket> & TicketAgeRow))
        .filter((item): item is Aelter3TageStoredTicket => Boolean(item)),
    };
  } catch {
    return createEmptyAelter3TageDb();
  }
}

export async function writeAelter3TageDb(db: Aelter3TageDb): Promise<Aelter3TageDb> {
  const next: Aelter3TageDb = {
    version: 1,
    lastImportAt: db.lastImportAt,
    lastFileName: db.lastFileName,
    tickets: db.tickets,
  };
  await writeJsonAtomic(AELTER_3_TAGE_DB_PATH, next);
  return next;
}

export type MergeImportStats = {
  added: number;
  /** Beim letzten Import aus DB entfernt (zweiter Import ohne CSV-Eintrag) */
  removed: number;
  /** Beim letzten Import nach „Abgeschlossen“ verschoben (fehlten im CSV) */
  movedToAbgeschlossen: number;
  /** Wieder in der CSV → zurück in die aktive Liste */
  reactivated: number;
  updated: number;
  total: number;
  active: number;
  abgeschlossen: number;
  olderThanThreshold: number;
};

export function mergeTicketImport(
  db: Aelter3TageDb,
  incoming: TicketAgeRow[],
  meta: { fileName: string; now: string },
): { db: Aelter3TageDb; stats: MergeImportStats } {
  const previous = new Map(db.tickets.map((item) => [ticketStableKey(item), item]));
  const nextKeys = new Set<string>();
  const tickets: Aelter3TageStoredTicket[] = [];

  let added = 0;
  let updated = 0;
  let reactivated = 0;

  for (const row of incoming) {
    const key = ticketStableKey(row);
    nextKeys.add(key);
    const prev = previous.get(key);
    if (!prev) {
      added += 1;
      tickets.push({
        ...row,
        id: createId("a3"),
        note: "",
        firstSeenAt: meta.now,
        updatedAt: meta.now,
        listStatus: "active",
        abgeschlossenSince: null,
      });
      continue;
    }
    if (prev.listStatus === "abgeschlossen") {
      reactivated += 1;
    } else {
      updated += 1;
    }
    tickets.push({
      ...row,
      id: prev.id,
      note: prev.note,
      firstSeenAt: prev.firstSeenAt,
      updatedAt: meta.now,
      listStatus: "active",
      abgeschlossenSince: null,
    });
  }

  let movedToAbgeschlossen = 0;
  let removed = 0;

  for (const prev of db.tickets) {
    const key = ticketStableKey(prev);
    if (nextKeys.has(key)) continue;

    if (prev.listStatus === "abgeschlossen") {
      removed += 1;
      continue;
    }

    movedToAbgeschlossen += 1;
    tickets.push({
      ...prev,
      listStatus: "abgeschlossen",
      abgeschlossenSince: meta.now,
      updatedAt: meta.now,
    });
  }

  const activeTickets = tickets.filter((item) => item.listStatus === "active");

  return {
    db: {
      version: 1,
      lastImportAt: meta.now,
      lastFileName: meta.fileName,
      tickets,
    },
    stats: {
      added,
      removed,
      movedToAbgeschlossen,
      reactivated,
      updated,
      total: tickets.length,
      active: activeTickets.length,
      abgeschlossen: tickets.length - activeTickets.length,
      olderThanThreshold: activeTickets.filter((item) => item.olderThanThreshold).length,
    },
  };
}

export function withRefreshedAges(
  db: Aelter3TageDb,
  referenceDate: string,
  thresholdDays: number,
  customers: Customer[] = [],
): Aelter3TageDb {
  return {
    ...db,
    tickets: db.tickets.map((item) =>
      refreshStoredTicketAges(item, referenceDate, thresholdDays, customers),
    ),
  };
}

export async function previewAelter3TageImport(
  dataset: ImportedDataset,
  referenceDate: string,
  thresholdDays: number,
): Promise<{
  analysis: ReturnType<typeof analyzeTicketsOlderThan>;
  stats: MergeImportStats;
  previousTotal: number;
}> {
  const customers = await loadSlaCustomers();
  const analysis = analyzeTicketsOlderThan(dataset, referenceDate, thresholdDays, customers);
  const db = await readAelter3TageDb();
  const merged = mergeTicketImport(db, analysis.rows, {
    fileName: dataset.fileName,
    now: new Date().toISOString(),
  });
  return {
    analysis,
    stats: merged.stats,
    previousTotal: db.tickets.length,
  };
}

export async function importAelter3TageCsv(
  dataset: ImportedDataset,
  referenceDate: string,
  thresholdDays: number,
): Promise<{ db: Aelter3TageDb; stats: MergeImportStats; analysis: ReturnType<typeof analyzeTicketsOlderThan> }> {
  const customers = await loadSlaCustomers();
  const analysis = analyzeTicketsOlderThan(dataset, referenceDate, thresholdDays, customers);
  const db = await readAelter3TageDb();
  const now = new Date().toISOString();
  const merged = mergeTicketImport(db, analysis.rows, {
    fileName: dataset.fileName,
    now,
  });
  const saved = await writeAelter3TageDb(merged.db);
  return {
    db: withRefreshedAges(saved, referenceDate, thresholdDays, customers),
    stats: merged.stats,
    analysis,
  };
}

export async function updateAelter3TageNote(
  ticketId: string,
  note: string,
  referenceDate: string,
  thresholdDays: number,
): Promise<Aelter3TageStoredTicket | null> {
  const db = await readAelter3TageDb();
  const index = db.tickets.findIndex((item) => item.id === ticketId);
  if (index < 0) return null;
  const now = new Date().toISOString();
  db.tickets[index] = {
    ...db.tickets[index],
    note: note.trim(),
    updatedAt: now,
  };
  await writeAelter3TageDb(db);
  const customers = await loadSlaCustomers();
  return refreshStoredTicketAges(db.tickets[index], referenceDate, thresholdDays, customers);
}
