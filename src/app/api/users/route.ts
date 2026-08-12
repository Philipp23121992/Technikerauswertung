import { NextResponse } from "next/server";
import { denyIfResponse, requireAdmin } from "@/lib/auth/guards";
import { createPasswordSalt, hashPassword } from "@/lib/auth/password";
import {
  APP_IDS,
  createUserId,
  normalizeApps,
  toPublicUser,
  type AppUser,
} from "@/lib/auth/types";
import { readUsersDb, writeUsersDb } from "@/lib/auth/users-db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (denyIfResponse(admin)) return admin;
  const db = await readUsersDb();
  return NextResponse.json({
    users: db.users.map(toPublicUser),
    appIds: APP_IDS,
  });
}

export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (denyIfResponse(admin)) return admin;

  const body = (await req.json().catch(() => null)) as {
    username?: string;
    displayName?: string;
    password?: string;
    apps?: string[];
    canEdit?: boolean;
    active?: boolean;
  } | null;

  const username = body?.username?.trim().toLowerCase() ?? "";
  const password = body?.password ?? "";
  const displayName = body?.displayName?.trim() || username;
  if (!username || password.length < 6) {
    return NextResponse.json(
      { error: "Benutzername und Passwort (min. 6 Zeichen) erforderlich." },
      { status: 400 },
    );
  }

  const db = await readUsersDb();
  if (db.users.some((user) => user.username === username)) {
    return NextResponse.json(
      { error: "Benutzername ist bereits vergeben." },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const salt = createPasswordSalt();
  const user: AppUser = {
    id: createUserId(),
    username,
    displayName,
    passwordSalt: salt,
    passwordHash: hashPassword(password, salt),
    apps: normalizeApps(body?.apps),
    canEdit: Boolean(body?.canEdit),
    active: body?.active !== false,
    createdAt: now,
    updatedAt: now,
  };

  await writeUsersDb({ version: 1, users: [...db.users, user] });
  return NextResponse.json({ user: toPublicUser(user) }, { status: 201 });
}
