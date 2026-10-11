import { NextResponse } from "next/server";
import {
  denyIfResponse,
  forbiddenResponse,
  requireAppWrite,
  requireUser,
} from "@/lib/auth/guards";
import { userHasApp } from "@/lib/auth/types";
import { readUrlaubeDb, writeUrlaubeDb } from "@/lib/urlaube/db";
import {
  normalizeVacationRequest,
  type VacationRequest,
} from "@/lib/urlaube/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (denyIfResponse(user)) return user;
  if (
    !userHasApp(user, "urlaube") &&
    !userHasApp(user, "auswertung") &&
    !userHasApp(user, "disposition") &&
    !userHasApp(user, "verwaltung")
  ) {
    return forbiddenResponse("Für diesen Bereich fehlt die Freigabe.");
  }

  try {
    const db = await readUrlaubeDb();
    return NextResponse.json({ requests: db.requests });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Urlaube konnten nicht geladen werden.",
      },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  const access = await requireAppWrite(req, "urlaube");
  if (denyIfResponse(access)) return access;

  try {
    const body = (await req.json().catch(() => null)) as {
      requests?: Partial<VacationRequest>[];
    } | null;

    if (!body || !Array.isArray(body.requests)) {
      return NextResponse.json(
        { error: "requests[] erforderlich." },
        { status: 400 },
      );
    }

    const requests = body.requests
      .map((item) => normalizeVacationRequest(item))
      .filter((item): item is VacationRequest => Boolean(item));

    const saved = await writeUrlaubeDb({ version: 1, requests });
    return NextResponse.json({ requests: saved.requests });
  } catch (error) {
    console.error("[api/urlaube] PUT failed", error);
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
