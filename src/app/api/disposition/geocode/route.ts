import { NextResponse } from "next/server";
import { denyIfResponse, requireAppWrite } from "@/lib/auth/guards";
import { readDispositionDb, writeDispositionDb } from "@/lib/disposition/db";
import { geocodeTicketAddresses, homesFromFinder, type TechnicianLocation } from "@/lib/disposition/geocode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const access = await requireAppWrite(req, "disposition");
  if (denyIfResponse(access)) return access;

  const body = (await req.json().catch(() => null)) as {
    ids?: string[];
    technicians?: TechnicianLocation[];
  } | null;
  const ids = new Set((body?.ids ?? []).filter(Boolean));
  const technicians = Array.isArray(body?.technicians) ? body.technicians : [];
  if (!ids.size && !technicians.length) {
    return NextResponse.json({ error: "Keine Tickets oder Techniker zum Geocodieren." }, { status: 400 });
  }

  let db = await readDispositionDb();
  if (technicians.length) {
    db = {
      ...db,
      homes: await homesFromFinder(technicians, db.homes),
    };
  }
  const missing = ids.size
    ? db.tickets.filter((item) => ids.has(item.id) && (item.lat == null || item.lon == null))
    : [];
  if (missing.length) {
    const geocoded = await geocodeTicketAddresses(missing);
    const byId = new Map(geocoded.map((item) => [item.id, item]));
    db = {
      ...db,
      tickets: db.tickets.map((item) => byId.get(item.id) ?? item),
    };
  }
  const next = await writeDispositionDb(db);
  return NextResponse.json(next);
}
