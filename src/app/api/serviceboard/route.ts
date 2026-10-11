import { NextResponse } from "next/server";
import { denyIfResponse, requireAppAccess, requireAppWrite } from "@/lib/auth/guards";
import { isMailConfigured } from "@/lib/mail";
import { readServiceboardDb, writeServiceboardDb } from "@/lib/serviceboard/db";
import { processServiceboardAssignmentMails } from "@/lib/serviceboard/reminders";
import { normalizeBoardCard, type BoardCard } from "@/lib/serviceboard/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const access = await requireAppAccess(req, "serviceboard");
  if (denyIfResponse(access)) return access;

  try {
    const db = await readServiceboardDb();
    return NextResponse.json({
      cards: db.cards,
      mailConfigured: await isMailConfigured(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Serviceboard konnte nicht geladen werden.",
      },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  const access = await requireAppWrite(req, "serviceboard");
  if (denyIfResponse(access)) return access;

  try {
    const body = (await req.json().catch(() => null)) as {
      cards?: Partial<BoardCard>[];
    } | null;

    if (!body || !Array.isArray(body.cards)) {
      return NextResponse.json({ error: "cards[] erforderlich." }, { status: 400 });
    }

    const cards = body.cards
      .map((item, index) => normalizeBoardCard(item, index))
      .filter((item): item is BoardCard => Boolean(item));

    const previous = await readServiceboardDb();
    const saved = await writeServiceboardDb({ version: 1, cards });
    const assignment = await processServiceboardAssignmentMails(
      previous.cards,
      saved.cards,
    );
    if (assignment.errors.length > 0) {
      console.error("[api/serviceboard] assignment mail", assignment.errors);
    }
    return NextResponse.json({
      cards: saved.cards,
      mailConfigured: await isMailConfigured(),
      assignmentMails: assignment.sent,
    });
  } catch (error) {
    console.error("[api/serviceboard] PUT failed", error);
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
