export const TASK_STATUSES = [
  "offen",
  "bearbeitung",
  "warten",
  "vertretung",
  "abgeschlossen",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  offen: "Offen",
  bearbeitung: "In Bearbeitung",
  warten: "Warten",
  vertretung: "Vertretungen",
  abgeschlossen: "Abgeschlossen",
};

export const TASK_BOARD_COLUMNS = [
  "heute",
  "offen",
  "bearbeitung",
  "warten",
  "vertretung",
  "abwesend-techniker",
  "abwesend-sl",
] as const;

export type TaskBoardColumn = (typeof TASK_BOARD_COLUMNS)[number];

export const TASK_BOARD_COLUMN_LABELS: Record<TaskBoardColumn, string> = {
  heute: "Aktueller Tag",
  offen: "Offen",
  bearbeitung: "In Bearbeitung",
  warten: "Warten",
  vertretung: "Vertretungen",
  "abwesend-techniker": "Abwesenheit Techniker",
  "abwesend-sl": "Abwesenheit Serviceleitung",
};

export const TASK_DROPPABLE_COLUMNS = [
  "heute",
  "offen",
  "bearbeitung",
  "warten",
  "vertretung",
] as const;

export type TaskDroppableColumn = (typeof TASK_DROPPABLE_COLUMNS)[number];

export const TASK_PRIORITIES = [
  "niedrig",
  "mittel",
  "hoch",
  "sehr-hoch",
] as const;

export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  niedrig: "Niedrig",
  mittel: "Mittel",
  hoch: "Hoch",
  "sehr-hoch": "Sehr Hoch",
};

export const REMINDER_RHYTHMS = [
  "none",
  "daily",
  "every-2-days",
  "weekly",
  "biweekly",
] as const;

export type ReminderRhythm = (typeof REMINDER_RHYTHMS)[number];

export const REMINDER_RHYTHM_LABELS: Record<ReminderRhythm, string> = {
  none: "Keine Erinnerungen",
  daily: "Täglich",
  "every-2-days": "Alle 2 Tage",
  weekly: "Wöchentlich",
  biweekly: "Alle 2 Wochen",
};

export const REMINDER_RHYTHM_DAYS: Record<ReminderRhythm, number | null> = {
  none: null,
  daily: 1,
  "every-2-days": 2,
  weekly: 7,
  biweekly: 14,
};

export type TaskUpdate = {
  id: string;
  text: string;
  createdAt: string;
};

export type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  absenceFrom: string | null;
  absenceTo: string | null;
  reminderRhythm: ReminderRhythm;
  notifyEmail: string;
  technicianIds: string[];
  serviceLeitungNames: string[];
  updates: TaskUpdate[];
  order: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  dueMailSentAt: string | null;
  lastReminderSentAt: string | null;
};

export type AufgabenDb = {
  version: 1;
  tasks: Task[];
};

export function createEmptyAufgabenDb(): AufgabenDb {
  return { version: 1, tasks: [] };
}

export function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function daysBetween(fromIsoDate: string, toIsoDate: string): number {
  const from = Date.parse(`${fromIsoDate}T00:00:00`);
  const to = Date.parse(`${toIsoDate}T00:00:00`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.floor((to - from) / (24 * 60 * 60 * 1000));
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && (TASK_STATUSES as readonly string[]).includes(value);
}

function isTaskPriority(value: unknown): value is TaskPriority {
  return typeof value === "string" && (TASK_PRIORITIES as readonly string[]).includes(value);
}

function isReminderRhythm(value: unknown): value is ReminderRhythm {
  return typeof value === "string" && (REMINDER_RHYTHMS as readonly string[]).includes(value);
}

function normalizeIsoDate(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function normalizeNameList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const name = item.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

function normalizeTaskUpdate(raw: Partial<TaskUpdate>): TaskUpdate | null {
  if (!raw?.id || typeof raw.id !== "string") return null;
  const text = typeof raw.text === "string" ? raw.text.trim() : "";
  if (!text) return null;
  return {
    id: raw.id,
    text,
    createdAt:
      typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
  };
}

export function normalizeTask(raw: Partial<Task>, index = 0): Task | null {
  if (!raw?.id || typeof raw.id !== "string") return null;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title) return null;

  const status = isTaskStatus(raw.status) ? raw.status : "offen";
  const archived =
    Boolean(raw.archived) || status === "abgeschlossen";
  const updates = Array.isArray(raw.updates)
    ? raw.updates
        .map((item) => normalizeTaskUpdate(item as Partial<TaskUpdate>))
        .filter((item): item is TaskUpdate => Boolean(item))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [];

  const technicianIds = Array.isArray(raw.technicianIds)
    ? raw.technicianIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0,
      )
    : [];

  return {
    id: raw.id,
    title,
    description: typeof raw.description === "string" ? raw.description : "",
    status: archived ? "abgeschlossen" : status,
    priority: isTaskPriority(raw.priority) ? raw.priority : "mittel",
    dueDate: normalizeIsoDate(raw.dueDate),
    absenceFrom: normalizeIsoDate(raw.absenceFrom),
    absenceTo: normalizeIsoDate(raw.absenceTo),
    reminderRhythm: isReminderRhythm(raw.reminderRhythm)
      ? raw.reminderRhythm
      : "none",
    notifyEmail: typeof raw.notifyEmail === "string" ? raw.notifyEmail.trim() : "",
    technicianIds,
    serviceLeitungNames: normalizeNameList(raw.serviceLeitungNames),
    updates,
    order: typeof raw.order === "number" && Number.isFinite(raw.order) ? raw.order : index,
    archived,
    createdAt:
      typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    updatedAt:
      typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
    completedAt:
      typeof raw.completedAt === "string"
        ? raw.completedAt
        : archived
          ? new Date().toISOString()
          : null,
    dueMailSentAt:
      typeof raw.dueMailSentAt === "string" ? raw.dueMailSentAt : null,
    lastReminderSentAt:
      typeof raw.lastReminderSentAt === "string" ? raw.lastReminderSentAt : null,
  };
}

export function createTaskUpdate(text: string): TaskUpdate {
  return {
    id: `taskup-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    text: text.trim(),
    createdAt: new Date().toISOString(),
  };
}

export function createTask(input: {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
  absenceFrom?: string | null;
  absenceTo?: string | null;
  reminderRhythm?: ReminderRhythm;
  notifyEmail?: string;
  technicianIds?: string[];
  serviceLeitungNames?: string[];
  updates?: TaskUpdate[];
  order?: number;
}): Task {
  const now = new Date().toISOString();
  const status = input.status ?? "offen";
  const archived = status === "abgeschlossen";
  return {
    id: `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title: input.title.trim(),
    description: input.description?.trim() ?? "",
    status: archived ? "abgeschlossen" : status,
    priority: input.priority ?? "mittel",
    dueDate: input.dueDate ?? null,
    absenceFrom: input.absenceFrom ?? null,
    absenceTo: input.absenceTo ?? null,
    reminderRhythm: input.reminderRhythm ?? "none",
    notifyEmail: input.notifyEmail?.trim() ?? "",
    technicianIds: input.technicianIds ?? [],
    serviceLeitungNames: input.serviceLeitungNames ?? [],
    updates: input.updates ?? [],
    order: input.order ?? Date.now(),
    archived,
    createdAt: now,
    updatedAt: now,
    completedAt: archived ? now : null,
    dueMailSentAt: null,
    lastReminderSentAt: null,
  };
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

export function applyTaskStatus(task: Task, status: TaskStatus): Task {
  const now = new Date().toISOString();
  if (status === "abgeschlossen") {
    return {
      ...task,
      status: "abgeschlossen",
      archived: true,
      completedAt: task.completedAt ?? now,
      updatedAt: now,
    };
  }
  return {
    ...task,
    status,
    archived: false,
    completedAt: null,
    updatedAt: now,
  };
}

export function kanbanColumnForTask(task: Task, today: string): TaskBoardColumn | "archiv" {
  if (task.archived || task.status === "abgeschlossen") return "archiv";
  if (task.dueDate === today && task.status === "offen") return "heute";
  if (task.status === "bearbeitung") return "bearbeitung";
  if (task.status === "warten") return "warten";
  if (task.status === "vertretung") return "vertretung";
  return "offen";
}

export function isTaskDroppableColumn(value: string): value is TaskDroppableColumn {
  return (TASK_DROPPABLE_COLUMNS as readonly string[]).includes(value);
}

export function applyKanbanDrop(
  task: Task,
  column: TaskDroppableColumn,
  today: string,
): Task {
  if (column === "heute") {
    return applyTaskStatus({ ...task, dueDate: today }, "offen");
  }
  if (column === "vertretung") {
    const start = task.absenceFrom ?? task.dueDate ?? today;
    const end = task.absenceTo ?? task.dueDate ?? today;
    return applyTaskStatus(
      {
        ...task,
        absenceFrom: start,
        absenceTo: end >= start ? end : start,
      },
      "vertretung",
    );
  }
  return applyTaskStatus(task, column);
}

export function shouldSendDueMail(task: Task, today: string): boolean {
  if (task.archived || task.status === "abgeschlossen") return false;
  if (!task.dueDate || !task.notifyEmail.includes("@")) return false;
  if (task.dueMailSentAt) return false;
  return task.dueDate <= today;
}

export function shouldSendRhythmMail(task: Task, today: string): boolean {
  if (task.archived || task.status === "abgeschlossen") return false;
  if (!task.notifyEmail.includes("@")) return false;
  const interval = REMINDER_RHYTHM_DAYS[task.reminderRhythm];
  if (interval == null) return false;

  // Erinnerungen starten ab Fälligkeit (oder sofort, wenn kein Datum gesetzt)
  if (task.dueDate && task.dueDate > today) return false;

  if (!task.lastReminderSentAt) return true;

  const lastDay = task.lastReminderSentAt.slice(0, 10);
  return daysBetween(lastDay, today) >= interval;
}
