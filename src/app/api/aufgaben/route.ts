import { NextResponse } from "next/server";
import { denyIfResponse, requireAppAccess, requireAppWrite } from "@/lib/auth/guards";
import { readAufgabenDb, writeAufgabenDb } from "@/lib/aufgaben/db";
import {
  persistVertretungAbsences,
  type TechnicianDirectoryEntry,
} from "@/lib/aufgaben/sync-absences";
import { normalizeTask, type Task } from "@/lib/aufgaben/types";
import { isMailConfigured } from "@/lib/mail";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const access = await requireAppAccess(req, "verwaltung");
  if (denyIfResponse(access)) return access;

  try {
    const db = await readAufgabenDb();
    return NextResponse.json({
      tasks: db.tasks,
      mailConfigured: await isMailConfigured(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Aufgaben konnten nicht geladen werden.",
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
      tasks?: Partial<Task>[];
      technicians?: TechnicianDirectoryEntry[];
    } | null;

    if (!body || !Array.isArray(body.tasks)) {
      return NextResponse.json({ error: "tasks[] erforderlich." }, { status: 400 });
    }

    const tasks = body.tasks
      .map((item, index) => normalizeTask(item, index))
      .filter((item): item is Task => Boolean(item));

    const saved = await writeAufgabenDb({ version: 1, tasks });
    let vacationRequests;
    let vacationError: string | undefined;
    try {
      vacationRequests = await persistVertretungAbsences(
        saved.tasks,
        Array.isArray(body.technicians) ? body.technicians : [],
      );
    } catch (error) {
      console.error("[api/aufgaben] urlaube sync failed", error);
      vacationError =
        error instanceof Error
          ? error.message
          : "Abwesenheit in Urlaube konnte nicht geschrieben werden.";
    }
    return NextResponse.json({
      tasks: saved.tasks,
      mailConfigured: await isMailConfigured(),
      vacationRequests,
      vacationError,
    });
  } catch (error) {
    console.error("[api/aufgaben] PUT failed", error);
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
