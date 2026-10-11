import { NextResponse } from "next/server";
import { denyIfResponse, requireAppWrite } from "@/lib/auth/guards";
import type { AppUser } from "@/lib/auth/types";
import { readProjekteDb, writeProjekteDb } from "@/lib/projekte/db";
import { saveProjectFile } from "@/lib/projekte/files";
import type { ProjectAttachment } from "@/lib/projekte/types";

export const runtime = "nodejs";

function uploaderName(access: AppUser | true): string {
  if (access === true) return "";
  return access.displayName.trim() || access.username;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const access = await requireAppWrite(req, "verwaltung");
  if (denyIfResponse(access)) return access;

  const { id } = await ctx.params;
  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const files = form
    .getAll("file")
    .filter((item): item is File => item instanceof File && item.size > 0);
  if (files.length === 0) {
    return NextResponse.json({ error: "Datei fehlt." }, { status: 400 });
  }

  try {
    const db = await readProjekteDb();
    const project = db.projects.find((item) => item.id === id);
    if (!project) {
      return NextResponse.json({ error: "Projekt nicht gefunden." }, { status: 404 });
    }

    const uploadedBy = uploaderName(access);
    const added: ProjectAttachment[] = [];
    for (const file of files) {
      added.push(await saveProjectFile(id, file, uploadedBy));
    }

    const now = new Date().toISOString();
    const next = {
      ...db,
      projects: db.projects.map((item) =>
        item.id === id
          ? {
              ...item,
              attachments: [...item.attachments, ...added],
              updatedAt: now,
            }
          : item,
      ),
    };
    const saved = await writeProjekteDb(next);
    const updated = saved.projects.find((item) => item.id === id);
    return NextResponse.json({ project: updated, attachments: added });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Datei konnte nicht gespeichert werden.",
      },
      { status: 400 },
    );
  }
}
