import { promises as fs } from "fs";
import path from "path";
import { TRACKER_STORAGE_KEY, parseTrackerState } from "@/lib/tracker";
import type { TrackerState } from "@/lib/tracker-types";
import {
  createEmptyStore,
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

function ticketCount(state: TrackerState | null | undefined): number {
  return Object.keys(state?.tickets ?? {}).length;
}

function protocolCount(state: MeetingStoreState | null | undefined): number {
  return state?.protocols?.length ?? 0;
}

function pickRicherTracker(
  a: TrackerState | null,
  b: TrackerState | null,
): TrackerState | null {
  if (!a) return b;
  if (!b) return a;
  const aScore =
    ticketCount(a) * 10 +
    (a.technicians?.length ?? 0) +
    Object.keys(a.openTickets ?? {}).length +
    Object.keys(a.tourTickets ?? {}).length;
  const bScore =
    ticketCount(b) * 10 +
    (b.technicians?.length ?? 0) +
    Object.keys(b.openTickets ?? {}).length +
    Object.keys(b.tourTickets ?? {}).length;
  return bScore > aScore ? b : a;
}

function pickRicherMeetings(
  a: MeetingStoreState,
  b: MeetingStoreState,
): MeetingStoreState {
  if (protocolCount(b) > protocolCount(a)) return b;
  if (protocolCount(b) < protocolCount(a)) return a;
  // gleiche Anzahl: mehr Agenda/Text gewinnt grob
  const score = (s: MeetingStoreState) =>
    s.protocols.reduce(
      (sum, p) =>
        sum +
        p.agenda.length +
        p.participants.length +
        p.decisions.length +
        (p.notes?.length ?? 0),
      0,
    );
  return score(b) > score(a) ? b : a;
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

  return {
    exportedAt: new Date().toISOString(),
    tracker: pickRicherTracker(trackerFromDb, trackerFromSnap),
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
  const nextTechMeetings = pickRicherMeetings(
    current.meetingsTechniker,
    normalizeMeetingStore("techniker", incoming.meetingsTechniker),
  );
  const nextResMeetings = pickRicherMeetings(
    current.meetingsRessourcen,
    normalizeMeetingStore("ressourcen", incoming.meetingsRessourcen),
  );
  const incomingTechs = normalizeTechnicians(incoming.meetingsTechnicians);
  const nextTechnicians =
    incomingTechs.technicians.length > current.meetingsTechnicians.technicians.length
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
    meetingsTechniker: nextTechMeetings,
    meetingsRessourcen: nextResMeetings,
    meetingsTechnicians: nextTechnicians,
  };
}
