import { NextResponse } from "next/server";
import { denyIfResponse, requireAppWrite } from "@/lib/auth/guards";
import { readDispositionDb, writeDispositionDb } from "@/lib/disposition/db";
import { homesFromFinder, type TechnicianLocation } from "@/lib/disposition/geocode";
import { mergeImportedTicket } from "@/lib/disposition/import";
import {
  emptyFlags,
  isAssignedTicket,
  isCustomTicket,
  isOpenTicket,
  normalizeTicket,
  ticketMatchKey,
  UNASSIGNED_TECH_ID,
  UNASSIGNED_TECH_NAME,
  type DispositionTicket,
  type DispositionTicketDraft,
} from "@/lib/disposition/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const access = await requireAppWrite(req, "disposition");
  if (denyIfResponse(access)) return access;

  try {
    const body = (await req.json().catch(() => null)) as {
      fileName?: string;
      drafts?: DispositionTicketDraft[];
      technicians?: TechnicianLocation[];
    } | null;

    const drafts = Array.isArray(body?.drafts) ? body.drafts : [];
    if (!drafts.length) {
      return NextResponse.json({ error: "Keine Ticketzeilen zum Import." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const fileName = body?.fileName?.trim() || "import.csv";
    let db = await readDispositionDb();
    const previousByKey = new Map<string, DispositionTicket>();
    for (const ticket of db.tickets) {
      if (isCustomTicket(ticket)) continue;
      const key = ticketMatchKey(ticket);
      if (!key) continue;
      const current = previousByKey.get(key);
      if (!current) {
        previousByKey.set(key, ticket);
        continue;
      }
      const nextOpen = isOpenTicket(ticket);
      const currentOpen = isOpenTicket(current);
      if (nextOpen !== currentOpen) {
        previousByKey.set(key, nextOpen ? ticket : current);
        continue;
      }
      if ((ticket.importedAt || "") >= (current.importedAt || "")) {
        previousByKey.set(key, ticket);
      }
    }

    const incomingKeys = new Set<string>();
    const incoming: DispositionTicket[] = [];
    let kept = 0;
    let neu = 0;
    let reopened = 0;
    let moved = 0;
    let unassigned = 0;

    for (const draft of drafts) {
      const key = ticketMatchKey(draft);
      if (!key || incomingKeys.has(key)) continue;
      incomingKeys.add(key);
      const prev = previousByKey.get(key);
      const nextAssigned = Boolean(draft.technicianId && draft.technicianId !== UNASSIGNED_TECH_ID);
      const nextTechId = nextAssigned ? draft.technicianId : UNASSIGNED_TECH_ID;
      const nextTechName = nextAssigned
        ? draft.technicianName
        : draft.technicianName || UNASSIGNED_TECH_NAME;

      if (prev) {
        const technicianChanged = prev.technicianId !== nextTechId;
        const wasClosed = prev.status === "abgeschlossen";
        if (!nextAssigned) unassigned += 1;
        else if (wasClosed) reopened += 1;
        else if (technicianChanged) moved += 1;
        else kept += 1;

        const ticket = mergeImportedTicket(
          prev,
          draft,
          nextTechId,
          nextTechName,
          now,
          fileName,
        );
        if (ticket) incoming.push(ticket);
        continue;
      }

      if (!nextAssigned) unassigned += 1;
      else neu += 1;
      const ticket = normalizeTicket({
        ...draft,
        technicianId: nextTechId,
        technicianName: nextTechName,
        flags: emptyFlags(),
        status: "offen",
        closedAt: null,
        importedAt: now,
        sourceFile: fileName,
        workKindManual: null,
      });
      if (ticket) incoming.push(ticket);
    }

    let closed = 0;
    const keptAside: DispositionTicket[] = [];
    for (const ticket of db.tickets) {
      if (isCustomTicket(ticket)) {
        keptAside.push(ticket);
        continue;
      }
      const key = ticketMatchKey(ticket);
      if (key && incomingKeys.has(key)) continue;
      closed += 1;
      keptAside.push(
        normalizeTicket({
          ...ticket,
          status: "abgeschlossen",
          closedAt: ticket.status === "abgeschlossen" && ticket.closedAt ? ticket.closedAt : now,
        }) ?? { ...ticket, status: "abgeschlossen", closedAt: ticket.closedAt || now },
      );
    }

    const technicians = body?.technicians?.length
      ? body.technicians
      : [
          ...new Map(
            incoming
              .filter((item) => isAssignedTicket(item))
              .map((item) => [
                item.technicianId,
                { id: item.technicianId, name: item.technicianName },
              ]),
          ).values(),
        ];
    let homes = db.homes;
    try {
      homes = await homesFromFinder(technicians, db.homes);
    } catch {
      homes = db.homes;
    }

    db = await writeDispositionDb({
      version: 1,
      tickets: [...incoming, ...keptAside],
      homes,
      lastImportAt: now,
      lastImportFile: fileName,
      lastImportStats: { kept, neu, closed, reopened, moved, unassigned },
    });
    return NextResponse.json(db);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Import konnte nicht gespeichert werden.",
      },
      { status: 500 },
    );
  }
}
