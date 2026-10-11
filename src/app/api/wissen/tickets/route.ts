import { NextResponse } from "next/server";
import { denyIfResponse, requireAppAccess, requireAppWrite } from "@/lib/auth/guards";
import { parseCsvFile } from "@/lib/csv";
import { readWissenTicketsDb, writeWissenTicketsDb } from "@/lib/wissen/ticket-db";
import { buildWissenTicketsFromCsv, mergeWissenTickets } from "@/lib/wissen/ticket-import";
import { normalizeKnowledgeTicket, ticketStats, type KnowledgeTicket } from "@/lib/wissen/tickets";

export const runtime = "nodejs";
export const maxDuration = 120;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function persistTickets(
  incoming: KnowledgeTicket[],
  fileName: string,
  skippedRows: number,
  columns: {
    ticket: string | null;
    model: string | null;
    summary: string | null;
    note: string | null;
  } | null,
) {
  const current = await readWissenTicketsDb();
  const merged = mergeWissenTickets(current.tickets, incoming);
  const saved = await writeWissenTicketsDb({
    version: 1,
    tickets: merged.tickets,
    lastImportAt: new Date().toISOString(),
    lastImportFile: fileName || current.lastImportFile,
    lastImportStats: {
      kept: merged.kept,
      neu: merged.neu,
      updated: merged.updated,
      skipped: skippedRows,
    },
  });
  return NextResponse.json({
    stats: ticketStats(saved.tickets),
    lastImportAt: saved.lastImportAt,
    lastImportFile: saved.lastImportFile,
    lastImportStats: saved.lastImportStats,
    columns,
    imported: incoming.length,
  });
}

export async function GET(req: Request) {
  const access = await requireAppAccess(req, "wissen");
  if (denyIfResponse(access)) return access;

  const url = new URL(req.url);
  const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const db = await readWissenTicketsDb();
  const filtered = query
    ? db.tickets.filter((ticket) =>
        [ticket.ticketNo, ticket.model, ticket.summary, ticket.note, ticket.text, ticket.errorCodes.join(" "), ticket.partNumbers.join(" ")]
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
    : db.tickets;

  const sorted = [...filtered].sort((a, b) => b.importedAt.localeCompare(a.importedAt));
  return NextResponse.json({
    stats: ticketStats(db.tickets),
    lastImportAt: db.lastImportAt,
    lastImportFile: db.lastImportFile,
    lastImportStats: db.lastImportStats,
    tickets: sorted.slice(0, 80),
    shown: Math.min(80, sorted.length),
    matched: sorted.length,
  });
}

export async function POST(req: Request) {
  const access = await requireAppWrite(req, "wissen");
  if (denyIfResponse(access)) return access;

  const contentType = req.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      const body = (await req.json()) as {
        fileName?: unknown;
        tickets?: unknown;
        skippedRows?: unknown;
        columns?: {
          ticket?: string | null;
          model?: string | null;
          summary?: string | null;
          note?: string | null;
        };
      };
      const incoming = Array.isArray(body.tickets)
        ? body.tickets
            .map((item) => normalizeKnowledgeTicket(item as Partial<KnowledgeTicket>))
            .filter((item): item is KnowledgeTicket => Boolean(item))
        : [];
      if (!incoming.length) {
        return jsonError("In der CSV wurden keine Tickets erkannt. Es braucht zumindest Ticketnummer, Beschreibung oder Notiz.");
      }
      const fileName = typeof body.fileName === "string" && body.fileName.trim() ? body.fileName.trim() : "import.csv";
      const skippedRows = typeof body.skippedRows === "number" && Number.isFinite(body.skippedRows) ? body.skippedRows : 0;
      return persistTickets(incoming, fileName, skippedRows, {
        ticket: body.columns?.ticket ?? null,
        model: body.columns?.model ?? null,
        summary: body.columns?.summary ?? null,
        note: body.columns?.note ?? null,
      });
    }

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      return jsonError("CSV-Datei fehlt.");
    }

    const dataset = await parseCsvFile(file);
    const parsed = buildWissenTicketsFromCsv(dataset, file.name);
    if (!parsed.tickets.length) {
      return jsonError("In der CSV wurden keine Tickets erkannt. Es braucht zumindest Ticketnummer, Beschreibung oder Notiz.");
    }
    return persistTickets(parsed.tickets, file.name, parsed.skippedRows, {
      ticket: parsed.ticketColumn,
      model: parsed.modelColumn,
      summary: parsed.summaryColumn,
      note: parsed.noteColumn,
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Import fehlgeschlagen.");
  }
}

export async function DELETE(req: Request) {
  const access = await requireAppWrite(req, "wissen");
  if (denyIfResponse(access)) return access;

  const url = new URL(req.url);
  const id = url.searchParams.get("id")?.trim() ?? "";
  const clear = url.searchParams.get("clear") === "1";
  const current = await readWissenTicketsDb();

  if (clear) {
    const saved = await writeWissenTicketsDb({
      version: 1,
      tickets: [],
      lastImportAt: current.lastImportAt,
      lastImportFile: current.lastImportFile,
      lastImportStats: current.lastImportStats,
    });
    return NextResponse.json({ stats: ticketStats(saved.tickets) });
  }

  if (!id) {
    return jsonError("id fehlt.");
  }

  const saved = await writeWissenTicketsDb({
    ...current,
    tickets: current.tickets.filter((item) => item.id !== id),
  });
  return NextResponse.json({ stats: ticketStats(saved.tickets) });
}
