import { NextResponse } from "next/server";
import { denyIfResponse, requireAppAccess, requireAppWrite } from "@/lib/auth/guards";
import {
  readTechnikerverwaltungDb,
  updateTechnikerverwaltungDb,
} from "@/lib/technikerverwaltung/db";
import { deleteMemberFile, readMemberFileBuffer } from "@/lib/technikerverwaltung/files";

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
  const access = await requireAppAccess(req, "technikerverwaltung");
  if (denyIfResponse(access)) return access;

  const { id, fileId } = await ctx.params;
  const db = await readTechnikerverwaltungDb();
  const member = db.members.find((item) => item.id === id);
  const attachment = member?.files.find((item) => item.id === fileId);
  if (!member || !attachment) {
    return NextResponse.json({ error: "Datei nicht gefunden." }, { status: 404 });
  }

  try {
    const buffer = await readMemberFileBuffer(id, attachment.storedName);
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
  const access = await requireAppWrite(req, "technikerverwaltung");
  if (denyIfResponse(access)) return access;

  const { id, fileId } = await ctx.params;
  try {
    const saved = await updateTechnikerverwaltungDb(async (db) => {
      const member = db.members.find((item) => item.id === id);
      const attachment = member?.files.find((item) => item.id === fileId);
      if (!member || !attachment) {
        throw new Error("NOT_FOUND");
      }
      await deleteMemberFile(id, attachment.storedName);
      const now = new Date().toISOString();
      return {
        version: 1,
        members: db.members.map((item) =>
          item.id === id
            ? {
                ...item,
                files: item.files.filter((entry) => entry.id !== fileId),
                updatedAt: now,
              }
            : item,
        ),
      };
    });
    return NextResponse.json({
      member: saved.members.find((item) => item.id === id),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Datei nicht gefunden." }, { status: 404 });
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Datei konnte nicht entfernt werden.",
      },
      { status: 400 },
    );
  }
}
