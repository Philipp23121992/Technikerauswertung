import { NextResponse } from "next/server";
import { denyIfResponse, requireAppAccess, requireAppWrite } from "@/lib/auth/guards";
import {
  readKostenvoranschlaegeDb,
  writeKostenvoranschlaegeDb,
} from "@/lib/kostenvoranschlaege/db";
import { deleteQuoteFile, readQuoteFileBuffer } from "@/lib/kostenvoranschlaege/files";

export const runtime = "nodejs";

function inlineDisposition(mimeType: string): boolean {
  return (
    mimeType.startsWith("image/") ||
    mimeType === "application/pdf" ||
    mimeType.startsWith("text/")
  );
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string; fileId: string }> },
) {
  const access = await requireAppAccess(req, "kostenvoranschlaege");
  if (denyIfResponse(access)) return access;

  const { id, fileId } = await ctx.params;
  const db = await readKostenvoranschlaegeDb();
  const quote = db.quotes.find((item) => item.id === id);
  const attachment = quote?.attachments.find((item) => item.id === fileId);
  if (!quote || !attachment) {
    return NextResponse.json({ error: "Datei nicht gefunden." }, { status: 404 });
  }

  try {
    const buffer = await readQuoteFileBuffer(id, attachment.storedName);
    const disposition = inlineDisposition(attachment.mimeType) ? "inline" : "attachment";
    const encoded = encodeURIComponent(attachment.name);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": attachment.mimeType || "application/octet-stream",
        "Content-Length": String(buffer.length),
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encoded}`,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch {
    return NextResponse.json({ error: "Datei nicht gefunden." }, { status: 404 });
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string; fileId: string }> },
) {
  const access = await requireAppWrite(req, "kostenvoranschlaege");
  if (denyIfResponse(access)) return access;

  const { id, fileId } = await ctx.params;
  const db = await readKostenvoranschlaegeDb();
  const quote = db.quotes.find((item) => item.id === id);
  const attachment = quote?.attachments.find((item) => item.id === fileId);
  if (!quote || !attachment) {
    return NextResponse.json({ error: "Datei nicht gefunden." }, { status: 404 });
  }

  await deleteQuoteFile(id, attachment.storedName);
  const now = new Date().toISOString();
  const saved = await writeKostenvoranschlaegeDb({
    version: 1,
    quotes: db.quotes.map((item) =>
      item.id === id
        ? {
            ...item,
            attachments: item.attachments.filter((entry) => entry.id !== fileId),
            updatedAt: now,
          }
        : item,
    ),
  });
  return NextResponse.json({
    quote: saved.quotes.find((item) => item.id === id),
  });
}
