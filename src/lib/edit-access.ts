import { createHash, timingSafeEqual } from "crypto";
import {
  EDIT_ACCESS_COOKIE,
  EDIT_ACCESS_TOKEN,
} from "./edit-access-shared";

export {
  EDIT_ACCESS_COOKIE,
  EDIT_ACCESS_STORAGE_KEY,
  EDIT_ACCESS_TOKEN,
} from "./edit-access-shared";

const PASSWORD_SALT = "APM-Servicetools";

export function hashEditPassword(password: string): string {
  return createHash("sha256")
    .update(`${password}|${PASSWORD_SALT}`)
    .digest("hex");
}

export function isValidEditPassword(password: string): boolean {
  const hash = hashEditPassword(password);
  try {
    return timingSafeEqual(
      Buffer.from(hash, "utf8"),
      Buffer.from(EDIT_ACCESS_TOKEN, "utf8"),
    );
  } catch {
    return false;
  }
}

export function readEditTokenFromRequest(req: Request): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  const match = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${EDIT_ACCESS_COOKIE}=`));
  if (!match) return null;
  return decodeURIComponent(match.slice(EDIT_ACCESS_COOKIE.length + 1));
}

export function hasEditAccess(req: Request): boolean {
  const token = readEditTokenFromRequest(req);
  if (!token) return false;
  try {
    return timingSafeEqual(
      Buffer.from(token, "utf8"),
      Buffer.from(EDIT_ACCESS_TOKEN, "utf8"),
    );
  } catch {
    return false;
  }
}

export function editAccessDeniedResponse() {
  return Response.json(
    {
      error:
        "Schreibzugriff gesperrt. Bitte in der Sidebar mit Passwort freischalten.",
    },
    { status: 403 },
  );
}

export function buildEditAccessCookie(token: string, maxAgeSec: number): string {
  return `${EDIT_ACCESS_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax; HttpOnly`;
}

export function clearEditAccessCookie(): string {
  return `${EDIT_ACCESS_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly`;
}
