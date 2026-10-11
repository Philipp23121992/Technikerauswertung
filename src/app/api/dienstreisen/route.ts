import { NextResponse } from "next/server";
import { denyIfResponse, requireAppAccess, requireAppWrite } from "@/lib/auth/guards";
import { readDienstreisenDb, writeDienstreisenDb } from "@/lib/dienstreisen/db";
import { normalizeTrip, type BusinessTrip } from "@/lib/dienstreisen/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const access = await requireAppAccess(req, "verwaltung");
  if (denyIfResponse(access)) return access;

  try {
    const db = await readDienstreisenDb();
    return NextResponse.json({ trips: db.trips });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Dienstreisen konnten nicht geladen werden.",
      },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  const access = await requireAppWrite(req, "verwaltung");
  if (denyIfResponse(access)) return access;

  try {
    const body = (await req.json().catch(() => null)) as {
      trips?: Partial<BusinessTrip>[];
    } | null;

    if (!body || !Array.isArray(body.trips)) {
      return NextResponse.json({ error: "trips[] erforderlich." }, { status: 400 });
    }

    const incoming = body.trips
      .map((item, index) => normalizeTrip(item, index))
      .filter((item): item is BusinessTrip => Boolean(item));

    const current = await readDienstreisenDb();
    const existingById = new Map(current.trips.map((trip) => [trip.id, trip]));
    const trips = incoming.map((trip) => {
      const existing = existingById.get(trip.id);
      return {
        ...trip,
        dueMailSentAt:
          existing && existing.dueDate !== trip.dueDate
            ? null
            : trip.dueMailSentAt ?? existing?.dueMailSentAt ?? null,
      };
    });

    const saved = await writeDienstreisenDb({ version: 1, trips });
    return NextResponse.json({ trips: saved.trips });
  } catch (error) {
    console.error("[api/dienstreisen] PUT failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Speichern fehlgeschlagen: ${error.message}`
            : "Speichern fehlgeschlagen.",
      },
      { status: 500 },
    );
  }
}
