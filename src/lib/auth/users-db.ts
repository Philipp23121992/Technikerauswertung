import { promises as fs } from "fs";
import path from "path";
import { createPasswordSalt, hashPassword } from "./password";
import {
  APP_IDS,
  createUserId,
  normalizeApps,
  type AppUser,
  type UsersDb,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
export const USERS_DB_PATH = path.join(DATA_DIR, "users-db.json");

function emptyDb(): UsersDb {
  return { version: 1, users: [] };
}

function normalizeUser(raw: Partial<AppUser>): AppUser | null {
  if (!raw?.id || typeof raw.username !== "string" || typeof raw.passwordHash !== "string") {
    return null;
  }
  const username = raw.username.trim().toLowerCase();
  if (!username) return null;
  return {
    id: raw.id,
    username,
    displayName:
      typeof raw.displayName === "string" && raw.displayName.trim()
        ? raw.displayName.trim()
        : username,
    passwordHash: raw.passwordHash,
    passwordSalt: typeof raw.passwordSalt === "string" ? raw.passwordSalt : "",
    apps: normalizeApps(raw.apps),
    canEdit: Boolean(raw.canEdit),
    active: raw.active !== false,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

function normalizeDb(raw: Partial<UsersDb> | null | undefined): UsersDb {
  const users = Array.isArray(raw?.users)
    ? raw.users
        .map((item) => normalizeUser(item as Partial<AppUser>))
        .filter((item): item is AppUser => Boolean(item))
    : [];
  return { version: 1, users };
}

async function readRaw(): Promise<UsersDb> {
  try {
    const raw = await fs.readFile(USERS_DB_PATH, "utf8");
    return normalizeDb(JSON.parse(raw) as Partial<UsersDb>);
  } catch {
    return emptyDb();
  }
}

export async function writeUsersDb(db: UsersDb): Promise<UsersDb> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const next = normalizeDb(db);
  await fs.writeFile(USERS_DB_PATH, JSON.stringify(next, null, 2), "utf8");
  return next;
}

function createBootstrapAdmin(): AppUser {
  const now = new Date().toISOString();
  const salt = createPasswordSalt();
  return {
    id: createUserId(),
    username: "admin",
    displayName: "Administrator",
    passwordSalt: salt,
    passwordHash: hashPassword("-Liya2021-", salt),
    apps: [...APP_IDS],
    canEdit: true,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
}

/** Stellt sicher, dass mindestens ein Admin existiert. */
export async function ensureUsersDb(): Promise<UsersDb> {
  const db = await readRaw();
  if (db.users.length === 0) {
    return writeUsersDb({ version: 1, users: [createBootstrapAdmin()] });
  }
  const hasAdmin = db.users.some(
    (user) => user.active && user.apps.includes("admin"),
  );
  if (!hasAdmin) {
    return writeUsersDb({
      version: 1,
      users: [...db.users, createBootstrapAdmin()],
    });
  }
  return db;
}

export async function readUsersDb(): Promise<UsersDb> {
  return ensureUsersDb();
}

export async function findUserByUsername(username: string): Promise<AppUser | null> {
  const db = await ensureUsersDb();
  const key = username.trim().toLowerCase();
  return db.users.find((user) => user.username === key) ?? null;
}

export async function findUserById(id: string): Promise<AppUser | null> {
  const db = await ensureUsersDb();
  return db.users.find((user) => user.id === id) ?? null;
}
