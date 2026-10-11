import {
  createEmptyStore,
  meetingStorageKey,
  normalizeAgendaItem,
  type MeetingKind,
  type MeetingProtocol,
  type MeetingStoreState,
  type ProtocolItem,
} from "./types";

function normalizeProtocol(raw: Partial<MeetingProtocol>): MeetingProtocol | null {
  if (!raw?.id || typeof raw.title !== "string") return null;
  const participants = Array.isArray(raw.participants)
    ? raw.participants.filter(
        (item): item is ProtocolItem =>
          Boolean(item?.id) && typeof item?.text === "string",
      )
    : [];
  const decisions = Array.isArray(raw.decisions)
    ? raw.decisions.filter(
        (item): item is ProtocolItem =>
          Boolean(item?.id) && typeof item?.text === "string",
      )
    : [];
  const agenda = Array.isArray(raw.agenda)
    ? raw.agenda
        .map((item) => normalizeAgendaItem(item as never))
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
    : [];

  return {
    id: raw.id,
    title: raw.title,
    meetingDate: typeof raw.meetingDate === "string" ? raw.meetingDate : "",
    meetingTime: typeof raw.meetingTime === "string" ? raw.meetingTime : "",
    status: raw.status ?? "in_bearbeitung",
    participants,
    agenda,
    notes: typeof raw.notes === "string" ? raw.notes : "",
    decisions,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

export function loadMeetingStore(kind: MeetingKind): MeetingStoreState {
  if (typeof window === "undefined") return createEmptyStore(kind);
  try {
    const raw = window.localStorage.getItem(meetingStorageKey(kind));
    if (!raw) return createEmptyStore(kind);
    const parsed = JSON.parse(raw) as Partial<MeetingStoreState>;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.protocols)) {
      return createEmptyStore(kind);
    }
    const protocols = parsed.protocols
      .map((item) => normalizeProtocol(item as never))
      .filter((item): item is MeetingProtocol => Boolean(item));
    const selectedId =
      typeof parsed.selectedId === "string" || parsed.selectedId === null
        ? parsed.selectedId
        : protocols[0]?.id ?? null;
    return {
      version: 1,
      kind,
      protocols,
      selectedId:
        selectedId && protocols.some((item) => item.id === selectedId)
          ? selectedId
          : protocols[0]?.id ?? null,
      savedAt:
        typeof parsed.savedAt === "string" ? parsed.savedAt : undefined,
    };
  } catch {
    return createEmptyStore(kind);
  }
}

export function saveMeetingStore(state: MeetingStoreState): void {
  if (typeof window === "undefined") return;
  const withStamp: MeetingStoreState = {
    ...state,
    savedAt: state.savedAt ?? new Date().toISOString(),
  };
  window.localStorage.setItem(
    meetingStorageKey(state.kind),
    JSON.stringify(withStamp),
  );
}

export function stampMeetingStore(state: MeetingStoreState): MeetingStoreState {
  return { ...state, savedAt: new Date().toISOString() };
}
