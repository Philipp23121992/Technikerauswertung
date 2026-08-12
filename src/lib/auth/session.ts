import { createHmac, timingSafeEqual } from "crypto";
import type { AppUser, PublicUser } from "./types";
import { toPublicUser } from "./types";
import { ensureUsersDb, findUserById } from "./users-db";

export const SESSION_COOKIE = "apm_session";
const SESSION_SECRET = "APM-Servicetools-Session-v1";
const SESSION_DAYS = 30;

type SessionPayload = {
  userId: string;
  exp: number;
};

function sign(value: string): string {
  return createHmac("sha256", SESSION_SECRET).update(value).digest("hex");
}

export function createSessionToken(userId: string, now = Date.now()): string {
  const exp = now + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const body = Buffer.from(JSON.stringify({ userId, exp } satisfies SessionPayload)).toString(
    "base64url",
  );
  return `${body}.${sign(body)}`;
}

export function parseSessionToken(token: string): SessionPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  try {
    if (
      !timingSafeEqual(Buffer.from(signature, "utf8"), Buffer.from(expected, "utf8"))
    ) {
      return null;
    }
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as SessionPayload;
    if (!parsed?.userId || typeof parsed.exp !== "number") return null;
    if (parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readSessionTokenFromRequest(req: Request): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  const match = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (!match) return null;
  return decodeURIComponent(match.slice(SESSION_COOKIE.length + 1));
}

export function buildSessionCookie(token: string): string {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; SameSite=Lax; HttpOnly`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly`;
}

export async function getSessionUser(req: Request): Promise<AppUser | null> {
  const token = readSessionTokenFromRequest(req);
  if (!token) return null;
  const payload = parseSessionToken(token);
  if (!payload) return null;
  await ensureUsersDb();
  const user = await findUserById(payload.userId);
  if (!user || !user.active) return null;
  return user;
}

export async function getSessionPublicUser(req: Request): Promise<PublicUser | null> {
  const user = await getSessionUser(req);
  return user ? toPublicUser(user) : null;
}
