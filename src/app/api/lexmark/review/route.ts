import { NextResponse } from "next/server";
import { denyIfResponse, requireAppWrite } from "@/lib/auth/guards";
import { readLexmarkDb, writeLexmarkDb } from "@/lib/lexmark/db";
import { REVIEW_STATUSES, type ReviewStatus } from "@/lib/lexmark/types";

export const runtime = "nodejs";

export async function PATCH(req: Request) {
  const access = await requireAppWrite(req, "lexmark");
  if (denyIfResponse(access)) return access;

  const body = (await req.json().catch(() => null)) as { id?: unknown; status?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const status = typeof body?.status === "string" ? body.status : "";
  if (!id || !(REVIEW_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "id oder status ungültig." }, { status: 400 });
  }
  const db = await readLexmarkDb();
  const item = db.review_queue.find((entry) => entry.id === id);
  if (!item) {
    return NextResponse.json({ error: "Eintrag nicht gefunden." }, { status: 404 });
  }
  item.status = status as ReviewStatus;
  item.updated_at = new Date().toISOString();
  await writeLexmarkDb(db);
  return NextResponse.json({ ok: true });
}
