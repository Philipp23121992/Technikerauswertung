import { NextResponse } from "next/server";
import { denyIfResponse, requireAppWrite } from "@/lib/auth/guards";
import { readDispositionDb, writeDispositionDb } from "@/lib/disposition/db";
import { WORK_START_MIN, parseClockMin } from "@/lib/disposition/schedule";
import { createId } from "@/lib/id";
import { normalizeTicket } from "@/lib/disposition/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const access = await requireAppWrite(req, "disposition");
  if (denyIfResponse(access)) return access;

  const body = (await req.json().catch(() => null)) as {
    technicianId?: string;
    technicianName?: string;
    title?: string;
    zieltermin?: string | null;
    spanEnd?: string | null;
    plannedStartMin?: number | null;
    durationMin?: number;
    note?: string;
  } | null;

  const technicianId = body?.technicianId?.trim() || "";
  const technicianName = body?.technicianName?.trim() || "";
  const title = body?.title?.trim() || "";
  if (!technicianId || !technicianName) {
    return NextResponse.json({ error: "Techniker fehlt." }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ error: "Bitte einen Titel für den Task angeben." }, { status: 400 });
  }

  const note = body?.note?.trim();
  const ticket = normalizeTicket({
    id: createId("task"),
    kind: "custom",
    technicianId,
    technicianName,
    title,
    customer: title,
    ticketNo: "",
    zieltermin: body?.zieltermin ?? null,
    spanEnd: body?.spanEnd ?? null,
    plannedStartMin: parseClockMin(body?.plannedStartMin) ?? WORK_START_MIN,
    durationMin: body?.durationMin,
    status: "offen",
    sourceFile: "kanban",
    updates: note
      ? [{ id: createId("upd"), at: new Date().toISOString(), text: note }]
      : [],
  });
  if (!ticket) {
    return NextResponse.json({ error: "Task ungültig." }, { status: 400 });
  }

  const db = await readDispositionDb();
  const next = await writeDispositionDb({
    ...db,
    tickets: [...db.tickets, ticket],
  });
  return NextResponse.json(next);
}
