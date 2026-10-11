import { NextResponse } from "next/server";
import { denyIfResponse, forbiddenResponse, requireAdmin, requireUser } from "@/lib/auth/guards";
import { APP_IDS, type AppId } from "@/lib/auth/types";
import { readReleasesDb, writeReleasesDb } from "@/lib/releases/db";
import {
  flagEnabledForUser,
  isAdminUser,
  normalizeFlagId,
  type ReleaseFlagRecord,
  type ReleaseFlagStatus,
} from "@/lib/releases/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asAppId(value: unknown): AppId | null {
  return typeof value === "string" && (APP_IDS as readonly string[]).includes(value)
    ? (value as AppId)
    : null;
}

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (denyIfResponse(user)) return user;
  const db = await readReleasesDb();
  const flags = db.flags.map((flag) => ({
    ...flag,
    enabled: flagEnabledForUser(flag, user),
  }));
  return NextResponse.json({
    sprint: db.sprint,
    flags,
    enabled: flags.filter((flag) => flag.enabled).map((flag) => flag.id),
    canManage: isAdminUser(user),
  });
}

export async function PATCH(req: Request) {
  const admin = await requireAdmin(req);
  if (denyIfResponse(admin)) return admin;

  const body = (await req.json().catch(() => null)) as {
    action?: string;
    sprint?: string;
    id?: string;
    title?: string;
    description?: string;
    appId?: string | null;
    status?: ReleaseFlagStatus;
    previewUserIds?: string[];
  } | null;

  const action = body?.action?.trim() || "";
  let db = await readReleasesDb();
  const now = new Date().toISOString();

  if (action === "sprint") {
    db = await writeReleasesDb({ ...db, sprint: body?.sprint?.trim() || "" });
  } else if (action === "create") {
    const id = normalizeFlagId(body?.id || body?.title || "");
    const title = body?.title?.trim() || id;
    if (!id || !title) {
      return NextResponse.json({ error: "ID und Titel sind erforderlich." }, { status: 400 });
    }
    if (db.flags.some((flag) => flag.id === id)) {
      return NextResponse.json({ error: "Dieses Release-Flag gibt es schon." }, { status: 409 });
    }
    const flag: ReleaseFlagRecord = {
      id,
      title,
      description: body?.description?.trim() || "",
      appId: asAppId(body?.appId),
      status: "preview",
      source: "custom",
      sprint: db.sprint || null,
      previewUserIds: Array.isArray(body?.previewUserIds) ? body.previewUserIds : [],
      createdAt: now,
      updatedAt: now,
      releasedAt: null,
    };
    db = await writeReleasesDb({ ...db, flags: [...db.flags, flag] });
  } else if (action === "set-status") {
    const id = normalizeFlagId(body?.id || "");
    const status = body?.status === "released" ? "released" : "preview";
    if (!id) return NextResponse.json({ error: "Flag fehlt." }, { status: 400 });
    db = await writeReleasesDb({
      ...db,
      flags: db.flags.map((flag) =>
        flag.id === id
          ? {
              ...flag,
              status,
              sprint: status === "released" ? db.sprint || flag.sprint : flag.sprint,
              releasedAt: status === "released" ? now : null,
              updatedAt: now,
            }
          : flag,
      ),
    });
  } else if (action === "release-sprint") {
    db = await writeReleasesDb({
      ...db,
      sprint: body?.sprint?.trim() || db.sprint,
      flags: db.flags.map((flag) =>
        flag.status === "preview"
          ? {
              ...flag,
              status: "released",
              sprint: body?.sprint?.trim() || db.sprint || flag.sprint,
              releasedAt: now,
              updatedAt: now,
            }
          : flag,
      ),
    });
  } else if (action === "delete") {
    const id = normalizeFlagId(body?.id || "");
    const current = db.flags.find((flag) => flag.id === id);
    if (!current) return NextResponse.json({ error: "Flag nicht gefunden." }, { status: 404 });
    if (current.source === "catalog") {
      return forbiddenResponse("Katalog-Flags können nur auf Vorschau zurückgesetzt werden.");
    }
    db = await writeReleasesDb({
      ...db,
      flags: db.flags.filter((flag) => flag.id !== id),
    });
  } else {
    return NextResponse.json({ error: "Unbekannte Aktion." }, { status: 400 });
  }

  const flags = db.flags.map((flag) => ({
    ...flag,
    enabled: flagEnabledForUser(flag, admin),
  }));
  return NextResponse.json({
    sprint: db.sprint,
    flags,
    enabled: flags.filter((flag) => flag.enabled).map((flag) => flag.id),
    canManage: true,
  });
}
