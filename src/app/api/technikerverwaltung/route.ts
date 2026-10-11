import { NextResponse } from "next/server";
import { denyIfResponse, requireAppAccess, requireAppWrite } from "@/lib/auth/guards";
import { cleanupOrphanedMemberFiles } from "@/lib/technikerverwaltung/files";
import {
  readTechnikerverwaltungDb,
  updateTechnikerverwaltungDb,
} from "@/lib/technikerverwaltung/db";
import { normalizeMember, type TeamMember } from "@/lib/technikerverwaltung/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const access = await requireAppAccess(req, "technikerverwaltung");
  if (denyIfResponse(access)) return access;

  try {
    const db = await readTechnikerverwaltungDb();
    return NextResponse.json({ members: db.members });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Technikerverwaltung konnte nicht geladen werden.",
      },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  const access = await requireAppWrite(req, "technikerverwaltung");
  if (denyIfResponse(access)) return access;

  try {
    const body = (await req.json().catch(() => null)) as {
      members?: Partial<TeamMember>[];
    } | null;

    if (!body || !Array.isArray(body.members)) {
      return NextResponse.json({ error: "members[] erforderlich." }, { status: 400 });
    }

    const members = body.members
      .map((item, index) => normalizeMember(item, index))
      .filter((item): item is TeamMember => Boolean(item));

    const saved = await updateTechnikerverwaltungDb((latest) => {
      const latestFiles = new Map(latest.members.map((item) => [item.id, item.files]));
      return {
        version: 1,
        members: members.map((item) => ({
          ...item,
          files: latestFiles.get(item.id) ?? item.files,
        })),
      };
    });
    await cleanupOrphanedMemberFiles(saved.members.map((item) => item.id));
    return NextResponse.json({ members: saved.members });
  } catch (error) {
    console.error("[api/technikerverwaltung] PUT failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Speichern fehlgeschlagen: ${error.message}`
            : "Speichern fehlgeschlagen.",
      },
      { status: 500 },
    );
  }
}
