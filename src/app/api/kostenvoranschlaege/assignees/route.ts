import { NextResponse } from "next/server";
import { denyIfResponse, requireAppAccess, requireAppWrite } from "@/lib/auth/guards";
import {
  normalizeAssignee,
  type QuoteAssignee,
} from "@/lib/kostenvoranschlaege/assignees";
import {
  readQuoteAssigneesDb,
  writeQuoteAssigneesDb,
} from "@/lib/kostenvoranschlaege/assignees-db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const access = await requireAppAccess(req, "kostenvoranschlaege");
  if (denyIfResponse(access)) return access;

  try {
    const db = await readQuoteAssigneesDb();
    return NextResponse.json({ assignees: db.assignees });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Zuständige konnten nicht geladen werden.",
      },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  const access = await requireAppWrite(req, "kostenvoranschlaege");
  if (denyIfResponse(access)) return access;

  try {
    const body = (await req.json().catch(() => null)) as {
      assignees?: Partial<QuoteAssignee>[];
    } | null;
    if (!body || !Array.isArray(body.assignees)) {
      return NextResponse.json({ error: "assignees[] erforderlich." }, { status: 400 });
    }

    const assignees = body.assignees
      .map((item) => normalizeAssignee(item))
      .filter((item): item is QuoteAssignee => Boolean(item));

    const saved = await writeQuoteAssigneesDb({ version: 1, assignees });
    return NextResponse.json({ assignees: saved.assignees });
  } catch (error) {
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
