import { NextResponse } from "next/server";
import { denyIfResponse, requireAppWrite } from "@/lib/auth/guards";
import type { AppUser } from "@/lib/auth/types";
import { extractPdfText } from "@/lib/wissen/pdf";
import {
  readKostenvoranschlaegeDb,
  writeKostenvoranschlaegeDb,
} from "@/lib/kostenvoranschlaege/db";
import { saveQuoteFile } from "@/lib/kostenvoranschlaege/files";
import { parseKostenvoranschlagText } from "@/lib/kostenvoranschlaege/parse";
import { createQuote } from "@/lib/kostenvoranschlaege/types";

export const runtime = "nodejs";

function uploaderName(access: AppUser | true): string {
  if (access === true) return "";
  return access.displayName.trim() || access.username;
}

function sameKey(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase() && left.trim().length > 0;
}

export async function POST(req: Request) {
  const access = await requireAppWrite(req, "kostenvoranschlaege");
  if (denyIfResponse(access)) return access;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json(
      { error: "Bitte eine Kostenvoranschlagsdatei wählen." },
      { status: 400 },
    );
  }

  try {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const warnings: string[] = [];
    let parsed = parseKostenvoranschlagText("", file.name);
    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    if (isPdf) {
      try {
        const text = await extractPdfText(buffer);
        parsed = parseKostenvoranschlagText(text, file.name);
        warnings.push(...parsed.warnings);
      } catch (error) {
        parsed = parseKostenvoranschlagText("", file.name);
        warnings.push(
          error instanceof Error
            ? error.message
            : "PDF-Text konnte nicht gelesen werden.",
        );
        if (parsed.quoteNumber) {
          warnings.push("TVDAU-Nummer aus dem Dateinamen übernommen.");
        }
        if (parsed.processingNumber) {
          warnings.push("Ihre Referenz aus dem Dateinamen übernommen.");
        }
      }
    } else {
      parsed = parseKostenvoranschlagText("", file.name);
      warnings.push("Kein PDF – Felder bitte manuell prüfen.");
      if (parsed.quoteNumber) {
        warnings.push("TVDAU-Nummer aus dem Dateinamen übernommen.");
      }
      if (parsed.processingNumber) {
        warnings.push("Ihre Referenz aus dem Dateinamen übernommen.");
      }
    }

    const db = await readKostenvoranschlaegeDb();
    const parsedKeys = [parsed.processingNumber, parsed.quoteNumber].filter(Boolean);
    const existing = db.quotes.find((item) =>
      parsedKeys.some(
        (key) => sameKey(item.processingNumber, key) || sameKey(item.quoteNumber, key),
      ),
    );

    const uploadedBy = uploaderName(access);
    let quote = existing
      ? {
          ...existing,
          quoteNumber: existing.quoteNumber || parsed.quoteNumber,
          processingNumber: existing.processingNumber || parsed.processingNumber,
          quoteDate: existing.quoteDate || parsed.quoteDate,
          validUntil: existing.validUntil || parsed.validUntil,
          amount: existing.amount || parsed.amount,
          currency: existing.currency || parsed.currency,
          customer: existing.customer || parsed.customer,
          contact: "",
          device: "",
          serialNumber: "",
          description: "",
          assignee: "",
          updatedAt: new Date().toISOString(),
        }
      : createQuote({
          quoteNumber: parsed.quoteNumber,
          processingNumber: parsed.processingNumber,
          quoteDate: parsed.quoteDate,
          validUntil: parsed.validUntil,
          amount: parsed.amount,
          currency: parsed.currency,
          customer: parsed.customer,
          contact: parsed.contact,
          device: parsed.device,
          serialNumber: parsed.serialNumber,
          description: parsed.description,
          assignee: parsed.assignee,
        });

    const restored = new File([bytes], file.name, { type: file.type });
    const attachment = await saveQuoteFile(
      quote.id,
      restored,
      "kostenvoranschlag",
      uploadedBy,
    );
    quote = {
      ...quote,
      attachments: [...quote.attachments, attachment],
      updatedAt: new Date().toISOString(),
    };

    const quotes = existing
      ? db.quotes.map((item) => (item.id === quote.id ? quote : item))
      : [quote, ...db.quotes];

    const saved = await writeKostenvoranschlaegeDb({ version: 1, quotes });
    const stored = saved.quotes.find((item) => item.id === quote.id) ?? quote;

    return NextResponse.json({
      quote: stored,
      quotes: saved.quotes,
      merged: Boolean(existing),
      parsed,
      warnings,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Import fehlgeschlagen.",
      },
      { status: 400 },
    );
  }
}
