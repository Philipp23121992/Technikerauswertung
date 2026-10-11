import { NextResponse } from "next/server";
import { denyIfResponse, requireAppWrite } from "@/lib/auth/guards";
import type { AppUser } from "@/lib/auth/types";
import { extractPdfText } from "@/lib/wissen/pdf";
import {
  readPartnerRechnungenDb,
  writePartnerRechnungenDb,
} from "@/lib/partner-rechnungen/db";
import { saveInvoiceFile } from "@/lib/partner-rechnungen/files";
import { parsePartnerInvoiceText } from "@/lib/partner-rechnungen/parse";
import { createInvoice } from "@/lib/partner-rechnungen/types";

export const runtime = "nodejs";

function uploaderName(access: AppUser | true): string {
  if (access === true) return "";
  return access.displayName.trim() || access.username;
}

export async function POST(req: Request) {
  const access = await requireAppWrite(req, "partnerrechnungen");
  if (denyIfResponse(access)) return access;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ error: "Bitte eine Rechnungsdatei wählen." }, { status: 400 });
  }

  try {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const warnings: string[] = [];
    let parsed = parsePartnerInvoiceText("");
    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    if (isPdf) {
      try {
        const text = await extractPdfText(buffer);
        parsed = parsePartnerInvoiceText(text);
        warnings.push(...parsed.warnings);
      } catch (error) {
        warnings.push(
          error instanceof Error
            ? error.message
            : "PDF-Text konnte nicht gelesen werden.",
        );
      }
    } else {
      warnings.push("Kein PDF – Felder bitte manuell prüfen.");
    }

    const db = await readPartnerRechnungenDb();
    const numberKey = parsed.invoiceNumber.trim().toLowerCase();
    const existing =
      numberKey.length > 0
        ? db.invoices.find((item) => item.invoiceNumber.trim().toLowerCase() === numberKey)
        : undefined;

    const uploadedBy = uploaderName(access);
    let invoice = existing
      ? {
          ...existing,
          creditNoteNumber: existing.creditNoteNumber || parsed.creditNoteNumber,
          invoiceDate: existing.invoiceDate || parsed.invoiceDate,
          dueDate: existing.dueDate || parsed.dueDate,
          amount: existing.amount || parsed.amount,
          currency: existing.currency || parsed.currency,
          customer: existing.customer || parsed.customer,
          ticketNumber: existing.ticketNumber || parsed.ticketNumber,
          assignee: existing.assignee || parsed.assignee,
          billingMonth:
            existing.billingMonth ||
            (parsed.invoiceDate ? parsed.invoiceDate.slice(0, 7) : existing.billingMonth),
          updatedAt: new Date().toISOString(),
        }
      : createInvoice({
          invoiceNumber: parsed.invoiceNumber,
          creditNoteNumber: parsed.creditNoteNumber,
          invoiceDate: parsed.invoiceDate,
          dueDate: parsed.dueDate,
          amount: parsed.amount,
          currency: parsed.currency,
          customer: parsed.customer,
          ticketNumber: parsed.ticketNumber,
          assignee: parsed.assignee,
          billingMonth: parsed.invoiceDate ? parsed.invoiceDate.slice(0, 7) : undefined,
        });

    const restored = new File([bytes], file.name, { type: file.type });
    const attachment = await saveInvoiceFile(invoice.id, restored, "rechnung", uploadedBy);
    invoice = {
      ...invoice,
      attachments: [...invoice.attachments, attachment],
      updatedAt: new Date().toISOString(),
    };

    const invoices = existing
      ? db.invoices.map((item) => (item.id === invoice.id ? invoice : item))
      : [invoice, ...db.invoices];

    const saved = await writePartnerRechnungenDb({ version: 1, invoices });
    const stored = saved.invoices.find((item) => item.id === invoice.id) ?? invoice;

    return NextResponse.json({
      invoice: stored,
      invoices: saved.invoices,
      merged: Boolean(existing),
      parsed,
      warnings,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Import fehlgeschlagen.",
      },
      { status: 400 },
    );
  }
}
