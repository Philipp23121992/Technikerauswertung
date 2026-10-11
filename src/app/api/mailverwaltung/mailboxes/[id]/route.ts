import { NextResponse } from "next/server";
import { denyIfResponse, requireAppWrite } from "@/lib/auth/guards";
import { readMailverwaltungDb, writeMailverwaltungDb } from "@/lib/mailverwaltung/db";
import { deleteMailboxToken } from "@/lib/mailverwaltung/tokens";
import { addLog } from "@/lib/mailverwaltung/types";
import { publicDb } from "@/lib/mailverwaltung/sync";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const access = await requireAppWrite(req, "mailverwaltung");
  if (denyIfResponse(access)) return access;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as {
    displayName?: string;
    syncEnabled?: boolean;
  } | null;

  let db = await readMailverwaltungDb();
  if (!db.mailboxes.some((item) => item.id === id)) {
    return NextResponse.json({ error: "Postfach nicht gefunden." }, { status: 404 });
  }
  db = {
    ...db,
    mailboxes: db.mailboxes.map((item) =>
      item.id === id
        ? {
            ...item,
            displayName: body?.displayName?.trim() || item.displayName,
            syncEnabled:
              typeof body?.syncEnabled === "boolean" ? body.syncEnabled : item.syncEnabled,
          }
        : item,
    ),
  };
  db = await writeMailverwaltungDb(db);
  return NextResponse.json(publicDb(db));
}

export async function DELETE(req: Request, ctx: Ctx) {
  const access = await requireAppWrite(req, "mailverwaltung");
  if (denyIfResponse(access)) return access;
  const { id } = await ctx.params;
  let db = await readMailverwaltungDb();
  const mailbox = db.mailboxes.find((item) => item.id === id);
  if (!mailbox) {
    return NextResponse.json({ error: "Postfach nicht gefunden." }, { status: 404 });
  }
  await deleteMailboxToken(id);
  db = {
    ...db,
    mailboxes: db.mailboxes.filter((item) => item.id !== id),
    senders: db.senders.filter((item) => item.mailboxId !== id),
    messages: db.messages.filter((item) => item.mailboxId !== id),
    files: db.files.filter((item) => item.mailboxId !== id),
  };
  db = addLog(db, {
    mailboxId: null,
    action: "sync",
    message: `Postfach ${mailbox.email} entfernt.`,
  });
  db = await writeMailverwaltungDb(db);
  return NextResponse.json(publicDb(db));
}
