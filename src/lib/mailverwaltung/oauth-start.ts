import { denyIfResponse, requireAppWrite } from "@/lib/auth/guards";
import { readMailverwaltungDb } from "@/lib/mailverwaltung/db";
import { graphAuthUrl } from "@/lib/mailverwaltung/graph";
import { graphRedirectUri } from "@/lib/mailverwaltung/origin";
import { readGraphSecrets } from "@/lib/mailverwaltung/tokens";

export function oauthSettingsErrorPath(message: string): string {
  return `/mailverwaltung/einstellungen?oauth=error&reason=${encodeURIComponent(message)}`;
}

export async function resolveOutlookConnectUrl(
  req: Request,
  mailboxId: string,
): Promise<string> {
  const access = await requireAppWrite(req, "mailverwaltung");
  if (denyIfResponse(access)) {
    return oauthSettingsErrorPath(
      access.status === 401
        ? "Bitte in APM angemeldet bleiben und erneut „Mit Outlook verbinden“ klicken."
        : "Zum Verbinden braucht der Benutzer Bearbeitungsrecht.",
    );
  }

  const id = mailboxId.trim();
  if (!id) {
    return oauthSettingsErrorPath("Postfach nicht gefunden. Bitte zuerst ein Postfach anlegen.");
  }

  const db = await readMailverwaltungDb();
  const mailbox = db.mailboxes.find((item) => item.id === id);
  if (!mailbox) {
    return oauthSettingsErrorPath("Postfach nicht gefunden. Bitte zuerst ein Postfach anlegen.");
  }
  if (!db.settings.clientId.trim()) {
    return oauthSettingsErrorPath(
      "Client-ID fehlt. Unter Einstellungen speichern, dann erneut verbinden.",
    );
  }
  const secrets = await readGraphSecrets();
  if (!secrets.clientSecret) {
    return oauthSettingsErrorPath(
      "Client Secret fehlt. Unter Einstellungen speichern, dann erneut verbinden.",
    );
  }

  const redirectUri = graphRedirectUri(req, db.settings.redirectUri);
  const state = Buffer.from(
    JSON.stringify({ mailboxId: id, ts: Date.now() }),
    "utf8",
  ).toString("base64url");
  return graphAuthUrl({ ...db.settings, redirectUri }, state, mailbox.email);
}
