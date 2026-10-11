import { NextResponse } from "next/server";
import { denyIfResponse, requireAppWrite } from "@/lib/auth/guards";
import type { AppUser } from "@/lib/auth/types";
import { updateTechnikerverwaltungDb } from "@/lib/technikerverwaltung/db";
import { saveMemberFile } from "@/lib/technikerverwaltung/files";
import { parseMemberFileKind, type TeamMemberFile } from "@/lib/technikerverwaltung/types";

export const runtime = "nodejs";

function uploaderName(access: AppUser | true): string {
  if (access === true) return "";
  return access.displayName.trim() || access.username;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const access = await requireAppWrite(req, "technikerverwaltung");
  if (denyIfResponse(access)) return access;

  const { id } = await ctx.params;
  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const kind = parseMemberFileKind(form.get("kind"));
  const files = form
    .getAll("file")
    .filter((item): item is File => item instanceof File && item.size > 0);
  if (files.length === 0) {
    return NextResponse.json({ error: "Datei fehlt." }, { status: 400 });
  }

  try {
    const uploadedBy = uploaderName(access);
    const added: TeamMemberFile[] = [];
    const saved = await updateTechnikerverwaltungDb(async (db) => {
      const member = db.members.find((item) => item.id === id);
      if (!member) {
        throw new Error("NOT_FOUND");
      }
      for (const file of files) {
        added.push(await saveMemberFile(id, file, kind, uploadedBy));
      }
      const now = new Date().toISOString();
      return {
        version: 1,
        members: db.members.map((item) =>
          item.id === id
            ? { ...item, files: [...added, ...item.files], updatedAt: now }
            : item,
        ),
      };
    });
    const updated = saved.members.find((item) => item.id === id);
    return NextResponse.json({ member: updated, files: added });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Mitarbeiter nicht gefunden." }, { status: 404 });
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Datei konnte nicht gespeichert werden.",
      },
      { status: 400 },
    );
  }
}
