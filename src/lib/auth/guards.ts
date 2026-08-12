import { NextResponse } from "next/server";
import { hasEditAccess } from "@/lib/edit-access";
import { getSessionUser } from "./session";
import type { AppId, AppUser } from "./types";
import { pathToAppId, userHasApp } from "./types";

export function authDeniedResponse(message = "Bitte anmelden.") {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbiddenResponse(message = "Keine Berechtigung.") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export async function requireUser(req: Request): Promise<AppUser | NextResponse> {
  const user = await getSessionUser(req);
  if (!user) return authDeniedResponse();
  return user;
}

export async function requireAdmin(req: Request): Promise<AppUser | NextResponse> {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  if (!userHasApp(user, "admin")) {
    return forbiddenResponse("Nur Administratoren dürfen Benutzer verwalten.");
  }
  return user;
}

export async function requireAppAccess(
  req: Request,
  app: AppId,
): Promise<AppUser | NextResponse> {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  if (!userHasApp(user, app)) {
    return forbiddenResponse("Für diesen Bereich fehlt die Freigabe.");
  }
  return user;
}

/** Schreibrechte: Benutzer-Flag oder Legacy-Edit-Passwort. */
export async function requireCanEdit(req: Request): Promise<AppUser | true | NextResponse> {
  const user = await getSessionUser(req);
  if (user?.canEdit) return user;
  if (hasEditAccess(req)) return true;
  return forbiddenResponse(
    "Schreibzugriff gesperrt. Benutzer ohne Bearbeitungsrecht oder nicht freigeschaltet.",
  );
}

export async function requireAppWrite(
  req: Request,
  app: AppId,
): Promise<AppUser | true | NextResponse> {
  const access = await requireAppAccess(req, app);
  if (access instanceof NextResponse) return access;
  const edit = await requireCanEdit(req);
  if (edit instanceof NextResponse) return edit;
  return access;
}

export function denyIfResponse(
  value: AppUser | true | NextResponse,
): value is NextResponse {
  return value instanceof NextResponse;
}

export function resolveAppFromRequest(req: Request): AppId | null {
  try {
    return pathToAppId(new URL(req.url).pathname);
  } catch {
    return null;
  }
}
