import { NextResponse } from "next/server";
import { denyIfResponse, requireAppWrite } from "@/lib/auth/guards";
import { readMailverwaltungDb, writeMailverwaltungDb } from "@/lib/mailverwaltung/db";
import { writeGraphSecrets } from "@/lib/mailverwaltung/tokens";
import { addLog, normalizeSettings } from "@/lib/mailverwaltung/types";
import { DEFAULT_GRAPH_REDIRECT_URI } from "@/lib/mailverwaltung/origin";
import { publicDb } from "@/lib/mailverwaltung/sync";

export const runtime = "nodejs";

export async function PUT(req: Request) {
  const access = await requireAppWrite(req, "mailverwaltung");
  if (denyIfResponse(access)) return access;

  const body = (await req.json().catch(() => null)) as {
    staleHours?: number;
    escalateCritical?: boolean;
    copyToOneDrive?: boolean;
    tenantId?: string;
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
  } | null;

  let db = await readMailverwaltungDb();
  db = {
    ...db,
    settings: normalizeSettings({
      ...db.settings,
      ...body,
      redirectUri: body?.redirectUri?.trim() || db.settings.redirectUri || DEFAULT_GRAPH_REDIRECT_URI,
    }),
  };
  if (typeof body?.clientSecret === "string" && body.clientSecret.trim()) {
    await writeGraphSecrets({ clientSecret: body.clientSecret.trim() });
    db = addLog(db, {
      mailboxId: null,
      action: "oauth",
      message: "Graph-Client-Secret gespeichert.",
    });
  }
  db = addLog(db, {
    mailboxId: null,
    action: "sync",
    message: "Mailverwaltung-Einstellungen aktualisiert.",
  });
  db = await writeMailverwaltungDb(db);
  return NextResponse.json(publicDb(db));
}
