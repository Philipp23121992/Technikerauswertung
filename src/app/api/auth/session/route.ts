import { NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth/password";
import {
  buildSessionCookie,
  clearSessionCookie,
  createSessionToken,
  getSessionPublicUser,
} from "@/lib/auth/session";
import { toPublicUser } from "@/lib/auth/types";
import { findUserByUsername } from "@/lib/auth/users-db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await getSessionPublicUser(req);
  return NextResponse.json({ user });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    action?: "login" | "logout";
    username?: string;
    password?: string;
  } | null;

  if (body?.action === "logout") {
    const res = NextResponse.json({ user: null });
    res.headers.set("Set-Cookie", clearSessionCookie());
    return res;
  }

  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!username || !password) {
    return NextResponse.json(
      { error: "Benutzername und Passwort erforderlich." },
      { status: 400 },
    );
  }

  const user = await findUserByUsername(username);
  if (
    !user ||
    !user.active ||
    !user.passwordSalt ||
    !verifyPassword(password, user.passwordSalt, user.passwordHash)
  ) {
    return NextResponse.json(
      { error: "Anmeldung fehlgeschlagen." },
      { status: 401 },
    );
  }

  const token = createSessionToken(user.id);
  const res = NextResponse.json({ user: toPublicUser(user) });
  res.headers.set("Set-Cookie", buildSessionCookie(token));
  return res;
}
