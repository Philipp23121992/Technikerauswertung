import { NextResponse } from "next/server";
import { denyIfResponse, requireAppAccess, requireAppWrite } from "@/lib/auth/guards";
import { readProjekteDb, writeProjekteDb } from "@/lib/projekte/db";
import { mergeProjectForSave } from "@/lib/projekte/merge-save";
import { normalizeSchemaDocument } from "@/lib/projekte/schema-types";
import { normalizeProject, type Project } from "@/lib/projekte/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const access = await requireAppWrite(req, "verwaltung");
  if (denyIfResponse(access)) return access;

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as {
    title?: string;
    schemaDocument?: unknown;
  } | null;

  if (!body?.schemaDocument) {
    return NextResponse.json({ error: "schemaDocument erforderlich." }, { status: 400 });
  }

  const schemaDocument = normalizeSchemaDocument(body.schemaDocument);
  if (!schemaDocument) {
    return NextResponse.json({ error: "Ungültiges Schema." }, { status: 400 });
  }

  try {
    const db = await readProjekteDb();
    const index = db.projects.findIndex((p) => p.id === id);
    if (index < 0) {
      return NextResponse.json({ error: "Projekt nicht gefunden." }, { status: 404 });
    }

    const existing = db.projects[index];
    const now = new Date().toISOString();
    const draft: Project = {
      ...existing,
      title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : existing.title,
      projectKind: "schema",
      schemaDocument,
      updatedAt: now,
    };

    const merged = mergeProjectForSave(existing, normalizeProject(draft, index) ?? draft);
    const projects = [...db.projects];
    projects[index] = merged;
    const saved = await writeProjekteDb({ version: 1, projects });
    const project = saved.projects.find((p) => p.id === id);
    return NextResponse.json({ project });
  } catch (error) {
    console.error("[api/projekte/schema] PATCH failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Speichern fehlgeschlagen." },
      { status: 500 },
    );
  }
}

export async function GET(req: Request, ctx: Ctx) {
  const access = await requireAppAccess(req, "verwaltung");
  if (denyIfResponse(access)) return access;

  const { id } = await ctx.params;
  const db = await readProjekteDb();
  const project = db.projects.find((p) => p.id === id);
  if (!project || project.projectKind !== "schema") {
    return NextResponse.json({ error: "Schema-Projekt nicht gefunden." }, { status: 404 });
  }
  return NextResponse.json({ project });
}
