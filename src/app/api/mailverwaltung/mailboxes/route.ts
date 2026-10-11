import { NextResponse } from "next/server";
import { denyIfResponse, requireAppWrite } from "@/lib/auth/guards";
import { createId } from "@/lib/id";
import { readMailverwaltungDb, writeMailverwaltungDb } from "@/lib/mailverwaltung/db";
import { addLog, normalizeMailbox } from "@/lib/mailverwaltung/types";
import { publicDb } from "@/lib/mailverwaltung/sync";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const access = await requireAppWrite(req, "mailverwaltung");
  if (denyIfResponse(access)) return access;

  const body = (await req.json().catch(() => null)) as {
    displayName?: string;
    email?: string;
  } | null;

  const mailbox = normalizeMailbox({
    id: createId("mbx"),
    displayName: body?.displayName,
    email: body?.email,
    connected: false,
    lastSyncAt: null,
    lastError: null,
    syncEnabled: true,
    createdAt: new Date().toISOString(),
  });
  if (!mailbox) {
    return NextResponse.json(
      { error: "Bitte eine gültige Postfach-Adresse angeben." },
      { status: 400 },
    );
  }

  let db = await readMailverwaltungDb();
  if (db.mailboxes.some((item) => item.email === mailbox.email)) {
    return NextResponse.json(
      { error: "Dieses Postfach ist bereits angelegt." },
      { status: 400 },
    );
  }
  db = {
    ...db,
    mailboxes: [...db.mailboxes, mailbox],
  };
  db = addLog(db, {
    mailboxId: mailbox.id,
    action: "sync",
    message: `Postfach ${mailbox.email} angelegt.`,
  });
  db = await writeMailverwaltungDb(db);
  return NextResponse.json(publicDb(db));
}
