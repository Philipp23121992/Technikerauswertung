import { NextResponse } from "next/server";
import { denyIfResponse, requireAppAccess, requireAppWrite } from "@/lib/auth/guards";
import { readHpRechnungenDb, writeHpRechnungenDb } from "@/lib/hp-rechnungen/db";
import { normalizeInvoice, type HpInvoice } from "@/lib/hp-rechnungen/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const access = await requireAppAccess(req, "hprechnungen");
  if (denyIfResponse(access)) return access;

  try {
    const db = await readHpRechnungenDb();
    return NextResponse.json({ invoices: db.invoices });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "HP-Rechnungen konnten nicht geladen werden.",
      },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  const access = await requireAppWrite(req, "hprechnungen");
  if (denyIfResponse(access)) return access;

  try {
    const body = (await req.json().catch(() => null)) as {
      invoices?: Partial<HpInvoice>[];
    } | null;

    if (!body || !Array.isArray(body.invoices)) {
      return NextResponse.json({ error: "invoices[] erforderlich." }, { status: 400 });
    }

    const incoming = body.invoices
      .map((item, index) => normalizeInvoice(item, index))
      .filter((item): item is HpInvoice => Boolean(item));

    const current = await readHpRechnungenDb();
    const existingById = new Map(current.invoices.map((item) => [item.id, item]));
    const invoices = incoming.map((invoice) => {
      const existing = existingById.get(invoice.id);
      const reminderChanged =
        !existing ||
        existing.reminderRhythm !== invoice.reminderRhythm ||
        existing.reminderEmail !== invoice.reminderEmail ||
        existing.reminderName !== invoice.reminderName;
      const lastReminder = reminderChanged
        ? invoice.lastReminderSentAt
        : [invoice.lastReminderSentAt, existing?.lastReminderSentAt]
            .filter((item): item is string => Boolean(item))
            .sort()
            .at(-1) ?? null;
      return {
        ...invoice,
        attachments: existing?.attachments ?? invoice.attachments,
        lastReminderSentAt: lastReminder,
      };
    });

    const saved = await writeHpRechnungenDb({ version: 1, invoices });
    return NextResponse.json({ invoices: saved.invoices });
  } catch (error) {
    console.error("[api/hp-rechnungen] PUT failed", error);
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
