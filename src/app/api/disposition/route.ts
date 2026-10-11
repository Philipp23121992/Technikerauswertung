import { NextResponse } from "next/server";
import {
  denyIfResponse,
  forbiddenResponse,
  requireAppAccess,
  requireCanEdit,
  requireUser,
} from "@/lib/auth/guards";
import { userHasApp } from "@/lib/auth/types";
import { readDispositionDb, writeDispositionDb } from "@/lib/disposition/db";
import { rematchUnassignedTickets } from "@/lib/disposition/import";
import { geocodeHome, homesFromFinder, type TechnicianLocation } from "@/lib/disposition/geocode";
import { clampDuration, parseClockMin } from "@/lib/disposition/schedule";
import { normalizeFlags, normalizeHome, normalizeTicket, type DispositionHome } from "@/lib/disposition/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HomeBody = {
  technicianId?: string;
  technicianName?: string;
  plz?: string;
  city?: string;
  street?: string;
  endPlz?: string;
  endCity?: string;
  endStreet?: string;
};

function fromBody(raw: HomeBody | undefined): DispositionHome | null {
  if (!raw?.technicianId) return null;
  return normalizeHome({
    technicianId: raw.technicianId,
    technicianName: raw.technicianName,
    plz: raw.plz,
    city: raw.city,
    street: raw.street,
    lat: null,
    lon: null,
    endStreet: raw.endStreet,
    endPlz: raw.endPlz,
    endCity: raw.endCity,
    endLat: null,
    endLon: null,
  });
}

export async function GET(req: Request) {
  const access = await requireAppAccess(req, "disposition");
  if (denyIfResponse(access)) return access;
  const db = await readDispositionDb();
  return NextResponse.json(db);
}

export async function PATCH(req: Request) {
  const user = await requireUser(req);
  if (denyIfResponse(user)) return user;
  if (!userHasApp(user, "disposition") && !userHasApp(user, "auswertung")) {
    return forbiddenResponse("Für diesen Bereich fehlt die Freigabe.");
  }
  const edit = await requireCanEdit(req);
  if (denyIfResponse(edit)) return edit;
  const body = (await req.json().catch(() => null)) as {
    home?: HomeBody;
    homes?: HomeBody[];
    technicians?: TechnicianLocation[];
    tickets?: Array<{
      id?: string;
      flags?: Record<string, boolean>;
      plannedStartMin?: number | null;
      durationMin?: number;
      technicianId?: string;
      technicianName?: string;
      zieltermin?: string | null;
      tourDate?: string | null;
      tourStartMin?: number | null;
    }>;
  } | null;

  let db = await readDispositionDb();

  if (Array.isArray(body?.tickets) && body.tickets.length) {
    const byId = new Map(body.tickets.map((item) => [item.id, item]));
    db = {
      ...db,
      tickets: db.tickets.map((ticket) => {
        const patch = byId.get(ticket.id);
        if (!patch) return ticket;
        return (
          normalizeTicket({
            ...ticket,
            flags: patch.flags ? normalizeFlags({ ...ticket.flags, ...patch.flags }) : ticket.flags,
            plannedStartMin:
              "plannedStartMin" in patch ? parseClockMin(patch.plannedStartMin) : ticket.plannedStartMin,
            durationMin: patch.durationMin != null ? clampDuration(patch.durationMin) : ticket.durationMin,
            technicianId: patch.technicianId?.trim() || ticket.technicianId,
            technicianName: patch.technicianName?.trim() || ticket.technicianName,
            zieltermin: "zieltermin" in patch ? patch.zieltermin : ticket.zieltermin,
            tourDate: "tourDate" in patch ? patch.tourDate : ticket.tourDate,
            tourStartMin:
              "tourStartMin" in patch ? parseClockMin(patch.tourStartMin) : ticket.tourStartMin,
          }) ?? ticket
        );
      }),
    };
    db = await writeDispositionDb(db);
    return NextResponse.json(db);
  }

  if (Array.isArray(body?.technicians) && body.technicians.length) {
    const tickets = rematchUnassignedTickets(db.tickets, body.technicians);
    db = {
      ...db,
      tickets,
      homes: await homesFromFinder(body.technicians, db.homes),
    };
    db = await writeDispositionDb(db);
    return NextResponse.json(db);
  }

  const incoming = [
    ...(body?.home ? [body.home] : []),
    ...(Array.isArray(body?.homes) ? body.homes : []),
  ];
  if (!incoming.length) {
    return NextResponse.json({ error: "Techniker für Start-/Endadresse fehlt." }, { status: 400 });
  }

  let homes = [...db.homes];
  for (const raw of incoming) {
    let home = fromBody(raw);
    if (!home) continue;
    home = await geocodeHome(home);
    homes = [...homes.filter((item) => item.technicianId !== home.technicianId), home];
  }
  db = await writeDispositionDb({ ...db, homes });
  return NextResponse.json(db);
}
