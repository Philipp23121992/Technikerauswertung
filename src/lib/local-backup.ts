import { promises as fs } from "fs";
import path from "path";
import { TRACKER_STORAGE_KEY, parseTrackerState } from "@/lib/tracker";
import type { TrackerState } from "@/lib/tracker-types";
import { readUrlaubeDb } from "@/lib/urlaube/db";
import type { UrlaubeDb } from "@/lib/urlaube/types";
import {
  createEmptyStore,
  meetingStoreFreshness,
  pickNewerMeetingStore,
  type MeetingKind,
  type MeetingStoreState,
} from "@/lib/meetings/types";
import {
  createEmptyMeetingTechnicians,
  type MeetingTechniciansState,
} from "@/lib/meetings/technicians";

const DATA_DIR = path.join(process.cwd(), "data");
const PUBLIC_DATA_DIR = path.join(process.cwd(), "public", "data");

export const TRACKER_DB_PATH = path.join(DATA_DIR, "tracker-db.json");
export const TRACKER_SNAPSHOT_PATH = path.join(DATA_DIR, "tracker-snapshot.json");
export const PUBLIC_TRACKER_SNAPSHOT_PATH = path.join(
  PUBLIC_DATA_DIR,
  "tracker-snapshot.json",
);
export const MEETINGS_TECH_STORE_PATH = path.join(DATA_DIR, "meetings-techniker.json");
export const MEETINGS_RES_STORE_PATH = path.join(DATA_DIR, "meetings-ressourcen.json");
export const MEETINGS_TECHNICIANS_PATH = path.join(
  DATA_DIR,
  "meetings-technicians.json",
);

export type LocalBackupPayload = {
  tracker?: unknown;
  meetingsTechniker?: unknown;
  meetingsRessourcen?: unknown;
  meetingsTechnicians?: unknown;
  exportedAt?: string;
  source?: string;
};

export type LocalBackupState = {
  exportedAt: string;
  tracker: TrackerState | null;
  urlaube: UrlaubeDb;
  meetingsTechniker: MeetingStoreState;
  meetingsRessourcen: MeetingStoreState;
  meetingsTechnicians: MeetingTechniciansState;
};

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

function normalizeMeetingStore(
  kind: MeetingKind,
  raw: unknown,
): MeetingStoreState {
  if (!raw || typeof raw !== "object") return createEmptyStore(kind);
  const parsed = raw as Partial<MeetingStoreState>;
  if (parsed.version !== 1 || !Array.isArray(parsed.protocols)) {
    return createEmptyStore(kind);
  }
  return {
    version: 1,
    kind,
    protocols: parsed.protocols as MeetingStoreState["protocols"],
    selectedId:
      typeof parsed.selectedId === "string" || parsed.selectedId === null
        ? parsed.selectedId
        : null,
    savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : undefined,
  };
}

function normalizeTechnicians(raw: unknown): MeetingTechniciansState {
  if (!raw || typeof raw !== "object") return createEmptyMeetingTechnicians();
  const parsed = raw as Partial<MeetingTechniciansState>;
  if (parsed.version !== 1 || !Array.isArray(parsed.technicians)) {
    return createEmptyMeetingTechnicians();
  }
  return {
    version: 1,
    technicians: parsed.technicians.filter(
      (item) => item && typeof item.id === "string" && typeof item.name === "string",
    ),
  };
}

function mergeRecordMaps<T>(
  a: Record<string, T> | undefined,
  b: Record<string, T> | undefined,
): Record<string, T> {
  return { ...(a ?? {}), ...(b ?? {}) };
}

function mergeTrackerPreferringRicher(
  a: TrackerState | null,
  b: TrackerState | null,
): TrackerState | null {
  if (!a) return b;
  if (!b) return a;

  // Techniker-Listen mergen (Union nach ID, b überschreibt gleiche IDs)
  const byId = new Map<string, (typeof a.technicians)[number]>();
  for (const tech of a.technicians ?? []) byId.set(tech.id, tech);
  for (const tech of b.technicians ?? []) byId.set(tech.id, tech);

  return {
    year: b.year || a.year,
    technicians: [...byId.values()],
    // Maps mergen statt „Gewinner nimmt alles“ – sonst gehen Offene-/Tour-Importe verloren
    tickets: mergeRecordMaps(a.tickets, b.tickets),
    statuses: mergeRecordMaps(a.statuses, b.statuses),
    notes: mergeRecordMaps(a.notes, b.notes),
    openTickets: mergeRecordMaps(a.openTickets, b.openTickets),
    openStatuses: mergeRecordMaps(a.openStatuses, b.openStatuses),
    openNotes: mergeRecordMaps(a.openNotes, b.openNotes),
    tourTickets: mergeRecordMaps(a.tourTickets, b.tourTickets),
  };
}

function pickRicherTracker(
  a: TrackerState | null,
  b: TrackerState | null,
): TrackerState | null {
  return mergeTrackerPreferringRicher(a, b);
}

/**
 * Meetings: eingehende Speicherung gewinnt, wenn sie neuer ist oder
 * explizit aus der Meeting-UI kommt (sonst bleiben alte Demos ewig).
 */
function resolveIncomingMeetings(
  kind: MeetingKind,
  current: MeetingStoreState,
  incomingRaw: unknown,
  source: string | undefined,
): MeetingStoreState {
  if (incomingRaw === undefined) return current;
  const incoming = normalizeMeetingStore(kind, incomingRaw);
  // Explizite Meeting-Persistenz: Client ist Quelle der Wahrheit
  if (source === "meetings-persist") {
    // Leeren Store ohne neueren savedAt nicht über vorhandene Meetings legen
    // (schützt vor versehentlichem Wipe beim Hydrate mit leerem localStorage)
    if (
      incoming.protocols.length === 0 &&
      current.protocols.length > 0 &&
      meetingStoreFreshness(incoming) <= meetingStoreFreshness(current)
    ) {
      return current;
    }
    return mergeAgendaReminders(current, {
      ...incoming,
      kind,
      savedAt: incoming.savedAt ?? new Date().toISOString(),
    });
  }
  // Autosync / sonstige Backups: neuere Version nach savedAt
  return mergeAgendaReminders(
    current,
    pickNewerMeetingStore(current, { ...incoming, kind }, "b"),
  );
}

/** Server-gesendete Erinnerungen nicht durch älteren Client-Stand löschen. */
function mergeAgendaReminders(
  current: MeetingStoreState,
  incoming: MeetingStoreState,
): MeetingStoreState {
  const sentAt = new Map<string, string>();
  for (const store of [current, incoming]) {
    for (const protocol of store.protocols) {
      for (const item of protocol.agenda) {
        if (item.reminderSentAt) {
          sentAt.set(`${protocol.id}:${item.id}`, item.reminderSentAt);
        }
      }
    }
  }
  if (sentAt.size === 0) return incoming;
  return {
    ...incoming,
    protocols: incoming.protocols.map((protocol) => ({
      ...protocol,
      agenda: protocol.agenda.map((item) => ({
        ...item,
        reminderSentAt:
          item.reminderSentAt || sentAt.get(`${protocol.id}:${item.id}`) || null,
      })),
    })),
  };
}

export async function readLocalBackup(): Promise<LocalBackupState> {
  const trackerFile = await readJson<{ state?: TrackerState } | TrackerState>(
    TRACKER_DB_PATH,
  );
  const snapshotFile = await readJson<{ state?: TrackerState } | TrackerState>(
    TRACKER_SNAPSHOT_PATH,
  );

  const trackerFromDb =
    trackerFile && "state" in trackerFile && trackerFile.state
      ? parseTrackerState(trackerFile.state)
      : parseTrackerState(trackerFile);
  const trackerFromSnap =
    snapshotFile && "state" in snapshotFile && snapshotFile.state
      ? parseTrackerState(snapshotFile.state)
      : parseTrackerState(snapshotFile);

  const meetingsTechniker = normalizeMeetingStore(
    "techniker",
    await readJson(MEETINGS_TECH_STORE_PATH),
  );
  const meetingsRessourcen = normalizeMeetingStore(
    "ressourcen",
    await readJson(MEETINGS_RES_STORE_PATH),
  );
  const meetingsTechnicians = normalizeTechnicians(
    await readJson(MEETINGS_TECHNICIANS_PATH),
  );
  const urlaube = await readUrlaubeDb();

  return {
    exportedAt: new Date().toISOString(),
    tracker: pickRicherTracker(trackerFromDb, trackerFromSnap),
    urlaube,
    meetingsTechniker,
    meetingsRessourcen,
    meetingsTechnicians,
  };
}

export async function mergeAndWriteLocalBackup(
  incoming: LocalBackupPayload,
): Promise<LocalBackupState> {
  const current = await readLocalBackup();

  const incomingTracker = parseTrackerState(
    incoming.tracker &&
      typeof incoming.tracker === "object" &&
      "state" in (incoming.tracker as object)
      ? (incoming.tracker as { state: unknown }).state
      : incoming.tracker,
  );

  const nextTracker = pickRicherTracker(current.tracker, incomingTracker);
  const nextTechMeetings = resolveIncomingMeetings(
    "techniker",
    current.meetingsTechniker,
    incoming.meetingsTechniker,
    incoming.source,
  );
  const nextResMeetings = resolveIncomingMeetings(
    "ressourcen",
    current.meetingsRessourcen,
    incoming.meetingsRessourcen,
    incoming.source,
  );
  const incomingTechs = normalizeTechnicians(incoming.meetingsTechnicians);
  const nextTechnicians =
    incoming.meetingsTechnicians === undefined
      ? current.meetingsTechnicians
      : incomingTechs.technicians.length >= current.meetingsTechnicians.technicians.length
        ? incomingTechs
        : current.meetingsTechnicians;

  const exportedAt = new Date().toISOString();

  if (nextTracker) {
    const trackerPayload = {
      exportedAt,
      storageKey: TRACKER_STORAGE_KEY,
      source: incoming.source ?? "local-backup",
      state: nextTracker,
    };
    await writeJson(TRACKER_DB_PATH, trackerPayload);
    await writeJson(TRACKER_SNAPSHOT_PATH, trackerPayload);
    await writeJson(PUBLIC_TRACKER_SNAPSHOT_PATH, trackerPayload);
  }

  await writeJson(MEETINGS_TECH_STORE_PATH, nextTechMeetings);
  await writeJson(MEETINGS_RES_STORE_PATH, nextResMeetings);
  await writeJson(MEETINGS_TECHNICIANS_PATH, nextTechnicians);

  return {
    exportedAt,
    tracker: nextTracker,
    urlaube: current.urlaube,
    meetingsTechniker: nextTechMeetings,
    meetingsRessourcen: nextResMeetings,
    meetingsTechnicians: nextTechnicians,
  };
}
