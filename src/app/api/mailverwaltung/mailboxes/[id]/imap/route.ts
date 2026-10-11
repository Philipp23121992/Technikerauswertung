import { NextResponse } from "next/server";
import { denyIfResponse, requireAppWrite } from "@/lib/auth/guards";
import { guessImapPreset, mailboxToImapAccount, testImapLogin } from "@/lib/mailverwaltung/imap";
import { readMailverwaltungDb, writeMailverwaltungDb } from "@/lib/mailverwaltung/db";
import { publicDb, syncMailbox } from "@/lib/mailverwaltung/sync";
import { getImapPassword, saveImapPassword } from "@/lib/mailverwaltung/tokens";
import { addLog } from "@/lib/mailverwaltung/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const access = await requireAppWrite(req, "mailverwaltung");
  if (denyIfResponse(access)) return access;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as {
    host?: string;
    port?: number;
    secure?: boolean;
    user?: string;
    password?: string;
    testOnly?: boolean;
  } | null;

  const db = await readMailverwaltungDb();
  const mailbox = db.mailboxes.find((item) => item.id === id);
  if (!mailbox) {
    return NextResponse.json({ error: "Postfach nicht gefunden." }, { status: 404 });
  }

  const preset = guessImapPreset(mailbox.email);
  const storedPassword = await getImapPassword(id);
  const account = mailboxToImapAccount(
    {
      ...mailbox,
      imapHost: body?.host?.trim() || mailbox.imapHost || preset.host,
      imapPort: Number(body?.port) > 0 ? Number(body?.port) : mailbox.imapPort || preset.port,
      imapSecure: body?.secure !== false,
      imapUser: body?.user?.trim() || mailbox.imapUser || mailbox.email,
    },
    (body?.password || storedPassword).trim(),
  );

  try {
    const test = await testImapLogin(account);
    if (body?.testOnly) {
      return NextResponse.json({
        ok: true,
        messages: test.messages,
        message: `IMAP-Login erfolgreich. ${test.messages} Nachrichten im Posteingang.`,
      });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "IMAP-Verbindung fehlgeschlagen." },
      { status: 400 },
    );
  }

  if (body?.password?.trim()) {
    await saveImapPassword(id, body.password);
  } else if (!storedPassword) {
    return NextResponse.json(
      { error: "Bitte das IMAP-Passwort eingeben." },
      { status: 400 },
    );
  }

  let next = {
    ...db,
    mailboxes: db.mailboxes.map((item) =>
      item.id === id
        ? {
            ...item,
            provider: "imap" as const,
            imapHost: account.host,
            imapPort: account.port,
            imapSecure: account.secure,
            imapUser: account.user,
            hasImapPassword: true,
            connected: true,
            lastError: null,
          }
        : item,
    ),
  };
  next = addLog(next, {
    mailboxId: id,
    action: "imap",
    message: `IMAP verbunden (${account.user} @ ${account.host}).`,
  });
  next = await writeMailverwaltungDb(next);
  try {
    await syncMailbox(id);
    next = await readMailverwaltungDb();
  } catch {
    /* Login war ok, Sync-Fehler steht am Postfach */
    next = await readMailverwaltungDb();
  }
  return NextResponse.json(publicDb(next));
}
