import { NextResponse } from "next/server";
import { denyIfResponse, requireAppAccess, requireAppWrite } from "@/lib/auth/guards";
import { readProjekteDb, writeProjekteDb } from "@/lib/projekte/db";
import { deleteProjectFile, readProjectFileBuffer } from "@/lib/projekte/files";

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
  const access = await requireAppAccess(req, "verwaltung");
  if (denyIfResponse(access)) return access;

  const { id, fileId } = await ctx.params;
  const db = await readProjekteDb();
  const project = db.projects.find((item) => item.id === id);
  const attachment = project?.attachments.find((item) => item.id === fileId);
  if (!project || !attachment) {
    return NextResponse.json({ error: "Datei nicht gefunden." }, { status: 404 });
  }

  try {
    const buffer = await readProjectFileBuffer(id, attachment.storedName);
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
  const access = await requireAppWrite(req, "verwaltung");
  if (denyIfResponse(access)) return access;

  const { id, fileId } = await ctx.params;
  const db = await readProjekteDb();
  const project = db.projects.find((item) => item.id === id);
  const attachment = project?.attachments.find((item) => item.id === fileId);
  if (!project || !attachment) {
    return NextResponse.json({ error: "Datei nicht gefunden." }, { status: 404 });
  }

  await deleteProjectFile(id, attachment.storedName);
  const now = new Date().toISOString();
  const saved = await writeProjekteDb({
    ...db,
    projects: db.projects.map((item) =>
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
    project: saved.projects.find((item) => item.id === id),
  });
}
