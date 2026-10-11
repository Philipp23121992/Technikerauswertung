import type { Project } from "@/lib/projekte/types";

export async function saveSchemaProject(input: {
  projectId: string;
  title: string;
  schemaDocument: unknown;
}): Promise<Project> {
  const res = await fetch(`/api/projekte/${encodeURIComponent(input.projectId)}/schema`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({
      title: input.title,
      schemaDocument: input.schemaDocument,
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Schema speichern fehlgeschlagen.");
  }
  const data = (await res.json()) as { project?: Project };
  if (!data.project) throw new Error("Schema speichern fehlgeschlagen.");
  return data.project;
}

export async function saveAllProjects(projects: Project[]): Promise<Project[]> {
  const res = await fetch("/api/projekte", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({ projects }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Speichern fehlgeschlagen.");
  }
  const data = (await res.json()) as { projects?: Project[] };
  return Array.isArray(data.projects) ? data.projects : projects;
}

export async function deleteProjectById(
  projectId: string,
  allProjects: Project[],
): Promise<Project[]> {
  return saveAllProjects(allProjects.filter((p) => p.id !== projectId));
}
