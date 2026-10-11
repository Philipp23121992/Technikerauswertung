import { NextResponse } from "next/server";
import { denyIfResponse, requireAppWrite } from "@/lib/auth/guards";
import { isAutoTourCandidate, planAutoTours } from "@/lib/disposition/auto-tour";
import { readDispositionDb, writeDispositionDb } from "@/lib/disposition/db";
import { geocodeTicketAddresses } from "@/lib/disposition/geocode";
import { technicianBlocksForDay } from "@/lib/disposition/load";
import { nextWorkday, todayIso } from "@/lib/disposition/schedule";
import { isRoutableTicket, normalizeTicket } from "@/lib/disposition/types";
import { readUrlaubeDb } from "@/lib/urlaube/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const access = await requireAppWrite(req, "disposition");
  if (denyIfResponse(access)) return access;

  const body = (await req.json().catch(() => null)) as {
    technicianId?: string;
    rebuild?: boolean;
    fromDate?: string;
  } | null;

  let db = await readDispositionDb();
  const scope = body?.technicianId
    ? db.tickets.filter((item) => item.technicianId === body.technicianId)
    : db.tickets;
  const missingGeo = scope.filter(
    (item) => (item.lat == null || item.lon == null) && (item.street || item.plz || item.city),
  );
  if (missingGeo.length) {
    const geocoded = await geocodeTicketAddresses(missingGeo);
    const byId = new Map(geocoded.map((item) => [item.id, item]));
    db = {
      ...db,
      tickets: db.tickets.map((item) => byId.get(item.id) ?? item),
    };
  }

  const fromDate =
    typeof body?.fromDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.fromDate)
      ? body.fromDate
      : todayIso();
  const rebuild = Boolean(body?.rebuild);
  const urlaube = await readUrlaubeDb();
  const names = new Map<string, string>();
  for (const ticket of db.tickets) {
    if (!names.has(ticket.technicianId)) names.set(ticket.technicianId, ticket.technicianName);
  }
  for (const home of db.homes) {
    names.set(home.technicianId, home.technicianName || names.get(home.technicianId) || home.technicianId);
  }
  const blockedDates = new Map<string, Set<string>>();
  for (const [technicianId, technicianName] of names) {
    if (body?.technicianId && technicianId !== body.technicianId) continue;
    const blocked = new Set<string>();
    let date = fromDate;
    for (let i = 0; i < 40; i += 1) {
      const blocks = technicianBlocksForDay(urlaube.requests, technicianName, date);
      if (blocks.some((item) => item.fillsCapacity)) blocked.add(date);
      date = nextWorkday(date);
    }
    blockedDates.set(technicianId, blocked);
  }
  const assignments = planAutoTours(db.tickets, db.homes, {
    fromDate,
    technicianId: body?.technicianId,
    rebuild,
    blockedDates,
  });
  const byId = new Map(assignments.map((item) => [item.id, item]));
  db = {
    ...db,
    tickets: db.tickets.map((ticket) => {
      const next = byId.get(ticket.id);
      if (!next) {
        const inScope = !body?.technicianId || ticket.technicianId === body.technicianId;
        const shouldClear =
          inScope &&
          Boolean(ticket.tourDate) &&
          isRoutableTicket(ticket) &&
          (rebuild || !isAutoTourCandidate(ticket));
        if (!shouldClear) return ticket;
        return (
          normalizeTicket({
            ...ticket,
            tourDate: null,
            tourStartMin: null,
          }) ?? ticket
        );
      }
      return (
        normalizeTicket({
          ...ticket,
          tourDate: next.tourDate,
          tourStartMin: next.tourStartMin,
        }) ?? ticket
      );
    }),
  };
  db = await writeDispositionDb(db);
  return NextResponse.json({
    ...db,
    autoTour: { assigned: assignments.length },
  });
}
