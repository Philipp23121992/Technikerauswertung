import { NextResponse } from "next/server";
import { denyIfResponse, requireAdmin } from "@/lib/auth/guards";
import { createPasswordSalt, hashPassword } from "@/lib/auth/password";
import { normalizeApps, toPublicUser } from "@/lib/auth/types";
import { readUsersDb, writeUsersDb } from "@/lib/auth/users-db";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const admin = await requireAdmin(req);
  if (denyIfResponse(admin)) return admin;
  const { id } = await ctx.params;

  const body = (await req.json().catch(() => null)) as {
    displayName?: string;
    password?: string;
    apps?: string[];
    canEdit?: boolean;
    active?: boolean;
  } | null;

  const db = await readUsersDb();
  const index = db.users.findIndex((user) => user.id === id);
  if (index < 0) {
    return NextResponse.json({ error: "Benutzer nicht gefunden." }, { status: 404 });
  }

  const current = db.users[index];
  const nextApps =
    body?.apps !== undefined ? normalizeApps(body.apps) : current.apps;
  const nextActive = body?.active !== undefined ? Boolean(body.active) : current.active;

  // Letzten Admin nicht deaktivieren / Admin-Recht entziehen
  const remainingAdmins = db.users.filter(
    (user) =>
      user.id !== id &&
      user.active &&
      user.apps.includes("admin"),
  );
  const wouldLoseAdmin =
    current.apps.includes("admin") &&
    (!nextActive || !nextApps.includes("admin"));
  if (wouldLoseAdmin && remainingAdmins.length === 0) {
    return NextResponse.json(
      { error: "Der letzte Administrator kann nicht entfernt werden." },
      { status: 400 },
    );
  }

  let passwordSalt = current.passwordSalt;
  let passwordHash = current.passwordHash;
  if (typeof body?.password === "string" && body.password.length > 0) {
    if (body.password.length < 6) {
      return NextResponse.json(
        { error: "Neues Passwort muss mindestens 6 Zeichen haben." },
        { status: 400 },
      );
    }
    passwordSalt = createPasswordSalt();
    passwordHash = hashPassword(body.password, passwordSalt);
  }

  const updated = {
    ...current,
    displayName:
      typeof body?.displayName === "string" && body.displayName.trim()
        ? body.displayName.trim()
        : current.displayName,
    apps: nextApps,
    canEdit: body?.canEdit !== undefined ? Boolean(body.canEdit) : current.canEdit,
    active: nextActive,
    passwordSalt,
    passwordHash,
    updatedAt: new Date().toISOString(),
  };

  const users = [...db.users];
  users[index] = updated;
  await writeUsersDb({ version: 1, users });
  return NextResponse.json({ user: toPublicUser(updated) });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const admin = await requireAdmin(req);
  if (denyIfResponse(admin)) return admin;
  const { id } = await ctx.params;

  const db = await readUsersDb();
  const target = db.users.find((user) => user.id === id);
  if (!target) {
    return NextResponse.json({ error: "Benutzer nicht gefunden." }, { status: 404 });
  }

  if (target.id === admin.id) {
    return NextResponse.json(
      { error: "Eigenes Konto kann nicht gelöscht werden." },
      { status: 400 },
    );
  }

  const remainingAdmins = db.users.filter(
    (user) => user.id !== id && user.active && user.apps.includes("admin"),
  );
  if (target.apps.includes("admin") && remainingAdmins.length === 0) {
    return NextResponse.json(
      { error: "Der letzte Administrator kann nicht gelöscht werden." },
      { status: 400 },
    );
  }

  await writeUsersDb({
    version: 1,
    users: db.users.filter((user) => user.id !== id),
  });
  return NextResponse.json({ ok: true });
}
