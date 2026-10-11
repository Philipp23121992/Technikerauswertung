import { NextResponse } from "next/server";
import { readMailverwaltungDb, writeMailverwaltungDb } from "@/lib/mailverwaltung/db";
import { exchangeAuthCode, getValidAccessToken, graphMe } from "@/lib/mailverwaltung/graph";
import { graphRedirectUri, publicOrigin } from "@/lib/mailverwaltung/origin";
import { addLog } from "@/lib/mailverwaltung/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = publicOrigin(req);
  const fail = (message: string) =>
    NextResponse.redirect(
      new URL(
        `/mailverwaltung/einstellungen?oauth=error&reason=${encodeURIComponent(message)}`,
        origin,
      ),
    );

  const code = url.searchParams.get("code") || "";
  const stateRaw = url.searchParams.get("state") || "";
  const error = url.searchParams.get("error_description") || url.searchParams.get("error");

  if (error) return fail(error);
  if (!code || !stateRaw) return fail("OAuth-Antwort unvollständig.");

  let mailboxId = "";
  try {
    const parsed = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf8")) as {
      mailboxId?: string;
      ts?: number;
    };
    mailboxId = parsed.mailboxId || "";
    if (parsed.ts && Date.now() - parsed.ts > 30 * 60 * 1000) {
      return fail("Die Microsoft-Anmeldung ist abgelaufen. Bitte erneut verbinden.");
    }
  } catch {
    return fail("Ungültiger OAuth-State.");
  }

  try {
    let db = await readMailverwaltungDb();
    if (!db.mailboxes.some((item) => item.id === mailboxId)) {
      return fail("Postfach zur Microsoft-Antwort nicht gefunden.");
    }
    const redirectUri = graphRedirectUri(req, db.settings.redirectUri);
    await exchangeAuthCode({ ...db.settings, redirectUri }, mailboxId, code);
    const token = await getValidAccessToken({ ...db.settings, redirectUri }, mailboxId);
    const me = await graphMe(token);
    db = {
      ...db,
      mailboxes: db.mailboxes.map((item) =>
        item.id === mailboxId
          ? {
              ...item,
              connected: true,
              lastError: null,
              lastSyncAt: new Date().toISOString(),
              provider: "graph",
              email: (me.mail || me.userPrincipalName || item.email).toLowerCase(),
              displayName: me.displayName || item.displayName,
            }
          : item,
      ),
    };
    db = addLog(db, {
      mailboxId,
      action: "oauth",
      message: `Outlook verbunden (${me.mail || me.userPrincipalName || mailboxId}).`,
    });
    await writeMailverwaltungDb(db);
    return NextResponse.redirect(
      new URL("/mailverwaltung/einstellungen?oauth=ok", origin),
    );
  } catch (err) {
    return fail(err instanceof Error ? err.message : "OAuth fehlgeschlagen.");
  }
}
