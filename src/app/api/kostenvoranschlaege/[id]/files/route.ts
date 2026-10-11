import { NextResponse } from "next/server";
import { denyIfResponse, requireAppWrite } from "@/lib/auth/guards";
import type { AppUser } from "@/lib/auth/types";
import {
  readKostenvoranschlaegeDb,
  writeKostenvoranschlaegeDb,
} from "@/lib/kostenvoranschlaege/db";
import { saveQuoteFile } from "@/lib/kostenvoranschlaege/files";
import {
  QUOTE_FILE_KINDS,
  type QuoteAttachment,
  type QuoteFileKind,
} from "@/lib/kostenvoranschlaege/types";

export const runtime = "nodejs";

function uploaderName(access: AppUser | true): string {
  if (access === true) return "";
  return access.displayName.trim() || access.username;
}

function isFileKind(value: unknown): value is QuoteFileKind {
  return typeof value === "string" && (QUOTE_FILE_KINDS as readonly string[]).includes(value);
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const access = await requireAppWrite(req, "kostenvoranschlaege");
  if (denyIfResponse(access)) return access;

  const { id } = await ctx.params;
  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const kindRaw = form.get("kind");
  const kind: QuoteFileKind = isFileKind(kindRaw) ? kindRaw : "kostenvoranschlag";
  const files = form
    .getAll("file")
    .filter((item): item is File => item instanceof File && item.size > 0);
  if (files.length === 0) {
    return NextResponse.json({ error: "Datei fehlt." }, { status: 400 });
  }

  try {
    const db = await readKostenvoranschlaegeDb();
    const quote = db.quotes.find((item) => item.id === id);
    if (!quote) {
      return NextResponse.json({ error: "Kostenvoranschlag nicht gefunden." }, { status: 404 });
    }

    const uploadedBy = uploaderName(access);
    const added: QuoteAttachment[] = [];
    for (const file of files) {
      added.push(await saveQuoteFile(id, file, kind, uploadedBy));
    }

    const now = new Date().toISOString();
    const saved = await writeKostenvoranschlaegeDb({
      version: 1,
      quotes: db.quotes.map((item) =>
        item.id === id
          ? { ...item, attachments: [...item.attachments, ...added], updatedAt: now }
          : item,
      ),
    });
    const updated = saved.quotes.find((item) => item.id === id);
    return NextResponse.json({ quote: updated, attachments: added });
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
