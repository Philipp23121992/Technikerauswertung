import { NextResponse } from "next/server";
import { denyIfResponse, requireAppWrite } from "@/lib/auth/guards";
import { readKnowledgeDb, writeKnowledgeDb } from "@/lib/wissen/db";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const access = await requireAppWrite(req, "wissen");
  if (denyIfResponse(access)) return access;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as {
    active?: boolean;
    title?: string;
    category?: "manual" | "leitfaden" | "sonstiges";
  } | null;

  const db = await readKnowledgeDb();
  const doc = db.docs.find((item) => item.id === id);
  if (!doc) {
    return NextResponse.json({ error: "Dokument nicht gefunden." }, { status: 404 });
  }

  if (typeof body?.active === "boolean") doc.active = body.active;
  if (typeof body?.title === "string" && body.title.trim()) {
    doc.title = body.title.trim();
    for (const chunk of db.chunks) {
      if (chunk.docId === id) chunk.title = doc.title;
    }
  }
  if (
    body?.category === "manual" ||
    body?.category === "leitfaden" ||
    body?.category === "sonstiges"
  ) {
    doc.category = body.category;
  }
  doc.updatedAt = new Date().toISOString();

  await writeKnowledgeDb(db);
  return NextResponse.json({ doc });
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const access = await requireAppWrite(req, "wissen");
  if (denyIfResponse(access)) return access;
  const { id } = await ctx.params;
  const db = await readKnowledgeDb();
  if (!db.docs.some((item) => item.id === id)) {
    return NextResponse.json({ error: "Dokument nicht gefunden." }, { status: 404 });
  }

  db.docs = db.docs.filter((item) => item.id !== id);
  db.chunks = db.chunks.filter((item) => item.docId !== id);
  await writeKnowledgeDb(db);
  return NextResponse.json({ ok: true });
}
