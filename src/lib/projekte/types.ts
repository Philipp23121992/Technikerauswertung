import { createId } from "@/lib/id";
import {
  createEmptySchemaDocument,
  normalizeSchemaDocument,
  type SchemaDocument,
  type SchemaMode,
} from "@/lib/projekte/schema-types";

export type { SchemaDocument, SchemaMode } from "@/lib/projekte/schema-types";
export {
  SCHEMA_MODES,
  SCHEMA_MODE_LABELS,
  createEmptySchemaDocument,
  isSchemaMode,
} from "@/lib/projekte/schema-types";

export const PROJECT_KINDS = ["standard", "schema"] as const;
export type ProjectKind = (typeof PROJECT_KINDS)[number];

export const PROJECT_STATUSES = [
  "offen",
  "in-planung",
  "geplant",
  "abgeschlossen",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  offen: "Offen",
  "in-planung": "In Planung",
  geplant: "Geplant",
  abgeschlossen: "Abgeschlossen",
};

export const PROJECT_BOARD_COLUMNS = ["offen", "in-planung", "geplant"] as const;

export type ProjectBoardColumn = (typeof PROJECT_BOARD_COLUMNS)[number];

export const PROJECT_BOARD_COLUMN_LABELS: Record<ProjectBoardColumn, string> = {
  offen: "Offen",
  "in-planung": "In Planung",
  geplant: "Geplant",
};

export const PROJECT_PRIORITIES = [
  "niedrig",
  "mittel",
  "hoch",
  "sehr-hoch",
] as const;

export type ProjectPriority = (typeof PROJECT_PRIORITIES)[number];

export const PROJECT_PRIORITY_LABELS: Record<ProjectPriority, string> = {
  niedrig: "Niedrig",
  mittel: "Mittel",
  hoch: "Hoch",
  "sehr-hoch": "Sehr Hoch",
};

export type ProjectSubtask = {
  id: string;
  title: string;
  done: boolean;
};

export type ProjectUpdate = {
  id: string;
  text: string;
  author: string;
  createdAt: string;
};

export type ProjectAttachment = {
  id: string;
  name: string;
  storedName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
};

export type Project = {
  id: string;
  title: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  plannedDate: string | null;
  dueDate: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  totalCost: string;
  rentTransporter: boolean;
  ownerName: string;
  technicianIds: string[];
  subtasks: ProjectSubtask[];
  updates: ProjectUpdate[];
  attachments: ProjectAttachment[];
  expanded: boolean;
  order: number;
  archived: boolean;
  /** ISO-Zeitpunkt nach Versand der Fälligkeitsmail */
  dueMailSentAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Standard-Kanban-Projekt oder Schema/Mindmap (erscheint weiterhin unter Projekte) */
  projectKind: ProjectKind;
  schemaDocument: SchemaDocument | null;
};

export type ProjekteDb = {
  version: 1;
  projects: Project[];
};

export function createEmptyProjekteDb(): ProjekteDb {
  return { version: 1, projects: [] };
}

function isStatus(value: unknown): value is ProjectStatus {
  return typeof value === "string" && (PROJECT_STATUSES as readonly string[]).includes(value);
}

function migrateProjectStatus(value: unknown): ProjectStatus {
  if (value === "aktiv") return "offen";
  return isStatus(value) ? value : "in-planung";
}

function isPriority(value: unknown): value is ProjectPriority {
  return typeof value === "string" && (PROJECT_PRIORITIES as readonly string[]).includes(value);
}

function normalizeIsoDate(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function normalizeSubtask(raw: Partial<ProjectSubtask>): ProjectSubtask | null {
  if (!raw?.id || typeof raw.id !== "string") return null;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title) return null;
  return { id: raw.id, title, done: Boolean(raw.done) };
}

function normalizeUpdate(raw: Partial<ProjectUpdate>): ProjectUpdate | null {
  if (!raw?.id || typeof raw.id !== "string") return null;
  const text = typeof raw.text === "string" ? raw.text.trim() : "";
  if (!text) return null;
  return {
    id: raw.id,
    text,
    author: typeof raw.author === "string" ? raw.author.trim() : "",
    createdAt:
      typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
  };
}

function normalizeAttachment(raw: Partial<ProjectAttachment>): ProjectAttachment | null {
  if (!raw?.id || typeof raw.id !== "string") return null;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const storedName = typeof raw.storedName === "string" ? raw.storedName.trim() : "";
  if (!name || !storedName) return null;
  const size = typeof raw.size === "number" && Number.isFinite(raw.size) ? raw.size : 0;
  return {
    id: raw.id,
    name,
    storedName,
    mimeType: typeof raw.mimeType === "string" ? raw.mimeType : "application/octet-stream",
    size: Math.max(0, size),
    uploadedAt:
      typeof raw.uploadedAt === "string" ? raw.uploadedAt : new Date().toISOString(),
    uploadedBy: typeof raw.uploadedBy === "string" ? raw.uploadedBy.trim() : "",
  };
}

export function normalizeProject(raw: Partial<Project>, index = 0): Project | null {
  if (!raw?.id || typeof raw.id !== "string") return null;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title) return null;

  const status = migrateProjectStatus(raw.status);
  const archived = Boolean(raw.archived) || status === "abgeschlossen";
  const subtasks = Array.isArray(raw.subtasks)
    ? raw.subtasks
        .map((item) => normalizeSubtask(item as Partial<ProjectSubtask>))
        .filter((item): item is ProjectSubtask => Boolean(item))
    : [];
  const updates = Array.isArray(raw.updates)
    ? raw.updates
        .map((item) => normalizeUpdate(item as Partial<ProjectUpdate>))
        .filter((item): item is ProjectUpdate => Boolean(item))
    : [];
  const technicianIds = Array.isArray(raw.technicianIds)
    ? raw.technicianIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  const attachments = Array.isArray(raw.attachments)
    ? raw.attachments
        .map((item) => normalizeAttachment(item as Partial<ProjectAttachment>))
        .filter((item): item is ProjectAttachment => Boolean(item))
    : [];

  return {
    id: raw.id,
    title,
    status: archived && status === "abgeschlossen" ? "abgeschlossen" : status,
    priority: isPriority(raw.priority) ? raw.priority : "mittel",
    plannedDate:
      typeof raw.plannedDate === "string" && raw.plannedDate.trim()
        ? raw.plannedDate.trim()
        : null,
    dueDate: normalizeIsoDate(raw.dueDate),
    dateFrom: normalizeIsoDate(raw.dateFrom),
    dateTo: normalizeIsoDate(raw.dateTo),
    totalCost: typeof raw.totalCost === "string" ? raw.totalCost : "",
    rentTransporter: Boolean(raw.rentTransporter),
    ownerName: typeof raw.ownerName === "string" ? raw.ownerName : "",
    technicianIds,
    subtasks,
    updates,
    attachments,
    expanded: raw.expanded !== false,
    order: typeof raw.order === "number" && Number.isFinite(raw.order) ? raw.order : index,
    archived,
    dueMailSentAt:
      typeof raw.dueMailSentAt === "string" ? raw.dueMailSentAt : null,
    createdAt:
      typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    updatedAt:
      typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
    projectKind: raw.projectKind === "schema" ? "schema" : "standard",
    schemaDocument:
      raw.projectKind === "schema"
        ? normalizeSchemaDocument(raw.schemaDocument) ?? createEmptySchemaDocument("mindmap")
        : raw.schemaDocument
          ? normalizeSchemaDocument(raw.schemaDocument)
          : null,
  };
}

export function createProject(input: {
  title: string;
  ownerName?: string;
  technicianIds?: string[];
  order?: number;
}): Project {
  const now = new Date().toISOString();
  return {
    id: createId("proj"),
    title: input.title.trim(),
    status: "offen",
    priority: "mittel",
    plannedDate: "",
    dueDate: null,
    dateFrom: null,
    dateTo: null,
    totalCost: "",
    rentTransporter: false,
    ownerName: input.ownerName?.trim() ?? "",
    technicianIds: input.technicianIds ?? [],
    subtasks: [],
    updates: [],
    attachments: [],
    expanded: true,
    order: input.order ?? Date.now(),
    archived: false,
    dueMailSentAt: null,
    createdAt: now,
    updatedAt: now,
    projectKind: "standard",
    schemaDocument: null,
  };
}

export function createSchemaProject(input: {
  title: string;
  mode: SchemaMode;
  ownerName?: string;
  order?: number;
}): Project {
  const base = createProject({
    title: input.title,
    ownerName: input.ownerName,
    order: input.order,
  });
  return {
    ...base,
    projectKind: "schema",
    schemaDocument: createEmptySchemaDocument(input.mode),
  };
}

export function isSchemaProject(project: Project): boolean {
  return project.projectKind === "schema";
}

export function createSubtask(title: string): ProjectSubtask {
  return {
    id: createId("sub"),
    title: title.trim(),
    done: false,
  };
}

export function createUpdate(text: string, author: string): ProjectUpdate {
  return {
    id: createId("upd"),
    text: text.trim(),
    author: author.trim(),
    createdAt: new Date().toISOString(),
  };
}

export function applyProjectStatus(project: Project, status: ProjectStatus): Project {
  const now = new Date().toISOString();
  if (status === "abgeschlossen") {
    return {
      ...project,
      status: "abgeschlossen",
      archived: true,
      updatedAt: now,
    };
  }
  return {
    ...project,
    status,
    archived: false,
    updatedAt: now,
  };
}

export function kanbanColumnForProject(project: Project): ProjectBoardColumn | "archiv" {
  if (project.archived || project.status === "abgeschlossen") return "archiv";
  if (project.status === "geplant") return "geplant";
  if (project.status === "in-planung") return "in-planung";
  return "offen";
}

export function isProjectBoardColumn(value: string): value is ProjectBoardColumn {
  return (PROJECT_BOARD_COLUMNS as readonly string[]).includes(value);
}

export function formatDateDe(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

/** Freitext oder ISO-Datum für „Voraussichtlich geplant“ anzeigen */
export function formatPlannedLabel(value: string | null | undefined): string {
  if (!value?.trim()) return "—";
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return formatDateDe(trimmed);
  return trimmed;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function formatDateTimeDe(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function shortLastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fullName;
  if (parts.length === 1) return parts[0];
  return parts[parts.length - 1];
}
