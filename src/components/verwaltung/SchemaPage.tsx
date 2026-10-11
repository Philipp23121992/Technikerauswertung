"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useEditAccess } from "@/components/EditAccessProvider";
import { deleteProjectById } from "@/lib/projekte/save-projekte";
import {
  createSchemaProject,
  formatDateTimeDe,
  isSchemaProject,
  SCHEMA_MODE_LABELS,
  type Project,
  type SchemaMode,
} from "@/lib/projekte/types";

function guessOwner(user: { username: string; displayName: string } | null): string {
  if (!user) return "";
  if (user.displayName.trim()) return user.displayName.trim();
  return user.username;
}

export function SchemaPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { canEdit } = useEditAccess();
  const defaultOwner = guessOwner(user);

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState({ title: "", mode: "mindmap" as SchemaMode });

  const schemaProjects = useMemo(
    () =>
      projects
        .filter(isSchemaProject)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [projects],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/projekte", { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) throw new Error("Projekte konnten nicht geladen werden.");
      const data = (await res.json()) as { projects?: Project[] };
      setProjects(Array.isArray(data.projects) ? data.projects : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Laden fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const persistAll = useCallback(
    async (next: Project[]) => {
      if (!canEdit) {
        setError("Schreibzugriff gesperrt.");
        return false;
      }
      setError(null);
      try {
        const res = await fetch("/api/projekte", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projects: next }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "Speichern fehlgeschlagen.");
        }
        const data = (await res.json()) as { projects?: Project[] };
        setProjects(Array.isArray(data.projects) ? data.projects : next);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
        return false;
      }
    },
    [canEdit],
  );

  async function handleDelete(project: Project) {
    if (!canEdit) return;
    if (!window.confirm(`Schema-Projekt „${project.title}“ endgültig löschen?`)) return;
    setError(null);
    try {
      const next = await deleteProjectById(project.id, projects);
      setProjects(next);
      setMessage("Projekt gelöscht.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Löschen fehlgeschlagen.");
    }
  }

  function handleExportPdf(project: Project) {
    router.push(`/verwaltung/schema/${encodeURIComponent(project.id)}?export=pdf`);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const title = draft.title.trim();
    if (!title) {
      setError("Bitte einen Titel eingeben.");
      return;
    }
    const project = createSchemaProject({
      title,
      mode: draft.mode,
      ownerName: defaultOwner,
    });
    const ok = await persistAll([...projects, project]);
    if (ok) {
      setCreateOpen(false);
      setDraft({ title: "", mode: draft.mode });
      router.push(`/verwaltung/schema/${encodeURIComponent(project.id)}`);
    }
  }

  return (
    <main className="page-shell schema-page">
      <header className="page-header">
        <div>
          <h1>Schema</h1>
          <p className="page-lead">
            Mindmaps und Flussdiagramme erstellen — gespeichert als Projekte in der Verwaltung.
          </p>
        </div>
        {canEdit ? (
          <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
            Neues Schema
          </button>
        ) : null}
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? (
        <p className="form-hint" role="status">
          {message}
        </p>
      ) : null}

      {createOpen ? (
        <form className="schema-create-card" onSubmit={(e) => void handleCreate(e)}>
          <h2>Neues Schema-Projekt</h2>
          <label className="form-field">
            <span>Titel</span>
            <input
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="z. B. Rollout Planung"
              autoFocus
            />
          </label>
          <label className="form-field">
            <span>Typ</span>
            <select
              value={draft.mode}
              onChange={(e) =>
                setDraft((d) => ({ ...d, mode: e.target.value as SchemaMode }))
              }
            >
              <option value="mindmap">{SCHEMA_MODE_LABELS.mindmap}</option>
              <option value="flowchart">{SCHEMA_MODE_LABELS.flowchart}</option>
            </select>
          </label>
          <div className="schema-create-actions">
            <button type="submit" className="btn-primary">
              Anlegen &amp; bearbeiten
            </button>
            <button type="button" className="btn-secondary" onClick={() => setCreateOpen(false)}>
              Abbrechen
            </button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <p>Lade …</p>
      ) : schemaProjects.length === 0 ? (
        <p className="muted">Noch keine Schema-Projekte. Leg eines mit „Neues Schema“ an.</p>
      ) : (
        <ul className="schema-list">
          {schemaProjects.map((project) => {
            const mode = project.schemaDocument?.mode ?? "mindmap";
            return (
              <li key={project.id} className="schema-list-item">
                <div>
                  <Link href={`/verwaltung/schema/${encodeURIComponent(project.id)}`}>
                    {project.title}
                  </Link>
                  <p className="schema-list-meta">
                    {SCHEMA_MODE_LABELS[mode]} · zuletzt {formatDateTimeDe(project.updatedAt)}
                  </p>
                </div>
                <div className="schema-list-actions">
                  <Link
                    className="btn-secondary schema-list-open"
                    href={`/verwaltung/schema/${encodeURIComponent(project.id)}`}
                  >
                    Öffnen
                  </Link>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleExportPdf(project)}
                  >
                    PDF
                  </button>
                  {canEdit ? (
                    <button
                      type="button"
                      className="btn-secondary is-danger"
                      onClick={() => void handleDelete(project)}
                    >
                      Löschen
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="schema-footnote">
        Alle Einträge erscheinen auch unter{" "}
        <Link href="/verwaltung/projekte">Projekte</Link>.
      </p>
    </main>
  );
}
