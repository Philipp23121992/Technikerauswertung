import { NextResponse } from "next/server";
import { denyIfResponse, requireAppAccess, requireAppWrite } from "@/lib/auth/guards";
import {
  readKostenvoranschlaegeDb,
  writeKostenvoranschlaegeDb,
} from "@/lib/kostenvoranschlaege/db";
import { normalizeQuote, type CostQuote } from "@/lib/kostenvoranschlaege/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const access = await requireAppAccess(req, "kostenvoranschlaege");
  if (denyIfResponse(access)) return access;

  try {
    const db = await readKostenvoranschlaegeDb();
    return NextResponse.json({ quotes: db.quotes });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Kostenvoranschläge konnten nicht geladen werden.",
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
      quotes?: Partial<CostQuote>[];
    } | null;

    if (!body || !Array.isArray(body.quotes)) {
      return NextResponse.json({ error: "quotes[] erforderlich." }, { status: 400 });
    }

    const incoming = body.quotes
      .map((item, index) => normalizeQuote(item, index))
      .filter((item): item is CostQuote => Boolean(item));

    const current = await readKostenvoranschlaegeDb();
    const existingById = new Map(current.quotes.map((item) => [item.id, item]));
    const quotes = incoming.map((quote) => {
      const existing = existingById.get(quote.id);
      const dueChanged =
        !existing ||
        existing.assigneeId !== quote.assigneeId ||
        existing.validUntil !== quote.validUntil;
      return {
        ...quote,
        attachments: existing?.attachments ?? quote.attachments,
        dueMailSentAt: dueChanged
          ? null
          : quote.dueMailSentAt || existing?.dueMailSentAt || null,
        dueMailForDate: dueChanged
          ? null
          : quote.dueMailForDate || existing?.dueMailForDate || null,
      };
    });

    const saved = await writeKostenvoranschlaegeDb({ version: 1, quotes });
    return NextResponse.json({ quotes: saved.quotes });
  } catch (error) {
    console.error("[api/kostenvoranschlaege] PUT failed", error);
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
