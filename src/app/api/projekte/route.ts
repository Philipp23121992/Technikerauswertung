import { NextResponse } from "next/server";
import { denyIfResponse, requireAppAccess, requireAppWrite } from "@/lib/auth/guards";
import { readProjekteDb, writeProjekteDb } from "@/lib/projekte/db";
import { mergeProjectForSave } from "@/lib/projekte/merge-save";
import { normalizeProject, type Project } from "@/lib/projekte/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const access = await requireAppAccess(req, "verwaltung");
  if (denyIfResponse(access)) return access;

  try {
    const db = await readProjekteDb();
    return NextResponse.json({ projects: db.projects });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Projekte konnten nicht geladen werden.",
      },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  const access = await requireAppWrite(req, "verwaltung");
  if (denyIfResponse(access)) return access;

  try {
    const body = (await req.json().catch(() => null)) as {
      projects?: Partial<Project>[];
    } | null;

    if (!body || !Array.isArray(body.projects)) {
      return NextResponse.json({ error: "projects[] erforderlich." }, { status: 400 });
    }

    const incoming = body.projects
      .map((item, index) => normalizeProject(item, index))
      .filter((item): item is Project => Boolean(item));

    const current = await readProjekteDb();
    const existingById = new Map(
      current.projects.map((project) => [project.id, project]),
    );
    const projects = incoming.map((project) => {
      const existing = existingById.get(project.id);
      return mergeProjectForSave(existing, project);
    });

    const saved = await writeProjekteDb({ version: 1, projects });
    return NextResponse.json({ projects: saved.projects });
  } catch (error) {
    console.error("[api/projekte] PUT failed", error);
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
