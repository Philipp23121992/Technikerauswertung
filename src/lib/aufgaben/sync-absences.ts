import { promises as fs } from "fs";
import { createId } from "@/lib/id";
import { TRACKER_DB_PATH, TRACKER_SNAPSHOT_PATH } from "@/lib/local-backup";
import type { Task } from "@/lib/aufgaben/types";
import { readUrlaubeDb, writeUrlaubeDb } from "@/lib/urlaube/db";
import {
  NO_REPRESENTATIVE,
  normalizeVacationRequest,
  type UrlaubScope,
  type VacationRequest,
} from "@/lib/urlaube/types";

export type TechnicianDirectoryEntry = {
  id: string;
  name: string;
};

function personKey(name: string): string {
  return name.trim().toLowerCase();
}

function collectTechnicianNames(raw: unknown, map: Map<string, string>) {
  if (!raw || typeof raw !== "object") return;
  const obj = raw as {
    state?: { technicians?: TechnicianDirectoryEntry[] };
    technicians?: TechnicianDirectoryEntry[];
  };
  const list = obj.state?.technicians ?? obj.technicians ?? [];
  for (const tech of list) {
    if (!tech?.id || typeof tech.name !== "string") continue;
    const name = tech.name.trim();
    if (name) map.set(tech.id, name);
  }
}

export async function loadTechnicianNameMap(
  fromClient?: TechnicianDirectoryEntry[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const filePath of [TRACKER_DB_PATH, TRACKER_SNAPSHOT_PATH]) {
    try {
      collectTechnicianNames(JSON.parse(await fs.readFile(filePath, "utf8")), map);
    } catch {
      // Datei fehlt oder ist kein gültiges JSON – Client-Liste reicht.
    }
  }
  for (const tech of fromClient ?? []) {
    if (!tech?.id || typeof tech.name !== "string") continue;
    const name = tech.name.trim();
    if (name) map.set(tech.id, name);
  }
  return map;
}

function absencePeople(
  task: Task,
  nameByTechnicianId: Map<string, string>,
): Array<{ name: string; scope: UrlaubScope }> {
  const people: Array<{ name: string; scope: UrlaubScope }> = [];
  const seen = new Set<string>();

  function add(name: string, scope: UrlaubScope) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const key = `${scope}:${personKey(trimmed)}`;
    if (seen.has(key)) return;
    seen.add(key);
    people.push({ name: trimmed, scope });
  }

  for (const id of task.technicianIds ?? []) {
    const name = nameByTechnicianId.get(id);
    if (name) add(name, "techniker");
  }
  for (const name of task.serviceLeitungNames ?? []) {
    add(name, "serviceleitung");
  }
  return people;
}

export function syncVertretungAbsences(
  tasks: Task[],
  existing: VacationRequest[],
  nameByTechnicianId: Map<string, string>,
): VacationRequest[] {
  const keep = existing.filter((request) => !request.sourceTaskId);
  const previous = new Map<string, VacationRequest>();
  for (const request of existing) {
    if (!request.sourceTaskId) continue;
    previous.set(
      `${request.sourceTaskId}::${request.scope}::${personKey(request.applicantName)}`,
      request,
    );
  }

  const fromTasks: VacationRequest[] = [];
  const now = new Date().toISOString();

  for (const task of tasks) {
    if (task.archived || task.status !== "vertretung") continue;
    if (!task.absenceFrom || !task.absenceTo || task.absenceTo < task.absenceFrom) {
      continue;
    }

    for (const person of absencePeople(task, nameByTechnicianId)) {
      const key = `${task.id}::${person.scope}::${personKey(person.name)}`;
      const prev = previous.get(key);
      const normalized = normalizeVacationRequest({
        id: prev?.id ?? createId("url"),
        scope: person.scope,
        dateFrom: task.absenceFrom,
        dateTo: task.absenceTo,
        applicantName: person.name,
        representativeName: prev?.representativeName || NO_REPRESENTATIVE,
        kind: "abwesend",
        note: task.title,
        sourceTaskId: task.id,
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
      });
      if (normalized) fromTasks.push(normalized);
    }
  }

  return [...keep, ...fromTasks];
}

export async function persistVertretungAbsences(
  tasks: Task[],
  fromClient?: TechnicianDirectoryEntry[],
): Promise<VacationRequest[]> {
  const names = await loadTechnicianNameMap(fromClient);
  const db = await readUrlaubeDb();
  const requests = syncVertretungAbsences(tasks, db.requests, names);
  const saved = await writeUrlaubeDb({ version: 1, requests });
  return saved.requests;
}
