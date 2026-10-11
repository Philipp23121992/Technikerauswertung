import { NextResponse } from "next/server";
import { denyIfResponse, requireAppWrite } from "@/lib/auth/guards";
import { readDispositionDb, writeDispositionDb } from "@/lib/disposition/db";
import { parseClockMin } from "@/lib/disposition/schedule";
import { createId } from "@/lib/id";
import { isCustomTicket, normalizeFlags, normalizeTicket, normalizeUpdates } from "@/lib/disposition/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const access = await requireAppWrite(req, "disposition");
  if (denyIfResponse(access)) return access;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as {
    flags?: Record<string, boolean>;
    plannedStartMin?: number | null;
    durationMin?: number;
    technicianId?: string;
    technicianName?: string;
    zieltermin?: string | null;
    termin?: string | null;
    spanEnd?: string | null;
    title?: string;
    newUpdate?: string;
    updates?: unknown;
    workKindManual?: "stoerung" | "umbau" | "none" | null;
    plannerNote?: string;
    tourDate?: string | null;
    tourStartMin?: number | null;
  } | null;

  let db = await readDispositionDb();
  const current = db.tickets.find((item) => item.id === id);
  if (!current) {
    return NextResponse.json({ error: "Ticket nicht gefunden." }, { status: 404 });
  }
  let updates = body && "updates" in body ? normalizeUpdates(body.updates) : current.updates;
  const newText = body?.newUpdate?.trim();
  if (newText) {
    updates = [
      ...updates,
      { id: createId("upd"), at: new Date().toISOString(), text: newText },
    ];
  }
  const title = body?.title?.trim();
  const next = normalizeTicket({
    ...current,
    flags: body?.flags ? normalizeFlags({ ...current.flags, ...body.flags }) : current.flags,
    plannedStartMin:
      body && "plannedStartMin" in body ? parseClockMin(body.plannedStartMin) : current.plannedStartMin,
    durationMin: body?.durationMin != null ? body.durationMin : current.durationMin,
    technicianId: body?.technicianId?.trim() || current.technicianId,
    technicianName: body?.technicianName?.trim() || current.technicianName,
    zieltermin: body && "zieltermin" in body ? body.zieltermin : current.zieltermin,
    termin: body && "termin" in body ? body.termin : current.termin,
    spanEnd: body && "spanEnd" in body ? body.spanEnd : current.spanEnd,
    title: title || current.title,
    customer: isCustomTicket(current) ? title || current.customer : current.customer,
    updates,
    workKindManual:
      body && "workKindManual" in body ? body.workKindManual : current.workKindManual,
    plannerNote:
      body && "plannerNote" in body
        ? String(body.plannerNote ?? "").trim()
        : current.plannerNote,
    tourDate: body && "tourDate" in body ? body.tourDate : current.tourDate,
    tourStartMin:
      body && "tourStartMin" in body ? parseClockMin(body.tourStartMin) : current.tourStartMin,
  });
  if (!next) {
    return NextResponse.json({ error: "Ticket ungültig." }, { status: 400 });
  }
  db = {
    ...db,
    tickets: db.tickets.map((item) => (item.id === id ? next : item)),
  };
  db = await writeDispositionDb(db);
  return NextResponse.json(db);
}

export async function DELETE(req: Request, ctx: Ctx) {
  const access = await requireAppWrite(req, "disposition");
  if (denyIfResponse(access)) return access;
  const { id } = await ctx.params;
  let db = await readDispositionDb();
  const current = db.tickets.find((item) => item.id === id);
  if (!current) {
    return NextResponse.json({ error: "Task nicht gefunden." }, { status: 404 });
  }
  if (!isCustomTicket(current)) {
    return NextResponse.json(
      { error: "Importierte Tickets können nicht gelöscht werden." },
      { status: 400 },
    );
  }
  db = await writeDispositionDb({
    ...db,
    tickets: db.tickets.filter((item) => item.id !== id),
  });
  return NextResponse.json(db);
}
