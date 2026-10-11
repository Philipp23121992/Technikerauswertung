import { NextResponse } from "next/server";
import { denyIfResponse, requireAppAccess, requireAppWrite } from "@/lib/auth/guards";
import {
  importAelter3TageCsv,
  previewAelter3TageImport,
  readAelter3TageDb,
  updateAelter3TageNote,
  withRefreshedAges,
  loadSlaCustomers,
} from "@/lib/auswertung/aelter-3-tage-db";
import { isActiveAelter3Ticket } from "@/lib/auswertung/aelter-3-tage-types";
import { DEFAULT_AGE_THRESHOLD_DAYS } from "@/lib/auswertung/tickets-aelter-3-tage";
import type { ImportedDataset } from "@/lib/types";

function summarizeTickets(tickets: Awaited<ReturnType<typeof withRefreshedAges>>["tickets"]) {
  const active = tickets.filter((item) => isActiveAelter3Ticket(item));
  return {
    total: active.length,
    active: active.length,
    abgeschlossen: tickets.filter((item) => item.listStatus === "abgeschlossen").length,
    older: active.filter((item) => item.olderThanThreshold).length,
    withZieltermin: active.filter((item) => item.hasZieltermin).length,
    overdue: active.filter((item) => item.zielterminOverdue).length,
    ersatzteile: active.filter((item) => item.ersatzteileAngekommen).length,
    lidl: active.filter((item) => item.lidlBerechnen).length,
    umzug: active.filter((item) => item.umzugUmbauInstallation).length,
  };
}

export const runtime = "nodejs";

function parseReferenceDate(raw: string | null): string {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const access = await requireAppAccess(req, "auswertung");
  if (denyIfResponse(access)) return access;

  const url = new URL(req.url);
  const referenceDate = parseReferenceDate(url.searchParams.get("referenceDate"));
  const db = await readAelter3TageDb();
  const customers = await loadSlaCustomers();
  const tickets = withRefreshedAges(db, referenceDate, DEFAULT_AGE_THRESHOLD_DAYS, customers).tickets;

  return NextResponse.json({
    lastImportAt: db.lastImportAt,
    lastFileName: db.lastFileName,
    referenceDate,
    thresholdDays: DEFAULT_AGE_THRESHOLD_DAYS,
    tickets,
    summary: summarizeTickets(tickets),
  });
}

export async function POST(req: Request) {
  const access = await requireAppWrite(req, "auswertung");
  if (denyIfResponse(access)) return access;

  const body = (await req.json().catch(() => null)) as {
    dataset?: ImportedDataset;
    referenceDate?: string;
    save?: boolean;
  } | null;

  if (!body?.dataset?.headers || !Array.isArray(body.dataset.rows)) {
    return NextResponse.json({ error: "dataset mit headers und rows erforderlich." }, { status: 400 });
  }

  const referenceDate = parseReferenceDate(body.referenceDate ?? null);
  const save = body.save === true;

  try {
    const previewResult = await previewAelter3TageImport(
      body.dataset,
      referenceDate,
      DEFAULT_AGE_THRESHOLD_DAYS,
    );
    const preview = previewResult.analysis;
    if (preview.parsedRows === 0) {
      return NextResponse.json(
        {
          error: preview.createdColumn
            ? "Keine auswertbaren Zeilen. Prüfe Erstellungsdatum und geschlossene Tickets."
            : "Keine Spalte „Erstellt am“ erkannt (z. B. Erstellt, Created).",
        },
        { status: 400 },
      );
    }

    if (!save) {
      return NextResponse.json({
        preview: true,
        referenceDate,
        thresholdDays: DEFAULT_AGE_THRESHOLD_DAYS,
        previousTotal: previewResult.previousTotal,
        stats: previewResult.stats,
        analysis: {
          fileName: preview.fileName,
          totalRows: preview.totalRows,
          parsedRows: preview.parsedRows,
          skippedRows: preview.skippedRows,
          skippedClosedRows: preview.skippedClosedRows,
          olderCount: preview.olderCount,
          withZielterminCount: preview.withZielterminCount,
          overdueCount: preview.overdueCount,
          ersatzteileCount: preview.ersatzteileCount,
          lidlCount: preview.lidlCount,
          umzugCount: preview.umzugCount,
          createdColumn: preview.createdColumn,
          zielterminColumn: preview.zielterminColumn,
          wunschterminColumn: preview.wunschterminColumn,
          kennzeichenColumn: preview.kennzeichenColumn,
          lastActionColumn: preview.lastActionColumn,
        },
      });
    }

    const result = await importAelter3TageCsv(body.dataset, referenceDate, DEFAULT_AGE_THRESHOLD_DAYS);
    return NextResponse.json({
      lastImportAt: result.db.lastImportAt,
      lastFileName: result.db.lastFileName,
      referenceDate,
      thresholdDays: DEFAULT_AGE_THRESHOLD_DAYS,
      tickets: result.db.tickets,
      stats: result.stats,
      analysis: {
        totalRows: result.analysis.totalRows,
        parsedRows: result.analysis.parsedRows,
        skippedRows: result.analysis.skippedRows,
        skippedClosedRows: result.analysis.skippedClosedRows,
        kennzeichenColumn: result.analysis.kennzeichenColumn,
        zielterminColumn: result.analysis.zielterminColumn,
      },
      summary: summarizeTickets(result.db.tickets),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import fehlgeschlagen." },
      { status: 400 },
    );
  }
}

export async function PATCH(req: Request) {
  const access = await requireAppWrite(req, "auswertung");
  if (denyIfResponse(access)) return access;

  const body = (await req.json().catch(() => null)) as {
    ticketId?: string;
    note?: string;
    referenceDate?: string;
  } | null;

  if (!body?.ticketId) {
    return NextResponse.json({ error: "ticketId erforderlich." }, { status: 400 });
  }

  const referenceDate = parseReferenceDate(body.referenceDate ?? null);
  const updated = await updateAelter3TageNote(
    body.ticketId,
    body.note ?? "",
    referenceDate,
    DEFAULT_AGE_THRESHOLD_DAYS,
  );
  if (!updated) {
    return NextResponse.json({ error: "Ticket nicht gefunden." }, { status: 404 });
  }
  return NextResponse.json({ ticket: updated });
}
