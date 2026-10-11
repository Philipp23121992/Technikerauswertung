"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useEditAccess } from "@/components/EditAccessProvider";
import { useTracker } from "@/components/TrackerProvider";
import { AufgabenCsvImport } from "@/components/verwaltung/AufgabenCsvImport";
import { AufgabenMailImport } from "@/components/verwaltung/AufgabenMailImport";
import type { AufgabenCsvAnalysis } from "@/lib/aufgaben/csv-import";
import { isMailDragTypes, MAIL_IMPORT_MAX_FILES, type MailTaskDraft } from "@/lib/aufgaben/mail-drop";
import {
  applyKanbanDrop,
  applyTaskStatus,
  createTask,
  createTaskUpdate,
  formatDateTimeDe,
  isTaskDroppableColumn,
  kanbanColumnForTask,
  REMINDER_RHYTHM_LABELS,
  REMINDER_RHYTHMS,
  TASK_BOARD_COLUMN_LABELS,
  TASK_BOARD_COLUMNS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  todayIso,
  type ReminderRhythm,
  type Task,
  type TaskBoardColumn,
  type TaskDroppableColumn,
  type TaskPriority,
  type TaskStatus,
  type TaskUpdate,
} from "@/lib/aufgaben/types";
import {
  PROJECT_STATUS_LABELS,
  shortLastName,
  type Project,
} from "@/lib/projekte/types";
import {
  TRIP_STATUS_LABELS,
  tripDateRangeLabel,
  type BusinessTrip,
} from "@/lib/dienstreisen/types";
import { PARTNER_TECH_ID } from "@/lib/ticket-import";
import {
  SERVICELEITUNG_NAMES,
  vacationKindLabel,
  type UrlaubScope,
  type VacationKind,
  type VacationRequest,
} from "@/lib/urlaube/types";

type Tab = "aktiv" | "archiv";

type Draft = {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  absenceFrom: string;
  absenceTo: string;
  reminderRhythm: ReminderRhythm;
  notifyEmail: string;
  technicianIds: string[];
  serviceLeitungNames: string[];
};

type AbsenceEntry = {
  name: string;
  kind: VacationKind;
  note: string;
};

function emptyDraft(email: string): Draft {
  return {
    title: "",
    description: "",
    status: "offen",
    priority: "mittel",
    dueDate: "",
    absenceFrom: "",
    absenceTo: "",
    reminderRhythm: "none",
    notifyEmail: email,
    technicianIds: [],
    serviceLeitungNames: [],
  };
}

function taskToDraft(task: Task): Draft {
  return {
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate ?? "",
    absenceFrom: task.absenceFrom ?? "",
    absenceTo: task.absenceTo ?? "",
    reminderRhythm: task.reminderRhythm,
    notifyEmail: task.notifyEmail,
    technicianIds: task.technicianIds ?? [],
    serviceLeitungNames: task.serviceLeitungNames ?? [],
  };
}

function formatDateDe(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

function sortByOrder(tasks: Task[]): Task[] {
  return [...tasks].sort(
    (a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt),
  );
}

function guessEmail(user: { username: string; displayName: string } | null): string {
  if (!user) return "";
  if (user.username.includes("@")) return user.username;
  if (user.displayName.includes("@")) return user.displayName;
  return "";
}

function absencesOnDay(
  requests: VacationRequest[],
  scope: UrlaubScope,
  today: string,
): AbsenceEntry[] {
  const byName = new Map<string, AbsenceEntry>();
  for (const request of requests) {
    if (request.scope !== scope) continue;
    if (request.dateFrom > today || request.dateTo < today) continue;
    const key = request.applicantName.trim().toLowerCase();
    if (!key || byName.has(key)) continue;
    byName.set(key, {
      name: request.applicantName.trim(),
      kind: request.kind,
      note: request.note,
    });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
}

export function AufgabenPage() {
  const { user } = useAuth();
  const { canEdit } = useEditAccess();
  const { technicians } = useTracker();
  const defaultEmail = guessEmail(user);
  const today = todayIso();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [trips, setTrips] = useState<BusinessTrip[]>([]);
  const [vacations, setVacations] = useState<VacationRequest[]>([]);
  const [mailConfigured, setMailConfigured] = useState(false);
  const [tab, setTab] = useState<Tab>("aktiv");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(defaultEmail));
  const [updateDraft, setUpdateDraft] = useState("");
  const [draftUpdates, setDraftUpdates] = useState<TaskUpdate[]>([]);

  const [dragId, setDragId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<TaskDroppableColumn | null>(null);
  const [techMenuId, setTechMenuId] = useState<string | null>(null);
  const skipClickRef = useRef(false);
  const reminderBusy = useRef(false);
  const [mailOver, setMailOver] = useState(false);
  const [mailBusy, setMailBusy] = useState(false);

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
    async (nextTasks: Task[]) => {
      if (!canEdit) {
        setError(
          "Schreibzugriff gesperrt. Bitte freischalten oder mit Bearbeitungsrecht anmelden.",
        );
        return false;
      }
      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/aufgaben", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            tasks: nextTasks,
            technicians: selectableTechnicians.map((tech) => ({
              id: tech.id,
              name: tech.name,
            })),
          }),
        });
        const data = (await res.json().catch(() => null)) as {
          tasks?: Task[];
          mailConfigured?: boolean;
          vacationRequests?: VacationRequest[];
          vacationError?: string;
          error?: string;
        } | null;
        if (!res.ok) {
          throw new Error(data?.error || "Speichern fehlgeschlagen.");
        }
        setTasks(data?.tasks ?? nextTasks);
        if (typeof data?.mailConfigured === "boolean") {
          setMailConfigured(data.mailConfigured);
        }
        if (Array.isArray(data?.vacationRequests)) {
          setVacations(data.vacationRequests);
        }
        if (data?.vacationError) {
          setError(
            `Aufgabe gespeichert, Abwesenheit in Urlaube nicht: ${data.vacationError}`,
          );
        }
        return true;
      } catch (err) {
        const nextMessage =
          err instanceof TypeError && /fetch/i.test(err.message)
            ? "Netzwerkfehler beim Speichern (Server nicht erreichbar oder Verbindung abgebrochen). Bitte Seite neu laden und erneut versuchen."
            : err instanceof Error
              ? err.message
              : "Speichern fehlgeschlagen.";
        setError(nextMessage);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [canEdit, selectableTechnicians],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [taskRes, vacationRes, projectRes, tripRes] = await Promise.all([
        fetch("/api/aufgaben", { cache: "no-store", credentials: "same-origin" }),
        fetch("/api/urlaube", { cache: "no-store", credentials: "same-origin" }),
        fetch("/api/projekte", { cache: "no-store", credentials: "same-origin" }),
        fetch("/api/dienstreisen", { cache: "no-store", credentials: "same-origin" }),
      ]);
      const data = (await taskRes.json().catch(() => null)) as {
        tasks?: Task[];
        mailConfigured?: boolean;
        error?: string;
      } | null;
      if (!taskRes.ok) {
        throw new Error(data?.error || "Aufgaben konnten nicht geladen werden.");
      }
      setTasks(Array.isArray(data?.tasks) ? data.tasks : []);
      setMailConfigured(Boolean(data?.mailConfigured));

      if (vacationRes.ok) {
        const vacationData = (await vacationRes.json().catch(() => null)) as {
          requests?: VacationRequest[];
        } | null;
        setVacations(Array.isArray(vacationData?.requests) ? vacationData.requests : []);
      } else {
        setVacations([]);
      }

      if (projectRes.ok) {
        const projectData = (await projectRes.json().catch(() => null)) as {
          projects?: Project[];
        } | null;
        setProjects(Array.isArray(projectData?.projects) ? projectData.projects : []);
      } else {
        setProjects([]);
      }

      if (tripRes.ok) {
        const tripData = (await tripRes.json().catch(() => null)) as {
          trips?: BusinessTrip[];
        } | null;
        setTrips(Array.isArray(tripData?.trips) ? tripData.trips : []);
      } else {
        setTrips([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Laden fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }, []);

  const processReminders = useCallback(async () => {
    if (!canEdit || reminderBusy.current) return;
    reminderBusy.current = true;
    try {
      const res = await fetch("/api/aufgaben/process-reminders", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => null)) as {
        sent?: number;
        tasks?: Task[];
        mailConfigured?: boolean;
        errors?: string[];
      } | null;
      if (!res.ok) return;
      if (Array.isArray(data?.tasks)) setTasks(data.tasks);
      if (typeof data?.mailConfigured === "boolean") {
        setMailConfigured(data.mailConfigured);
      }
      if ((data?.sent ?? 0) > 0) {
        setMessage(`${data?.sent} Erinnerungs-Mail(s) versendet.`);
      }
      if (data?.errors?.length) {
        setError(data.errors.join(" · "));
      }
    } finally {
      reminderBusy.current = false;
    }
  }, [canEdit]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canEdit) return;
    void processReminders();
    const timer = window.setInterval(() => {
      void processReminders();
    }, 15 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [canEdit, processReminders]);

  useEffect(() => {
    if (!editorOpen && !editingId) {
      setDraft(emptyDraft(defaultEmail));
    }
  }, [defaultEmail, editorOpen, editingId]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".projekt-tech-menu-wrap")) return;
      setTechMenuId(null);
    }
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, []);

  const archivedTasks = useMemo(
    () => sortByOrder(tasks.filter((task) => task.archived)),
    [tasks],
  );

  const boardTasks = useMemo(() => {
    const groups: Record<TaskDroppableColumn, Task[]> = {
      heute: [],
      offen: [],
      bearbeitung: [],
      warten: [],
      vertretung: [],
    };
    for (const task of sortByOrder(tasks.filter((item) => !item.archived))) {
      const column = kanbanColumnForTask(task, today);
      if (column === "archiv") continue;
      if (column === "abwesend-techniker" || column === "abwesend-sl") continue;
      groups[column].push(task);
    }
    return groups;
  }, [tasks, today]);

  const technicianAbsences = useMemo(
    () => absencesOnDay(vacations, "techniker", today),
    [vacations, today],
  );
  const serviceAbsences = useMemo(
    () => absencesOnDay(vacations, "serviceleitung", today),
    [vacations, today],
  );

  const dueTodayProjects = useMemo(
    () =>
      projects.filter(
        (project) =>
          !project.archived &&
          project.status !== "abgeschlossen" &&
          project.dueDate === today,
      ),
    [projects, today],
  );
  const dueTodayTrips = useMemo(
    () => trips.filter((trip) => !trip.archived && trip.dueDate === today),
    [trips, today],
  );

  const editingTask = useMemo(
    () => (editingId ? tasks.find((task) => task.id === editingId) ?? null : null),
    [editingId, tasks],
  );

  const editorUpdates = editingTask?.updates ?? draftUpdates;

  function techNames(ids: string[]): string {
    return ids
      .map((id) => techById.get(id)?.name)
      .filter((name): name is string => Boolean(name))
      .map(shortLastName)
      .join(", ");
  }

  function personNames(task: {
    technicianIds?: string[];
    serviceLeitungNames?: string[];
  }): string {
    const tech = techNames(task.technicianIds ?? []);
    const sl = (task.serviceLeitungNames ?? []).map(shortLastName).join(", ");
    return [tech, sl].filter(Boolean).join(", ");
  }

  function openCreate() {
    if (!canEdit) {
      setError("Schreibzugriff gesperrt.");
      return;
    }
    setEditingId(null);
    setDraft(emptyDraft(defaultEmail));
    setUpdateDraft("");
    setDraftUpdates([]);
    setEditorOpen(true);
    setMessage(null);
  }

  function openEdit(task: Task) {
    if (skipClickRef.current) {
      skipClickRef.current = false;
      return;
    }
    setEditingId(task.id);
    setDraft(taskToDraft(task));
    setUpdateDraft("");
    setDraftUpdates([]);
    setEditorOpen(true);
    setMessage(null);
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditingId(null);
    setUpdateDraft("");
    setDraftUpdates([]);
  }

  async function saveEditor() {
    const title = draft.title.trim();
    if (!title) {
      setError("Titel ist erforderlich.");
      return;
    }

    const isVertretung = draft.status === "vertretung";
    const absenceFrom = draft.absenceFrom || "";
    const absenceTo = draft.absenceTo || "";
    if (isVertretung) {
      if (!absenceFrom || !absenceTo) {
        setError("Für Vertretungen bitte Von- und Bis-Datum angeben.");
        return;
      }
      if (absenceTo < absenceFrom) {
        setError("Das Bis-Datum darf nicht vor dem Von-Datum liegen.");
        return;
      }
      if (draft.technicianIds.length === 0 && draft.serviceLeitungNames.length === 0) {
        setError(
          "Bitte mindestens einen Techniker oder jemanden aus der Serviceleitung auswählen.",
        );
        return;
      }
    }

    const now = new Date().toISOString();
    const dueDate = draft.dueDate || (isVertretung ? absenceFrom : "") || null;
    let nextTasks: Task[];

    if (editingId) {
      nextTasks = tasks.map((task) => {
        if (task.id !== editingId) return task;
        const withFields: Task = {
          ...task,
          title,
          description: draft.description.trim(),
          priority: draft.priority,
          dueDate,
          absenceFrom: isVertretung ? absenceFrom : task.absenceFrom,
          absenceTo: isVertretung ? absenceTo : task.absenceTo,
          reminderRhythm: draft.reminderRhythm,
          notifyEmail: draft.notifyEmail.trim() || defaultEmail,
          technicianIds: draft.technicianIds,
          serviceLeitungNames: draft.serviceLeitungNames,
          updatedAt: now,
          dueMailSentAt: dueDate !== task.dueDate ? null : task.dueMailSentAt,
        };
        return applyTaskStatus(withFields, draft.status);
      });
    } else {
      const maxOrder = tasks.reduce((max, task) => Math.max(max, task.order), 0);
      const created = createTask({
        title,
        description: draft.description,
        status: draft.status,
        priority: draft.priority,
        dueDate,
        absenceFrom: isVertretung ? absenceFrom : null,
        absenceTo: isVertretung ? absenceTo : null,
        reminderRhythm: draft.reminderRhythm,
        notifyEmail: draft.notifyEmail.trim() || defaultEmail,
        technicianIds: draft.technicianIds,
        serviceLeitungNames: draft.serviceLeitungNames,
        updates: draftUpdates,
        order: maxOrder + 1,
      });
      nextTasks = [...tasks, applyTaskStatus(created, draft.status)];
    }

    const ok = await persist(nextTasks);
    if (ok) {
      setMessage(
        isVertretung
          ? editingId
            ? "Aufgabe gespeichert. Abwesenheit in Urlaube aktualisiert."
            : "Aufgabe angelegt. Abwesenheit in Urlaube eingetragen."
          : editingId
            ? "Aufgabe gespeichert."
            : "Aufgabe angelegt.",
      );
      closeEditor();
    }
  }

  async function addUpdate() {
    if (!canEdit) return;
    const text = updateDraft.trim();
    if (!text) {
      setError("Update-Text ist erforderlich.");
      return;
    }
    const entry = createTaskUpdate(text);

    if (!editingId) {
      setDraftUpdates((current) => [entry, ...current]);
      setUpdateDraft("");
      setMessage("Update vorgemerkt – wird mit der Aufgabe gespeichert.");
      return;
    }

    const now = new Date().toISOString();
    const nextTasks = tasks.map((task) =>
      task.id === editingId
        ? {
            ...task,
            updates: [entry, ...(task.updates ?? [])],
            updatedAt: now,
          }
        : task,
    );
    const ok = await persist(nextTasks);
    if (ok) {
      setUpdateDraft("");
      setMessage("Update gespeichert.");
    }
  }

  async function removeUpdate(updateId: string) {
    if (!canEdit) return;

    if (!editingId) {
      setDraftUpdates((current) => current.filter((entry) => entry.id !== updateId));
      return;
    }

    const now = new Date().toISOString();
    const nextTasks = tasks.map((task) =>
      task.id === editingId
        ? {
            ...task,
            updates: (task.updates ?? []).filter((entry) => entry.id !== updateId),
            updatedAt: now,
          }
        : task,
    );
    await persist(nextTasks);
  }

  async function deleteTask(id: string) {
    if (!canEdit) return;
    if (!window.confirm("Aufgabe wirklich löschen?")) return;
    const ok = await persist(tasks.filter((task) => task.id !== id));
    if (ok) {
      setMessage("Aufgabe gelöscht.");
      if (editingId === id) closeEditor();
    }
  }

  async function restoreTask(id: string) {
    const next = tasks.map((task) =>
      task.id === id ? applyTaskStatus(task, "offen") : task,
    );
    const ok = await persist(next);
    if (ok) setMessage("Aufgabe wiederhergestellt.");
  }

  async function toggleTechnician(taskId: string, technicianId: string) {
    if (!canEdit) return;
    const now = new Date().toISOString();
    const next = tasks.map((task) => {
      if (task.id !== taskId) return task;
      const has = (task.technicianIds ?? []).includes(technicianId);
      return {
        ...task,
        technicianIds: has
          ? task.technicianIds.filter((id) => id !== technicianId)
          : [...(task.technicianIds ?? []), technicianId],
        updatedAt: now,
      };
    });
    await persist(next);
  }

  async function toggleServiceLeitung(taskId: string, name: string) {
    if (!canEdit) return;
    const now = new Date().toISOString();
    const next = tasks.map((task) => {
      if (task.id !== taskId) return task;
      const current = task.serviceLeitungNames ?? [];
      const has = current.includes(name);
      return {
        ...task,
        serviceLeitungNames: has
          ? current.filter((item) => item !== name)
          : [...current, name],
        updatedAt: now,
      };
    });
    await persist(next);
  }

  function onDragStart(id: string) {
    if (!canEdit) return;
    setDragId(id);
  }

  async function onDropOnColumn(column: TaskBoardColumn) {
    if (!canEdit || !dragId || !isTaskDroppableColumn(column)) {
      setDragId(null);
      setOverColumn(null);
      return;
    }
    const task = tasks.find((item) => item.id === dragId);
    if (!task || task.archived) {
      setDragId(null);
      setOverColumn(null);
      return;
    }
    const current = kanbanColumnForTask(task, today);
    if (current === column) {
      setDragId(null);
      setOverColumn(null);
      return;
    }
    skipClickRef.current = true;
    const moved = applyKanbanDrop(task, column, today);
    setDragId(null);
    setOverColumn(null);
    const ok = await persist(
      tasks.map((item) => (item.id === moved.id ? moved : item)),
    );
    if (ok) {
      if (moved.archived) {
        setMessage("Aufgabe ins Archiv verschoben.");
      } else {
        setMessage(`Status: ${TASK_BOARD_COLUMN_LABELS[column]}.`);
      }
    }
  }

  async function importFromAnalysis(analysis: AufgabenCsvAnalysis) {
    const minOrder = tasks.reduce(
      (min, task) => Math.min(min, task.order),
      Date.now(),
    );
    const created = analysis.ready.map((row, index) =>
      createTask({
        title: row.title,
        description: row.description,
        status: row.status,
        priority: row.priority,
        dueDate: row.dueDate,
        reminderRhythm: row.reminderRhythm,
        notifyEmail: row.notifyEmail,
        order: minOrder - analysis.ready.length + index,
      }),
    );
    const ok = await persist([...created, ...tasks]);
    if (ok) {
      setMessage(`${created.length} Aufgaben importiert.`);
      setTab(created.every((task) => task.archived) ? "archiv" : "aktiv");
    }
    return ok;
  }

  async function createTasksFromMailDrafts(drafts: MailTaskDraft[]) {
    if (!drafts.length) return;
    const minOrder = tasks.reduce((min, task) => Math.min(min, task.order), Date.now());
    const created = drafts.map((draft, index) =>
      createTask({
        title: draft.title,
        description: draft.description,
        status: "offen",
        priority: draft.priority,
        dueDate: draft.dueDate,
        notifyEmail: defaultEmail,
        order: minOrder - drafts.length + index,
      }),
    );
    const ok = await persist([...created, ...tasks]);
    if (!ok) return;
    setTab("aktiv");
    setMessage(
      created.length === 1
        ? "Aufgabe aus E-Mail angelegt."
        : `${created.length} Aufgaben aus E-Mails angelegt.`,
    );
    openEdit(created[0]);
  }

  function filesFromDataTransfer(dt: DataTransfer): File[] {
    const listed = [...dt.files];
    if (listed.length) return listed;
    const fromItems: File[] = [];
    for (const item of dt.items) {
      if (item.kind !== "file") continue;
      const file = item.getAsFile();
      if (file) fromItems.push(file);
    }
    return fromItems;
  }

  async function importMailFiles(files: File[]) {
    if (!canEdit || mailBusy || saving) return;
    const usable = files.slice(0, MAIL_IMPORT_MAX_FILES);
    if (!usable.length) {
      setError("Bitte eine E-Mail (.eml oder .msg) ablegen.");
      return;
    }
    setMailBusy(true);
    setError(null);
    try {
      const form = new FormData();
      for (const file of usable) form.append("files", file);
      const res = await fetch("/api/aufgaben/from-mail", {
        method: "POST",
        credentials: "same-origin",
        body: form,
      });
      const data = (await res.json().catch(() => null)) as {
        drafts?: MailTaskDraft[];
        error?: string;
      } | null;
      if (!res.ok || !data?.drafts?.length) {
        throw new Error(data?.error || "Die Mail konnte nicht gelesen werden.");
      }
      await createTasksFromMailDrafts(data.drafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Die Mail konnte nicht gelesen werden.");
    } finally {
      setMailBusy(false);
      setMailOver(false);
    }
  }

  async function importMailText(text: string, html: string) {
    if (!canEdit || mailBusy || saving) return;
    const trimmed = text.trim() || html.trim();
    if (!trimmed) {
      setError("In der abgelegten Mail war kein Text.");
      return;
    }
    setMailBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/aufgaben/from-mail", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, html, fileName: "Outlook" }),
      });
      const data = (await res.json().catch(() => null)) as {
        drafts?: MailTaskDraft[];
        error?: string;
      } | null;
      if (!res.ok || !data?.drafts?.length) {
        throw new Error(data?.error || "Die Mail konnte nicht gelesen werden.");
      }
      await createTasksFromMailDrafts(data.drafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Die Mail konnte nicht gelesen werden.");
    } finally {
      setMailBusy(false);
      setMailOver(false);
    }
  }

  function onMailDragOver(event: DragEvent) {
    if (!canEdit || dragId) return;
    if (!isMailDragTypes([...event.dataTransfer.types])) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setMailOver(true);
  }

  function onMailDrop(event: DragEvent) {
    if (!canEdit || dragId) return;
    if (!isMailDragTypes([...event.dataTransfer.types]) && !event.dataTransfer.files.length) return;
    event.preventDefault();
    event.stopPropagation();
    setMailOver(false);
    const files = filesFromDataTransfer(event.dataTransfer);
    if (files.length) {
      void importMailFiles(files);
      return;
    }
    const text = event.dataTransfer.getData("text/plain");
    const html = event.dataTransfer.getData("text/html");
    void importMailText(text, html);
  }

  function renderTaskCard(task: Task) {
    const names = personNames(task);
    const showSlPicker = task.status === "vertretung";
    return (
      <article
        key={task.id}
        className={`aufgaben-card prio-${task.priority} ${dragId === task.id ? "is-dragging" : ""}`}
        draggable={canEdit}
        onDragStart={() => onDragStart(task.id)}
        onDragEnd={() => {
          setDragId(null);
          setOverColumn(null);
        }}
      >
        <button
          type="button"
          className="aufgaben-card-main"
          onClick={() => openEdit(task)}
        >
          <span className="aufgaben-item-title">{task.title}</span>
          <span className="aufgaben-item-meta">
            <span className={`aufgaben-pill status-${task.status}`}>
              {TASK_STATUS_LABELS[task.status]}
            </span>
            <span className={`aufgaben-pill prio-${task.priority}`}>
              {TASK_PRIORITY_LABELS[task.priority]}
            </span>
            <span>Fällig {formatDateDe(task.dueDate)}</span>
            {task.status === "vertretung" && task.absenceFrom && task.absenceTo ? (
              <span>
                Abwesend {formatDateDe(task.absenceFrom)} – {formatDateDe(task.absenceTo)}
              </span>
            ) : null}
            {task.updates?.length > 0 ? (
              <span>
                {task.updates.length} Update
                {task.updates.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </span>
          {task.description ? (
            <span className="aufgaben-item-desc">{task.description}</span>
          ) : null}
        </button>
        <div
          className="projekt-tech-menu-wrap aufgaben-card-tech"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="projekt-tech-btn"
            disabled={!canEdit || saving}
            onClick={() =>
              setTechMenuId((current) => (current === task.id ? null : task.id))
            }
          >
            {names || (showSlPicker ? "Personen wählen" : "Techniker wählen")}
          </button>
          {techMenuId === task.id ? (
            <div className="projekt-tech-menu">
              <p className="projekt-tech-menu-group">Techniker</p>
              {selectableTechnicians.length === 0 ? (
                <p className="muted-meta">Keine Techniker in der Datenbank.</p>
              ) : (
                selectableTechnicians.map((tech) => {
                  const checked = (task.technicianIds ?? []).includes(tech.id);
                  return (
                    <label key={tech.id}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => void toggleTechnician(task.id, tech.id)}
                      />
                      <span>{tech.name}</span>
                    </label>
                  );
                })
              )}
              {showSlPicker ? (
                <>
                  <p className="projekt-tech-menu-group">Serviceleitung</p>
                  {SERVICELEITUNG_NAMES.map((name) => {
                    const checked = (task.serviceLeitungNames ?? []).includes(name);
                    return (
                      <label key={name}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => void toggleServiceLeitung(task.id, name)}
                        />
                        <span>{name}</span>
                      </label>
                    );
                  })}
                </>
              ) : null}
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

  function renderAbsenceCard(entry: AbsenceEntry) {
    return (
      <div key={entry.name} className="aufgaben-absence-card">
        <strong>{entry.name}</strong>
        <span>{vacationKindLabel(entry.kind)}</span>
        {entry.note ? <span className="aufgaben-item-desc">{entry.note}</span> : null}
      </div>
    );
  }

  function renderProjectCard(project: Project) {
    const names = techNames(project.technicianIds ?? []);
    return (
      <Link
        key={`project-${project.id}`}
        href={`/verwaltung/projekte?id=${encodeURIComponent(project.id)}`}
        className="aufgaben-card aufgaben-linked-card is-project"
      >
        <span className="aufgaben-item-title">{project.title}</span>
        <span className="aufgaben-item-meta">
          <span className="aufgaben-pill kind-project">Projekt</span>
          <span className="aufgaben-pill">{PROJECT_STATUS_LABELS[project.status]}</span>
          <span>Fällig {formatDateDe(project.dueDate)}</span>
          {names ? <span>{names}</span> : null}
        </span>
      </Link>
    );
  }

  function renderTripCard(trip: BusinessTrip) {
    const range = tripDateRangeLabel(trip);
    return (
      <Link
        key={`trip-${trip.id}`}
        href={`/verwaltung/dienstreisen?id=${encodeURIComponent(trip.id)}`}
        className="aufgaben-card aufgaben-linked-card is-trip"
      >
        <span className="aufgaben-item-title">{trip.title}</span>
        <span className="aufgaben-item-meta">
          <span className="aufgaben-pill kind-trip">Dienstreise</span>
          <span className="aufgaben-pill">{TRIP_STATUS_LABELS[trip.status]}</span>
          <span>Fällig {formatDateDe(trip.dueDate)}</span>
          {trip.traveler ? <span>{trip.traveler}</span> : null}
          {range !== "Kein Zeitraum" ? <span>{range}</span> : null}
        </span>
      </Link>
    );
  }

  return (
    <div
      className={`page-panel aufgaben-page ${mailOver ? "is-mail-over" : ""}`}
      onDragEnter={onMailDragOver}
      onDragOver={onMailDragOver}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setMailOver(false);
      }}
      onDrop={onMailDrop}
    >
      {mailOver || mailBusy ? (
        <div className={`aufgaben-mail-overlay ${mailBusy ? "is-busy" : ""}`} role="status">
          {mailBusy ? "Mail wird gelesen…" : "E-Mail loslassen, um eine Aufgabe anzulegen"}
        </div>
      ) : null}
      <header className="section-header">
        <div>
          <h1>Aufgaben</h1>
          <p>
            Kanban nach Status – Drag &amp; Drop ändert den Status. E-Mails aus Outlook oder als
            .eml/.msg ablegen, um eine Aufgabe zu erstellen.
          </p>
        </div>
        <div className="aufgaben-header-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={openCreate}
            disabled={!canEdit || saving}
          >
            Neue Aufgabe
          </button>
          <AufgabenCsvImport
            canEdit={canEdit}
            saving={saving}
            existing={tasks}
            defaultEmail={defaultEmail}
            onConfirm={importFromAnalysis}
          />
          <AufgabenMailImport
            canEdit={canEdit}
            busy={saving || mailBusy}
            onPick={importMailFiles}
          />
        </div>
      </header>

      <div className="toolbar-row aufgaben-toolbar">
        <div className="soft-tabs" role="tablist" aria-label="Aufgaben-Ansicht">
          <button
            type="button"
            className={`soft-tab ${tab === "aktiv" ? "is-active" : ""}`}
            onClick={() => setTab("aktiv")}
          >
            Board ({tasks.filter((item) => !item.archived).length})
          </button>
          <button
            type="button"
            className={`soft-tab ${tab === "archiv" ? "is-active" : ""}`}
            onClick={() => setTab("archiv")}
          >
            Archiv ({tasks.filter((item) => item.archived).length})
          </button>
        </div>
        <span className="muted-meta">Heute {formatDateDe(today)}</span>
      </div>

      {!mailConfigured ? (
        <p className="aufgaben-mail-hint">
          SMTP ist noch nicht eingerichtet – Fälligkeits-Mails gehen erst raus, wenn unter{" "}
          <Link href="/einstellungen/smtp">Einstellung → E-Mail / SMTP</Link> konfiguriert.
        </p>
      ) : (
        <p className="aufgaben-mail-hint is-ok">
          Erinnerungen werden im Hintergrund geprüft, sobald jemand angemeldet ist (alle 15 Min.).
        </p>
      )}

      {error ? <p className="aufgaben-banner is-error">{error}</p> : null}
      {message ? <p className="aufgaben-banner is-ok">{message}</p> : null}

      {loading ? (
        <p className="muted-meta">Lade Aufgaben…</p>
      ) : tab === "archiv" ? (
        archivedTasks.length === 0 ? (
          <section className="content-card">
            <p className="muted-meta">Noch keine abgeschlossenen Aufgaben im Archiv.</p>
          </section>
        ) : (
          <ul className="aufgaben-list">
            {archivedTasks.map((task) => (
              <li key={task.id} className={`aufgaben-item prio-${task.priority}`}>
                <button
                  type="button"
                  className="aufgaben-item-main"
                  onClick={() => openEdit(task)}
                >
                  <span className="aufgaben-item-title">{task.title}</span>
                  <span className="aufgaben-item-meta">
                    <span className="aufgaben-pill status-abgeschlossen">
                      Abgeschlossen
                    </span>
                    <span>Fällig {formatDateDe(task.dueDate)}</span>
                    {techNames(task.technicianIds ?? []) ? (
                      <span>{techNames(task.technicianIds ?? [])}</span>
                    ) : null}
                  </span>
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={!canEdit || saving}
                  onClick={() => void restoreTask(task.id)}
                >
                  Wiederherstellen
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="aufgaben-kanban" role="list">
          {TASK_BOARD_COLUMNS.map((column) => {
            const droppable = isTaskDroppableColumn(column);
            const tasksInColumn = droppable ? boardTasks[column] : [];
            const absences =
              column === "abwesend-techniker"
                ? technicianAbsences
                : column === "abwesend-sl"
                  ? serviceAbsences
                  : [];
            const linkedToday =
              column === "heute"
                ? dueTodayProjects.length + dueTodayTrips.length
                : 0;
            const count = droppable
              ? tasksInColumn.length + linkedToday
              : absences.length;
            return (
              <section
                key={column}
                className={`aufgaben-kanban-col ${overColumn === column ? "is-over" : ""} ${droppable ? "" : "is-info"}`}
                onDragOver={(event) => {
                  if (!canEdit) return;
                  if (!dragId && isMailDragTypes([...event.dataTransfer.types])) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "copy";
                    setMailOver(true);
                    setOverColumn(null);
                    return;
                  }
                  if (!droppable) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setOverColumn(column);
                }}
                onDragLeave={() => {
                  setOverColumn((current) => (current === column ? null : current));
                }}
                onDrop={(event) => {
                  if (!dragId && isMailDragTypes([...event.dataTransfer.types])) {
                    onMailDrop(event);
                    return;
                  }
                  event.preventDefault();
                  void onDropOnColumn(column);
                }}
              >
                <header>
                  <h2>{TASK_BOARD_COLUMN_LABELS[column]}</h2>
                  <span>{count}</span>
                </header>
                {column === "heute" ? (
                  <p className="muted-meta">
                    Aufgaben, Projekte und Dienstreisen mit Fälligkeit heute
                  </p>
                ) : null}
                {column === "abwesend-techniker" ? (
                  <p className="muted-meta">Namen aus Urlaube Techniker</p>
                ) : null}
                {column === "abwesend-sl" ? (
                  <p className="muted-meta">Namen aus Urlaube Serviceleitung</p>
                ) : null}
                <div className="aufgaben-kanban-list">
                  {droppable
                    ? column === "heute"
                      ? tasksInColumn.length === 0 &&
                        dueTodayProjects.length === 0 &&
                        dueTodayTrips.length === 0
                        ? (
                            <p className="muted-meta">Keine Einträge</p>
                          )
                        : (
                            <>
                              {tasksInColumn.map(renderTaskCard)}
                              {dueTodayProjects.map(renderProjectCard)}
                              {dueTodayTrips.map(renderTripCard)}
                            </>
                          )
                      : tasksInColumn.length === 0
                        ? (
                            <p className="muted-meta">Keine Aufgaben</p>
                          )
                        : tasksInColumn.map(renderTaskCard)
                    : absences.length === 0
                      ? (
                          <p className="muted-meta">Heute niemand abwesend</p>
                        )
                      : absences.map(renderAbsenceCard)}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {editorOpen ? (
        <div className="aufgaben-modal-backdrop" role="presentation" onClick={closeEditor}>
          <div
            className="aufgaben-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="aufgaben-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="aufgaben-modal-head">
              <h2 id="aufgaben-modal-title">
                {editingId ? "Aufgabe bearbeiten" : "Neue Aufgabe"}
              </h2>
              <button type="button" className="btn btn-ghost" onClick={closeEditor}>
                Schließen
              </button>
            </header>

            <div className="aufgaben-form">
              <label>
                <span>Titel</span>
                <input
                  value={draft.title}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, title: event.target.value }))
                  }
                  disabled={!canEdit}
                  autoFocus
                />
              </label>

              <label className="full">
                <span>Beschreibung</span>
                <textarea
                  rows={4}
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  disabled={!canEdit}
                />
              </label>

              <label>
                <span>Status</span>
                <select
                  value={draft.status}
                  onChange={(event) => {
                    const status = event.target.value as TaskStatus;
                    setDraft((current) => {
                      if (status !== "vertretung") {
                        return { ...current, status };
                      }
                      const start = current.absenceFrom || current.dueDate || today;
                      const end = current.absenceTo || current.dueDate || today;
                      return {
                        ...current,
                        status,
                        absenceFrom: start,
                        absenceTo: end >= start ? end : start,
                      };
                    });
                  }}
                  disabled={!canEdit}
                >
                  {TASK_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {TASK_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Priorität</span>
                <select
                  value={draft.priority}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      priority: event.target.value as TaskPriority,
                    }))
                  }
                  disabled={!canEdit}
                >
                  {TASK_PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {TASK_PRIORITY_LABELS[priority]}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Fälligkeitsdatum</span>
                <input
                  type="date"
                  value={draft.dueDate}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, dueDate: event.target.value }))
                  }
                  disabled={!canEdit}
                />
              </label>

              <label>
                <span>Erinnerungsrhythmus</span>
                <select
                  value={draft.reminderRhythm}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      reminderRhythm: event.target.value as ReminderRhythm,
                    }))
                  }
                  disabled={!canEdit}
                >
                  {REMINDER_RHYTHMS.map((rhythm) => (
                    <option key={rhythm} value={rhythm}>
                      {REMINDER_RHYTHM_LABELS[rhythm]}
                    </option>
                  ))}
                </select>
              </label>

              {draft.status === "vertretung" ? (
                <>
                  <label>
                    <span>Abwesenheit von</span>
                    <input
                      type="date"
                      value={draft.absenceFrom}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          absenceFrom: event.target.value,
                          dueDate: current.dueDate || event.target.value,
                        }))
                      }
                      disabled={!canEdit}
                    />
                  </label>
                  <label>
                    <span>Abwesenheit bis</span>
                    <input
                      type="date"
                      value={draft.absenceTo}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          absenceTo: event.target.value,
                        }))
                      }
                      disabled={!canEdit}
                    />
                  </label>
                  <p className="aufgaben-absence-hint">
                    Das Von–Bis-Datum wird als Abwesenheit in Urlaube Techniker bzw.
                    Urlaube Serviceleitung eingetragen – je nach ausgewählten Namen.
                  </p>
                </>
              ) : null}

              <label className="full">
                <span>{draft.status === "vertretung" ? "Personen für Abwesenheit" : "Techniker"}</span>
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
                    {personNames(draft) ||
                      (draft.status === "vertretung"
                        ? "Techniker oder Serviceleitung wählen"
                        : "Techniker wählen")}
                  </button>
                  {techMenuId === "editor" ? (
                    <div className="projekt-tech-menu">
                      <p className="projekt-tech-menu-group">Techniker</p>
                      {selectableTechnicians.map((tech) => {
                        const checked = draft.technicianIds.includes(tech.id);
                        return (
                          <label key={tech.id}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setDraft((current) => ({
                                  ...current,
                                  technicianIds: checked
                                    ? current.technicianIds.filter((id) => id !== tech.id)
                                    : [...current.technicianIds, tech.id],
                                }))
                              }
                            />
                            <span>{tech.name}</span>
                          </label>
                        );
                      })}
                      {draft.status === "vertretung" ? (
                        <>
                          <p className="projekt-tech-menu-group">Serviceleitung</p>
                          {SERVICELEITUNG_NAMES.map((name) => {
                            const checked = draft.serviceLeitungNames.includes(name);
                            return (
                              <label key={name}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    setDraft((current) => ({
                                      ...current,
                                      serviceLeitungNames: checked
                                        ? current.serviceLeitungNames.filter(
                                            (item) => item !== name,
                                          )
                                        : [...current.serviceLeitungNames, name],
                                    }))
                                  }
                                />
                                <span>{name}</span>
                              </label>
                            );
                          })}
                        </>
                      ) : null}
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

              <label className="full">
                <span>E-Mail für Erinnerungen</span>
                <input
                  type="email"
                  value={draft.notifyEmail}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      notifyEmail: event.target.value,
                    }))
                  }
                  disabled={!canEdit}
                  placeholder="name@firma.de"
                />
              </label>

              <section className="aufgaben-updates full">
                <div className="aufgaben-updates-head">
                  <h3>Updates</h3>
                  <span className="muted-meta">
                    {editorUpdates.length} Einträg
                    {editorUpdates.length === 1 ? "" : "e"}
                  </span>
                </div>

                <div className="aufgaben-update-compose">
                  <textarea
                    rows={3}
                    placeholder="Update zur Aufgabe schreiben…"
                    value={updateDraft}
                    disabled={!canEdit || saving}
                    onChange={(event) => setUpdateDraft(event.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={!canEdit || saving || !updateDraft.trim()}
                    onClick={() => void addUpdate()}
                  >
                    {editingId ? "Update speichern" : "Update vormerken"}
                  </button>
                </div>

                {editorUpdates.length === 0 ? (
                  <p className="muted-meta">Noch keine Updates.</p>
                ) : (
                  <ul className="aufgaben-update-list">
                    {editorUpdates.map((entry) => (
                      <li key={entry.id}>
                        <div className="aufgaben-update-meta">
                          <span>{formatDateTimeDe(entry.createdAt)}</span>
                        </div>
                        <p>{entry.text}</p>
                        {canEdit ? (
                          <button
                            type="button"
                            className="aufgaben-update-remove"
                            disabled={saving}
                            onClick={() => void removeUpdate(entry.id)}
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

            <footer className="aufgaben-modal-foot">
              {editingId ? (
                <button
                  type="button"
                  className="btn btn-link-danger"
                  disabled={!canEdit || saving}
                  onClick={() => void deleteTask(editingId)}
                >
                  Löschen
                </button>
              ) : (
                <span />
              )}
              <div className="aufgaben-modal-foot-actions">
                <button type="button" className="btn btn-ghost" onClick={closeEditor}>
                  Abbrechen
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!canEdit || saving}
                  onClick={() => void saveEditor()}
                >
                  {saving ? "Speichern…" : "Speichern"}
                </button>
              </div>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
