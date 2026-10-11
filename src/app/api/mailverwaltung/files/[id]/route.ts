import { NextResponse } from "next/server";
import { denyIfResponse, requireAppWrite } from "@/lib/auth/guards";
import { readMailverwaltungDb, writeMailverwaltungDb } from "@/lib/mailverwaltung/db";
import { addLog, FILE_CATEGORIES } from "@/lib/mailverwaltung/types";
import { publicDb } from "@/lib/mailverwaltung/sync";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const access = await requireAppWrite(req, "mailverwaltung");
  if (denyIfResponse(access)) return access;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as {
    important?: boolean;
    category?: string;
  } | null;

  let db = await readMailverwaltungDb();
  const current = db.files.find((item) => item.id === id);
  if (!current) {
    return NextResponse.json({ error: "Datei nicht gefunden." }, { status: 404 });
  }
  db = {
    ...db,
    files: db.files.map((item) =>
      item.id === id
        ? {
            ...item,
            important: typeof body?.important === "boolean" ? body.important : item.important,
            category:
              body?.category && FILE_CATEGORIES.includes(body.category as (typeof FILE_CATEGORIES)[number])
                ? (body.category as (typeof FILE_CATEGORIES)[number])
                : item.category,
          }
        : item,
    ),
  };
  db = addLog(db, {
    mailboxId: current.mailboxId,
    action: "file",
    message: `Datei „${current.name}“ aktualisiert.`,
  });
  db = await writeMailverwaltungDb(db);
  return NextResponse.json(publicDb(db));
}
