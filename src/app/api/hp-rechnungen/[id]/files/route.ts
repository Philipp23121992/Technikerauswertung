import { NextResponse } from "next/server";
import { denyIfResponse, requireAppWrite } from "@/lib/auth/guards";
import type { AppUser } from "@/lib/auth/types";
import { readHpRechnungenDb, writeHpRechnungenDb } from "@/lib/hp-rechnungen/db";
import { saveInvoiceFile } from "@/lib/hp-rechnungen/files";
import {
  INVOICE_FILE_KINDS,
  type InvoiceAttachment,
  type InvoiceFileKind,
} from "@/lib/hp-rechnungen/types";

export const runtime = "nodejs";

function uploaderName(access: AppUser | true): string {
  if (access === true) return "";
  return access.displayName.trim() || access.username;
}

function isFileKind(value: unknown): value is InvoiceFileKind {
  return typeof value === "string" && (INVOICE_FILE_KINDS as readonly string[]).includes(value);
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const access = await requireAppWrite(req, "hprechnungen");
  if (denyIfResponse(access)) return access;

  const { id } = await ctx.params;
  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const kindRaw = form.get("kind");
  const kind: InvoiceFileKind = isFileKind(kindRaw) ? kindRaw : "rechnung";
  const files = form
    .getAll("file")
    .filter((item): item is File => item instanceof File && item.size > 0);
  if (files.length === 0) {
    return NextResponse.json({ error: "Datei fehlt." }, { status: 400 });
  }

  try {
    const db = await readHpRechnungenDb();
    const invoice = db.invoices.find((item) => item.id === id);
    if (!invoice) {
      return NextResponse.json({ error: "Rechnung nicht gefunden." }, { status: 404 });
    }

    const uploadedBy = uploaderName(access);
    const added: InvoiceAttachment[] = [];
    for (const file of files) {
      added.push(await saveInvoiceFile(id, file, kind, uploadedBy));
    }

    const now = new Date().toISOString();
    const saved = await writeHpRechnungenDb({
      version: 1,
      invoices: db.invoices.map((item) =>
        item.id === id
          ? { ...item, attachments: [...item.attachments, ...added], updatedAt: now }
          : item,
      ),
    });
    const updated = saved.invoices.find((item) => item.id === id);
    return NextResponse.json({ invoice: updated, attachments: added });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Datei konnte nicht gespeichert werden.",
      },
      { status: 400 },
    );
  }
}
