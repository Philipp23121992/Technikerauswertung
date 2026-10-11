import { NextResponse } from "next/server";
import { denyIfResponse, requireAppAccess, requireAppWrite } from "@/lib/auth/guards";
import { aiConfigured } from "@/lib/lexmark/ai";
import { clearLexmarkDb, readLexmarkDb, removeManual, writeLexmarkDb } from "@/lib/lexmark/db";
import { listKetten } from "@/lib/lexmark/relations";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: Request) {
  const access = await requireAppAccess(req, "lexmark");
  if (denyIfResponse(access)) return access;

  const url = new URL(req.url);
  const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const db = await readLexmarkDb();
  const match = (value: string | null | undefined) =>
    !query || (value ?? "").toLowerCase().includes(query);

  const models = db.printer_models.filter((item) => match(item.model) || match(item.machineType));
  const errorCodes = db.error_codes.filter(
    (item) => match(item.code) || match(item.description) || match(item.customerResolution),
  );
  const parts = db.replacement_parts.filter(
    (item) => match(item.fru) || match(item.name) || match(item.description) || match(item.removal),
  );
  const relations = listKetten(db, query, 500);
  const review = db.review_queue.filter(
    (item) => item.status === "NEEDS_REVIEW" && (match(item.value) || match(item.reason) || match(item.type)),
  );

  return NextResponse.json({
    aiConfigured: aiConfigured(),
    stats: {
      manuals: db.manuals.length,
      models: db.printer_models.length,
      errorCodes: db.error_codes.length,
      parts: db.replacement_parts.length,
      relations: db.error_part_relations.length,
      review: review.length,
    },
    manuals: db.manuals,
    models: models.slice(0, 400),
    errorCodes: errorCodes.slice(0, 400),
    parts: parts.slice(0, 400),
    relations,
    review: review.slice(0, 200),
    log: db.processing_log.slice(-80).reverse(),
  });
}

export async function DELETE(req: Request) {
  const access = await requireAppWrite(req, "lexmark");
  if (denyIfResponse(access)) return access;

  const url = new URL(req.url);
  const clear = url.searchParams.get("clear") === "1";
  const id = url.searchParams.get("id")?.trim() ?? "";

  if (clear) {
    await clearLexmarkDb();
    return NextResponse.json({ ok: true });
  }
  if (!id) {
    return NextResponse.json({ error: "id fehlt." }, { status: 400 });
  }
  const db = await readLexmarkDb();
  await writeLexmarkDb(removeManual(db, id));
  return NextResponse.json({ ok: true });
}
