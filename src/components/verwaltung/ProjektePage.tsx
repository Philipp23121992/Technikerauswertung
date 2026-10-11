"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useEditAccess } from "@/components/EditAccessProvider";
import { useTracker } from "@/components/TrackerProvider";
import { PARTNER_TECH_ID } from "@/lib/ticket-import";
import {
  applyProjectStatus,
  createProject,
  createSubtask,
  createUpdate,
  isSchemaProject,
  formatDateDe,
  formatFileSize,
  formatPlannedLabel,
  formatDateTimeDe,
  isProjectBoardColumn,
  kanbanColumnForProject,
  PROJECT_BOARD_COLUMN_LABELS,
  PROJECT_BOARD_COLUMNS,
  PROJECT_PRIORITIES,
  PROJECT_PRIORITY_LABELS,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  shortLastName,
  type Project,
  type ProjectBoardColumn,
  type ProjectPriority,
  type ProjectStatus,
} from "@/lib/projekte/types";

type Tab = "aktiv" | "archiv";

function guessOwner(user: { username: string; displayName: string } | null): string {
  if (!user) return "";
  if (user.displayName.trim()) return user.displayName.trim();
  return user.username;
}

function sortByOrder(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}

export function ProjektePage() {
  const { user } = useAuth();
  const { canEdit } = useEditAccess();
  const { technicians, ready: trackerReady } = useTracker();
  const defaultOwner = guessOwner(user);

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("aktiv");
  const [query, setQuery] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<ProjectBoardColumn | null>(null);
  const [techMenuId, setTechMenuId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [updateDraft, setUpdateDraft] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [createDraft, setCreateDraft] = useState({
    title: "",
    ownerName: "",
    plannedDate: "",
    dueDate: "",
    status: "offen" as ProjectStatus,
    priority: "mittel" as ProjectPriority,
    totalCost: "",
    rentTransporter: false,
  });

  const projectsRef = useRef<Project[]>([]);
  const persistTimer = useRef<number | null>(null);
  const skipClickRef = useRef(false);
  const openedFromQuery = useRef(false);

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  const selectableTechnicians = useMemo(
    () =>
      [...technicians]
        .filter((tech) => tech.id !== PARTNER_TECH_ID)
        .sort((a, b) => a.name.localeCompare(b.name, "de")),
    [technicians],
  );

  const techById = useMemo(() => {
    const map = new Map(selectableTechnicians.map((tech) => [tech.id, tech]));
    return map;
  }, [selectableTechnicians]);

  const persist = useCallback(
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
          credentials: "same-origin",
          body: JSON.stringify({ projects: next }),
        });
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) throw new Error(data?.error || "Speichern fehlgeschlagen.");
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
        return false;
      }
    },
    [canEdit],
  );

  const commit = useCallback(
    (next: Project[], options?: { immediate?: boolean }) => {
      projectsRef.current = next;
      setProjects(next);
      if (!canEdit) return;
      if (persistTimer.current) window.clearTimeout(persistTimer.current);
      if (options?.immediate) {
        void persist(next);
        return;
      }
      persistTimer.current = window.setTimeout(() => {
        void persist(projectsRef.current);
      }, 400);
    },
    [canEdit, persist],
  );

  useEffect(() => {
    return () => {
      if (persistTimer.current) window.clearTimeout(persistTimer.current);
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/projekte", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => null)) as {
        projects?: Project[];
        error?: string;
      } | null;
      if (!res.ok) throw new Error(data?.error || "Projekte konnten nicht geladen werden.");
      const list = Array.isArray(data?.projects) ? data.projects : [];
      projectsRef.current = list;
      setProjects(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Laden fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loading || openedFromQuery.current) return;
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) return;
    const project = projects.find((item) => item.id === id);
    if (!project) return;
    openedFromQuery.current = true;
    if (project.archived) setTab("archiv");
    setSelectedId(id);
    setUpdateDraft("");
    setTechMenuId(null);
    setMessage(null);
  }, [loading, projects]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".projekt-tech-menu-wrap")) return;
      setTechMenuId(null);
    }
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, []);

  const boardProjects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const groups: Record<ProjectBoardColumn, Project[]> = {
      offen: [],
      "in-planung": [],
      geplant: [],
    };
    for (const project of sortByOrder(projects.filter((item) => !item.archived))) {
      if (needle) {
        const techNames = project.technicianIds
          .map((id) => techById.get(id)?.name ?? "")
          .join(" ");
        const fileNames = project.attachments.map((file) => file.name).join(" ");
        const hay = `${project.title} ${project.ownerName} ${techNames} ${fileNames}`.toLowerCase();
        if (!hay.includes(needle)) continue;
      }
      const column = kanbanColumnForProject(project);
      if (column === "archiv") continue;
      groups[column].push(project);
    }
    return groups;
  }, [projects, query, techById]);

  const archivedProjects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sortByOrder(
      projects.filter((project) => {
        if (!project.archived) return false;
        if (!needle) return true;
        const techNames = project.technicianIds
          .map((id) => techById.get(id)?.name ?? "")
          .join(" ");
        const fileNames = project.attachments.map((file) => file.name).join(" ");
        return `${project.title} ${project.ownerName} ${techNames} ${fileNames}`
          .toLowerCase()
          .includes(needle);
      }),
    );
  }, [projects, query, techById]);

  const activeCount = projects.filter((p) => !p.archived).length;
  const archiveCount = projects.filter((p) => p.archived).length;

  const selected = useMemo(
    () => projects.find((project) => project.id === selectedId) ?? null,
    [projects, selectedId],
  );

  const selectedUpdates = useMemo(() => {
    if (!selected) return [];
    return [...selected.updates].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [selected]);

  function openProject(id: string) {
    if (skipClickRef.current) {
      skipClickRef.current = false;
      return;
    }
    setSelectedId(id);
    setUpdateDraft("");
    setTechMenuId(null);
    setMessage(null);
  }

  function closeProject() {
    setSelectedId(null);
    setUpdateDraft("");
  }

  function applyServerProject(project: Project) {
    const next = projectsRef.current.map((item) => (item.id === project.id ? project : item));
    projectsRef.current = next;
    setProjects(next);
  }

  async function uploadFiles(projectId: string, fileList: FileList | null) {
    if (!canEdit || !fileList?.length) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      for (const file of Array.from(fileList)) {
        form.append("file", file);
      }
      const res = await fetch(`/api/projekte/${encodeURIComponent(projectId)}/files`, {
        method: "POST",
        credentials: "same-origin",
        body: form,
      });
      const data = (await res.json().catch(() => null)) as {
        project?: Project;
        error?: string;
      } | null;
      if (!res.ok || !data?.project) {
        throw new Error(data?.error || "Upload fehlgeschlagen.");
      }
      applyServerProject(data.project);
      setMessage(
        fileList.length === 1 ? "Datei angehängt." : `${fileList.length} Dateien angehängt.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload fehlgeschlagen.");
    } finally {
      setUploading(false);
    }
  }

  function pickFiles(projectId: string) {
    if (!canEdit) return;
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.onchange = () => void uploadFiles(projectId, input.files);
    input.click();
  }

  async function removeAttachment(projectId: string, fileId: string, fileName: string) {
    if (!canEdit) return;
    if (!window.confirm(`Datei „${fileName}“ entfernen?`)) return;
    setError(null);
    try {
      const res = await fetch(
        `/api/projekte/${encodeURIComponent(projectId)}/files/${encodeURIComponent(fileId)}`,
        { method: "DELETE", credentials: "same-origin" },
      );
      const data = (await res.json().catch(() => null)) as {
        project?: Project;
        error?: string;
      } | null;
      if (!res.ok || !data?.project) {
        throw new Error(data?.error || "Datei konnte nicht entfernt werden.");
      }
      applyServerProject(data.project);
      setMessage("Datei entfernt.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Datei konnte nicht entfernt werden.");
    }
  }

  function addUpdate() {
    if (!selected || !canEdit) return;
    const text = updateDraft.trim();
    if (!text) {
      setError("Bitte einen Update-Text eingeben.");
      return;
    }
    updateProject(
      selected.id,
      (item) => ({
        ...item,
        updates: [createUpdate(text, defaultOwner || item.ownerName || "Unbekannt"), ...item.updates],
      }),
      true,
    );
    setUpdateDraft("");
    setMessage("Update hinzugefügt.");
  }

  function updateProject(
    id: string,
    mutator: (project: Project) => Project,
    immediate = false,
  ) {
    const next = projectsRef.current.map((project) =>
      project.id === id
        ? mutator({ ...project, updatedAt: new Date().toISOString() })
        : project,
    );
    commit(next, { immediate });
  }

  function openCreateProject() {
    if (!canEdit) {
      setError("Schreibzugriff gesperrt.");
      return;
    }
    setCreateDraft({
      title: "",
      ownerName: defaultOwner,
      plannedDate: "",
      dueDate: "",
      status: "offen",
      priority: "mittel",
      totalCost: "",
      rentTransporter: false,
    });
    setCreateOpen(true);
    setError(null);
  }

  function submitCreateProject() {
    const title = createDraft.title.trim();
    if (!title) {
      setError("Titel ist erforderlich.");
      return;
    }
    const maxOrder = projectsRef.current.reduce(
      (max, project) => Math.max(max, project.order),
      0,
    );
    const project = {
      ...createProject({
        title,
        ownerName: createDraft.ownerName.trim() || defaultOwner,
        order: maxOrder + 1,
      }),
      status: createDraft.status,
      priority: createDraft.priority,
      plannedDate: createDraft.plannedDate || null,
      dueDate: createDraft.dueDate || null,
      totalCost: createDraft.totalCost.trim(),
      rentTransporter: createDraft.rentTransporter,
    };
    commit([project, ...projectsRef.current], { immediate: true });
    setCreateOpen(false);
    setTab("aktiv");
    setSelectedId(project.id);
    setMessage("Projekt angelegt.");
  }

  function addSubtask(projectId: string) {
    const title = window.prompt("Unteraufgabe?", "");
    if (!title?.trim()) return;
    updateProject(
      projectId,
      (project) => ({
        ...project,
        subtasks: [...project.subtasks, createSubtask(title)],
        expanded: true,
      }),
      true,
    );
  }

  function onDragStart(id: string) {
    if (!canEdit) return;
    setDragId(id);
  }

  function onDropOnColumn(column: ProjectBoardColumn) {
    if (!canEdit || !dragId || !isProjectBoardColumn(column)) {
      setDragId(null);
      setOverColumn(null);
      return;
    }
    const project = projectsRef.current.find((item) => item.id === dragId);
    if (!project || project.archived) {
      setDragId(null);
      setOverColumn(null);
      return;
    }
    const current = kanbanColumnForProject(project);
    if (current === column) {
      setDragId(null);
      setOverColumn(null);
      return;
    }
    skipClickRef.current = true;
    const moved = applyProjectStatus(project, column);
    setDragId(null);
    setOverColumn(null);
    updateProject(moved.id, () => moved, true);
    setMessage(`Status: ${PROJECT_BOARD_COLUMN_LABELS[column]}.`);
  }

  function restoreProject(id: string) {
    updateProject(id, (item) => applyProjectStatus(item, "offen"), true);
    setTab("aktiv");
    setMessage("Projekt wiederhergestellt.");
  }

  function deleteProject(project: Project) {
    if (!window.confirm(`Projekt „${project.title}“ löschen?`)) return;
    if (selectedId === project.id) closeProject();
    commit(
      projectsRef.current.filter((item) => item.id !== project.id),
      { immediate: true },
    );
    setMessage("Projekt gelöscht.");
  }

  function toggleTechnician(projectId: string, technicianId: string) {
    updateProject(
      projectId,
      (project) => {
        const has = project.technicianIds.includes(technicianId);
        return {
          ...project,
          technicianIds: has
            ? project.technicianIds.filter((id) => id !== technicianId)
            : [...project.technicianIds, technicianId],
        };
      },
      true,
    );
  }

  function renderProjectCard(project: Project) {
    const techNames = project.technicianIds
      .map((id) => techById.get(id)?.name)
      .filter(Boolean) as string[];
    return (
      <article
        key={project.id}
        className={`aufgaben-card prio-${project.priority} ${dragId === project.id ? "is-dragging" : ""}`}
        draggable={canEdit}
        onDragStart={(event) => {
          event.dataTransfer.setData("text/plain", project.id);
          event.dataTransfer.effectAllowed = "move";
          onDragStart(project.id);
        }}
        onDragEnd={() => {
          setDragId(null);
          setOverColumn(null);
        }}
      >
        <button
          type="button"
          className="aufgaben-card-main"
          draggable={canEdit}
          onDragStart={(event) => {
            event.dataTransfer.setData("text/plain", project.id);
            event.dataTransfer.effectAllowed = "move";
            onDragStart(project.id);
          }}
          onClick={() => openProject(project.id)}
        >
          <span className="aufgaben-item-title">{project.title}</span>
          <span className="aufgaben-item-meta">
            <span className={`aufgaben-pill status-${project.status}`}>
              {PROJECT_STATUS_LABELS[project.status]}
            </span>
            <span className={`aufgaben-pill prio-${project.priority}`}>
              {PROJECT_PRIORITY_LABELS[project.priority]}
            </span>
            {isSchemaProject(project) ? (
              <Link
                href={`/verwaltung/schema/${encodeURIComponent(project.id)}`}
                className="aufgaben-pill schema-pill"
                onClick={(e) => e.stopPropagation()}
              >
                Schema
              </Link>
            ) : null}
            <span>Geplant {formatPlannedLabel(project.plannedDate)}</span>
            <span>Fällig {formatDateDe(project.dueDate)}</span>
            {project.updates.length > 0 ? (
              <span>
                {project.updates.length} Update
                {project.updates.length === 1 ? "" : "s"}
              </span>
            ) : null}
            {project.attachments.length > 0 ? (
              <span>
                {project.attachments.length} Datei
                {project.attachments.length === 1 ? "" : "en"}
              </span>
            ) : null}
          </span>
        </button>
        <div
          className="projekt-tech-menu-wrap aufgaben-card-tech"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="projekt-tech-btn"
            disabled={!canEdit}
            onClick={() =>
              setTechMenuId((current) => (current === project.id ? null : project.id))
            }
          >
            {techNames.length > 0
              ? techNames.map(shortLastName).join(", ")
              : "Techniker wählen"}
          </button>
          {techMenuId === project.id ? (
            <div className="projekt-tech-menu">
              {selectableTechnicians.length === 0 ? (
                <p className="muted-meta">Keine Techniker in der Datenbank.</p>
              ) : (
                selectableTechnicians.map((tech) => {
                  const checked = project.technicianIds.includes(tech.id);
                  return (
                    <label key={tech.id}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTechnician(project.id, tech.id)}
                      />
                      <span>{tech.name}</span>
                    </label>
                  );
                })
              )}
              <button
                type="button"
                className="projekt-tech-close"
                onClick={() => setTechMenuId(null)}
              >
                Schließen
              </button>
            </div>
          ) : null}
        </div>
      </article>
    );
  }

  if (!trackerReady && loading) {
    return (
      <div className="page-panel">
        <div className="tracker-loading">Lade Projekte…</div>
      </div>
    );
  }

  return (
    <div className="page-panel projekte-page">
      <header className="section-header">
        <div>
          <h1>Projekte</h1>
          <p>Kanban nach Status – Drag &amp; Drop ändert den Status automatisch</p>
        </div>
        <div className="projekte-header-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canEdit}
            onClick={openCreateProject}
          >
            + Neues Projekt
          </button>
        </div>
      </header>

      <div className="projekte-toolbar">
        <label className="projekte-search">
          <span className="sr-only">Suche</span>
          <input
            type="search"
            placeholder="Projekte durchsuchen…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="projekte-tabs" role="tablist">
          <button
            type="button"
            className={`projekte-tab ${tab === "aktiv" ? "is-active" : ""}`}
            onClick={() => setTab("aktiv")}
          >
            Board <span className="projekte-tab-count">{activeCount}</span>
          </button>
          <button
            type="button"
            className={`projekte-tab ${tab === "archiv" ? "is-active" : ""}`}
            onClick={() => setTab("archiv")}
          >
            Archiv <span className="projekte-tab-count">{archiveCount}</span>
          </button>
        </div>
      </div>

      {error ? <p className="projekte-banner is-error">{error}</p> : null}
      {message ? <p className="projekte-banner is-ok">{message}</p> : null}

      {loading ? (
        <p className="muted-meta">Lade Projekte…</p>
      ) : tab === "archiv" ? (
        archivedProjects.length === 0 ? (
          <section className="content-card">
            <p className="muted-meta">Noch keine abgeschlossenen Projekte im Archiv.</p>
          </section>
        ) : (
          <ul className="aufgaben-list">
            {archivedProjects.map((project) => (
              <li key={project.id} className={`aufgaben-item prio-${project.priority}`}>
                <button
                  type="button"
                  className="aufgaben-item-main"
                  onClick={() => openProject(project.id)}
                >
                  <span className="aufgaben-item-title">{project.title}</span>
                  <span className="aufgaben-item-meta">
                    <span className="aufgaben-pill status-abgeschlossen">
                      {PROJECT_STATUS_LABELS[project.status]}
                    </span>
                    <span>Fällig {formatDateDe(project.dueDate)}</span>
                    {project.technicianIds.length > 0 ? (
                      <span>
                        {project.technicianIds
                          .map((id) => techById.get(id)?.name)
                          .filter(Boolean)
                          .map((name) => shortLastName(name as string))
                          .join(", ")}
                      </span>
                    ) : null}
                  </span>
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={!canEdit}
                  onClick={() => restoreProject(project.id)}
                >
                  Wiederherstellen
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="projekte-kanban" role="list">
          {PROJECT_BOARD_COLUMNS.map((column) => {
            const items = boardProjects[column];
            return (
              <section
                key={column}
                className={`aufgaben-kanban-col ${overColumn === column ? "is-over" : ""}`}
                onDragOver={(event) => {
                  if (!canEdit) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setOverColumn(column);
                }}
                onDragLeave={() => {
                  setOverColumn((current) => (current === column ? null : current));
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  onDropOnColumn(column);
                }}
              >
                <header>
                  <h2>{PROJECT_BOARD_COLUMN_LABELS[column]}</h2>
                  <span>{items.length}</span>
                </header>
                <div className="aufgaben-kanban-list">
                  {items.length === 0 ? (
                    <p className="muted-meta">Keine Projekte</p>
                  ) : (
                    items.map(renderProjectCard)
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {selected ? (
        <div
          className="projekt-modal-backdrop"
          role="presentation"
          onClick={closeProject}
        >
          <div
            className="projekt-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="projekt-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="projekt-modal-head">
              <div>
                <h2 id="projekt-modal-title">{selected.title}</h2>
                <p className="muted-meta">
                  {PROJECT_STATUS_LABELS[selected.status]} ·{" "}
                  {PROJECT_PRIORITY_LABELS[selected.priority]}
                  {selected.updates.length > 0
                    ? ` · ${selected.updates.length} Update${selected.updates.length === 1 ? "" : "s"}`
                    : ""}
                  {selected.attachments.length > 0
                    ? ` · ${selected.attachments.length} Datei${selected.attachments.length === 1 ? "" : "en"}`
                    : ""}
                </p>
              </div>
              <div className="projekt-modal-head-actions">
                {selected.archived ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={!canEdit}
                    onClick={() => restoreProject(selected.id)}
                  >
                    Wiederherstellen
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={!canEdit}
                  onClick={() => deleteProject(selected)}
                >
                  Löschen
                </button>
                <button type="button" className="btn btn-ghost" onClick={closeProject}>
                  Schließen
                </button>
              </div>
            </header>

            <div className="projekt-modal-body">
              <div className="projekt-fields">
                <label className="full">
                  <span>Titel</span>
                  <input
                    value={selected.title}
                    disabled={!canEdit}
                    onChange={(event) =>
                      updateProject(selected.id, (item) => ({
                        ...item,
                        title: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>Status</span>
                  <select
                    value={selected.status}
                    disabled={!canEdit}
                    onChange={(event) => {
                      const status = event.target.value as ProjectStatus;
                      const wasArchived = selected.archived;
                      updateProject(
                        selected.id,
                        (item) => applyProjectStatus(item, status),
                        true,
                      );
                      if (status === "abgeschlossen") {
                        closeProject();
                        setMessage("Projekt abgeschlossen und ins Archiv verschoben.");
                      } else if (wasArchived) {
                        setTab("aktiv");
                        setMessage("Projekt wiederhergestellt.");
                      }
                    }}
                  >
                    {PROJECT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {PROJECT_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Priorität</span>
                  <select
                    value={selected.priority}
                    disabled={!canEdit}
                    onChange={(event) =>
                      updateProject(
                        selected.id,
                        (item) => ({
                          ...item,
                          priority: event.target.value as ProjectPriority,
                        }),
                        true,
                      )
                    }
                  >
                    {PROJECT_PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>
                        {PROJECT_PRIORITY_LABELS[priority]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Techniker</span>
                  <div className="projekt-tech-menu-wrap">
                    <button
                      type="button"
                      className="projekt-tech-btn"
                      disabled={!canEdit}
                      onClick={() =>
                        setTechMenuId((current) =>
                          current === "editor" ? null : "editor",
                        )
                      }
                    >
                      {selected.technicianIds.length > 0
                        ? selected.technicianIds
                            .map((id) => techById.get(id)?.name)
                            .filter(Boolean)
                            .map((name) => shortLastName(name as string))
                            .join(", ")
                        : "Techniker wählen"}
                    </button>
                    {techMenuId === "editor" ? (
                      <div className="projekt-tech-menu">
                        {selectableTechnicians.length === 0 ? (
                          <p className="muted-meta">Keine Techniker in der Datenbank.</p>
                        ) : (
                          selectableTechnicians.map((tech) => {
                            const checked = selected.technicianIds.includes(tech.id);
                            return (
                              <label key={tech.id}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleTechnician(selected.id, tech.id)}
                                />
                                <span>{tech.name}</span>
                              </label>
                            );
                          })
                        )}
                        <button
                          type="button"
                          className="projekt-tech-close"
                          onClick={() => setTechMenuId(null)}
                        >
                          Schließen
                        </button>
                      </div>
                    ) : null}
                  </div>
                </label>
                <label>
                  <span>Voraussichtlich geplant</span>
                  <input
                    type="text"
                    value={selected.plannedDate ?? ""}
                    disabled={!canEdit}
                    placeholder="z.B. KW 12 / Mitte März / 15.03.2026"
                    onChange={(event) =>
                      updateProject(
                        selected.id,
                        (item) => ({
                          ...item,
                          plannedDate: event.target.value || null,
                        }),
                        true,
                      )
                    }
                  />
                </label>
                <label>
                  <span>Fällig</span>
                  <input
                    type="date"
                    value={selected.dueDate ?? ""}
                    disabled={!canEdit}
                    onChange={(event) =>
                      updateProject(
                        selected.id,
                        (item) => ({
                          ...item,
                          dueDate: event.target.value || null,
                        }),
                        true,
                      )
                    }
                  />
                </label>
                <label>
                  <span>Von</span>
                  <input
                    type="date"
                    value={selected.dateFrom ?? ""}
                    disabled={!canEdit}
                    onChange={(event) =>
                      updateProject(
                        selected.id,
                        (item) => ({
                          ...item,
                          dateFrom: event.target.value || null,
                        }),
                        true,
                      )
                    }
                  />
                </label>
                <label>
                  <span>Bis</span>
                  <input
                    type="date"
                    value={selected.dateTo ?? ""}
                    disabled={!canEdit}
                    onChange={(event) =>
                      updateProject(
                        selected.id,
                        (item) => ({
                          ...item,
                          dateTo: event.target.value || null,
                        }),
                        true,
                      )
                    }
                  />
                </label>
                <label>
                  <span>Kosten gesamt</span>
                  <input
                    type="text"
                    placeholder="z.B. 1200 €"
                    value={selected.totalCost}
                    disabled={!canEdit}
                    onChange={(event) =>
                      updateProject(selected.id, (item) => ({
                        ...item,
                        totalCost: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>Transporter mieten</span>
                  <select
                    value={selected.rentTransporter ? "ja" : "nein"}
                    disabled={!canEdit}
                    onChange={(event) =>
                      updateProject(
                        selected.id,
                        (item) => ({
                          ...item,
                          rentTransporter: event.target.value === "ja",
                        }),
                        true,
                      )
                    }
                  >
                    <option value="nein">Nein</option>
                    <option value="ja">Ja</option>
                  </select>
                </label>
              </div>

              <section className="projekt-files">
                <div className="projekt-updates-head">
                  <h3>Unteraufgaben</h3>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={!canEdit}
                    onClick={() => addSubtask(selected.id)}
                  >
                    + Unteraufgabe
                  </button>
                </div>
                {selected.subtasks.length === 0 ? (
                  <p className="muted-meta">Noch keine Unteraufgaben.</p>
                ) : (
                  <ul className="projekt-subtasks">
                    {selected.subtasks.map((subtask) => (
                      <li key={subtask.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={subtask.done}
                            disabled={!canEdit}
                            onChange={(event) =>
                              updateProject(
                                selected.id,
                                (item) => ({
                                  ...item,
                                  subtasks: item.subtasks.map((entry) =>
                                    entry.id === subtask.id
                                      ? { ...entry, done: event.target.checked }
                                      : entry,
                                  ),
                                }),
                                true,
                              )
                            }
                          />
                          <span className={subtask.done ? "is-done" : undefined}>
                            {subtask.title}
                          </span>
                        </label>
                        {canEdit ? (
                          <button
                            type="button"
                            className="projekt-subtask-remove"
                            onClick={() =>
                              updateProject(
                                selected.id,
                                (item) => ({
                                  ...item,
                                  subtasks: item.subtasks.filter(
                                    (entry) => entry.id !== subtask.id,
                                  ),
                                }),
                                true,
                              )
                            }
                          >
                            Entfernen
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="projekt-files">
                <div className="projekt-updates-head">
                  <h3>Dateien</h3>
                  <span className="muted-meta">
                    {selected.attachments.length}{" "}
                    {selected.attachments.length === 1 ? "Anhang" : "Anhänge"}
                  </span>
                </div>
                <div className="projekt-files-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={!canEdit || uploading}
                    onClick={() => pickFiles(selected.id)}
                  >
                    {uploading ? "Lade hoch…" : "Dateien anhängen"}
                  </button>
                  <span className="muted-meta">PDF, Office, Bilder, ZIP · max. 25 MB</span>
                </div>
                {selected.attachments.length === 0 ? (
                  <p className="muted-meta">Noch keine Dateien am Projekt.</p>
                ) : (
                  <ul className="projekt-file-list">
                    {selected.attachments.map((file) => (
                      <li key={file.id}>
                        <a
                          className="projekt-file-name"
                          href={`/api/projekte/${encodeURIComponent(selected.id)}/files/${encodeURIComponent(file.id)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {file.name}
                        </a>
                        <span className="muted-meta">
                          {formatFileSize(file.size)}
                          {file.uploadedBy ? ` · ${file.uploadedBy}` : ""}
                          {file.uploadedAt ? ` · ${formatDateTimeDe(file.uploadedAt)}` : ""}
                        </span>
                        {canEdit ? (
                          <button
                            type="button"
                            className="projekt-update-remove"
                            onClick={() => void removeAttachment(selected.id, file.id, file.name)}
                          >
                            Entfernen
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="projekt-updates">
                <div className="projekt-updates-head">
                  <h3>Projekt-Updates</h3>
                  <span className="muted-meta">{selectedUpdates.length} Einträge</span>
                </div>

                <div className="projekt-update-compose">
                  <textarea
                    rows={3}
                    placeholder="Neues Update zum Projekt schreiben…"
                    value={updateDraft}
                    disabled={!canEdit}
                    onChange={(event) => setUpdateDraft(event.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!canEdit || !updateDraft.trim()}
                    onClick={addUpdate}
                  >
                    Update speichern
                  </button>
                </div>

                {selectedUpdates.length === 0 ? (
                  <p className="muted-meta">Noch keine Updates vorhanden.</p>
                ) : (
                  <ul className="projekt-update-list">
                    {selectedUpdates.map((entry) => (
                      <li key={entry.id}>
                        <div className="projekt-update-meta">
                          <strong>{entry.author || "Unbekannt"}</strong>
                          <span>{formatDateTimeDe(entry.createdAt)}</span>
                        </div>
                        <p>{entry.text}</p>
                        {canEdit ? (
                          <button
                            type="button"
                            className="projekt-update-remove"
                            onClick={() =>
                              updateProject(
                                selected.id,
                                (item) => ({
                                  ...item,
                                  updates: item.updates.filter(
                                    (update) => update.id !== entry.id,
                                  ),
                                }),
                                true,
                              )
                            }
                          >
                            Entfernen
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </div>
      ) : null}

      {createOpen ? (
        <div
          className="projekt-modal-backdrop"
          role="presentation"
          onClick={() => setCreateOpen(false)}
        >
          <div
            className="projekt-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="projekt-create-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="projekt-modal-head">
              <div>
                <h2 id="projekt-create-title">Neues Projekt</h2>
                <p className="muted-meta">Grunddaten für das kommende Projekt</p>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setCreateOpen(false)}
              >
                Schließen
              </button>
            </header>
            <div className="projekt-modal-body">
              <div className="projekt-fields">
                <label className="full">
                  <span>Titel</span>
                  <input
                    autoFocus
                    value={createDraft.title}
                    placeholder="z.B. BAWAG Druckerrollout – Etiketten Hamburg"
                    onChange={(event) =>
                      setCreateDraft((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>Verantwortlich</span>
                  <input
                    value={createDraft.ownerName}
                    onChange={(event) =>
                      setCreateDraft((current) => ({
                        ...current,
                        ownerName: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>Status</span>
                  <select
                    value={createDraft.status}
                    onChange={(event) =>
                      setCreateDraft((current) => ({
                        ...current,
                        status: event.target.value as ProjectStatus,
                      }))
                    }
                  >
                    {PROJECT_BOARD_COLUMNS.map((status) => (
                      <option key={status} value={status}>
                        {PROJECT_BOARD_COLUMN_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Priorität</span>
                  <select
                    value={createDraft.priority}
                    onChange={(event) =>
                      setCreateDraft((current) => ({
                        ...current,
                        priority: event.target.value as ProjectPriority,
                      }))
                    }
                  >
                    {PROJECT_PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>
                        {PROJECT_PRIORITY_LABELS[priority]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Voraussichtlich geplant</span>
                  <input
                    type="text"
                    value={createDraft.plannedDate}
                    placeholder="z.B. KW 12 / Mitte März / 15.03.2026"
                    onChange={(event) =>
                      setCreateDraft((current) => ({
                        ...current,
                        plannedDate: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>Fällig</span>
                  <input
                    type="date"
                    value={createDraft.dueDate}
                    onChange={(event) =>
                      setCreateDraft((current) => ({
                        ...current,
                        dueDate: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>Kosten gesamt</span>
                  <input
                    value={createDraft.totalCost}
                    placeholder="z.B. 1200 €"
                    onChange={(event) =>
                      setCreateDraft((current) => ({
                        ...current,
                        totalCost: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>Transporter mieten</span>
                  <select
                    value={createDraft.rentTransporter ? "ja" : "nein"}
                    onChange={(event) =>
                      setCreateDraft((current) => ({
                        ...current,
                        rentTransporter: event.target.value === "ja",
                      }))
                    }
                  >
                    <option value="nein">Nein</option>
                    <option value="ja">Ja</option>
                  </select>
                </label>
              </div>
              <div className="projekt-create-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setCreateOpen(false)}
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={submitCreateProject}
                >
                  Anlegen
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
