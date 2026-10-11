import { NextResponse } from "next/server";
import { denyIfResponse, requireAppAccess, requireAppWrite } from "@/lib/auth/guards";
import {
  readPartnerRechnungenDb,
  writePartnerRechnungenDb,
} from "@/lib/partner-rechnungen/db";
import { normalizeInvoice, type PartnerInvoice } from "@/lib/partner-rechnungen/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const access = await requireAppAccess(req, "partnerrechnungen");
  if (denyIfResponse(access)) return access;

  try {
    const db = await readPartnerRechnungenDb();
    return NextResponse.json({ invoices: db.invoices });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Partner-Rechnungen konnten nicht geladen werden.",
      },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  const access = await requireAppWrite(req, "partnerrechnungen");
  if (denyIfResponse(access)) return access;

  try {
    const body = (await req.json().catch(() => null)) as {
      invoices?: Partial<PartnerInvoice>[];
    } | null;

    if (!body || !Array.isArray(body.invoices)) {
      return NextResponse.json({ error: "invoices[] erforderlich." }, { status: 400 });
    }

    const incoming = body.invoices
      .map((item, index) => normalizeInvoice(item, index))
      .filter((item): item is PartnerInvoice => Boolean(item));

    const current = await readPartnerRechnungenDb();
    const existingById = new Map(current.invoices.map((item) => [item.id, item]));
    const invoices = incoming.map((invoice) => {
      const existing = existingById.get(invoice.id);
      return {
        ...invoice,
        attachments: existing?.attachments ?? invoice.attachments,
      };
    });

    const saved = await writePartnerRechnungenDb({ version: 1, invoices });
    return NextResponse.json({ invoices: saved.invoices });
  } catch (error) {
    console.error("[api/partner-rechnungen] PUT failed", error);
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
