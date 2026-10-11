import type { TicketAgeRow } from "./tickets-aelter-3-tage";

export type Aelter3ImportListStatus = "active" | "abgeschlossen";

export type Aelter3TageStoredTicket = TicketAgeRow & {
  id: string;
  note: string;
  firstSeenAt: string;
  updatedAt: string;
  /** Fehlt im CSV: zuerst abgeschlossen, beim folgenden Import ohne CSV-Eintrag gelöscht */
  listStatus: Aelter3ImportListStatus;
  abgeschlossenSince: string | null;
};

export function isActiveAelter3Ticket(ticket: Pick<Aelter3TageStoredTicket, "listStatus">): boolean {
  return ticket.listStatus !== "abgeschlossen";
}

export function normalizeStoredTicket(raw: Partial<Aelter3TageStoredTicket> & TicketAgeRow): Aelter3TageStoredTicket | null {
  if (!raw || typeof raw.id !== "string") return null;
  const listStatus = raw.listStatus === "abgeschlossen" ? "abgeschlossen" : "active";
  return {
    ...raw,
    id: raw.id,
    note: typeof raw.note === "string" ? raw.note : "",
    firstSeenAt: typeof raw.firstSeenAt === "string" ? raw.firstSeenAt : raw.updatedAt ?? new Date(0).toISOString(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString(),
    listStatus,
    abgeschlossenSince:
      listStatus === "abgeschlossen" && typeof raw.abgeschlossenSince === "string"
        ? raw.abgeschlossenSince
        : null,
  } as Aelter3TageStoredTicket;
}

export type Aelter3TageDb = {
  version: 1;
  lastImportAt: string | null;
  lastFileName: string | null;
  tickets: Aelter3TageStoredTicket[];
};

export function createEmptyAelter3TageDb(): Aelter3TageDb {
  return {
    version: 1,
    lastImportAt: null,
    lastFileName: null,
    tickets: [],
  };
}
