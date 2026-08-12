export type MeetingKind = "techniker" | "ressourcen";

export type ProtocolStatus = "in_bearbeitung" | "abgeschlossen" | "entwurf";

export const PROTOCOL_STATUS_OPTIONS: {
  id: ProtocolStatus;
  label: string;
}[] = [
  { id: "entwurf", label: "Entwurf" },
  { id: "in_bearbeitung", label: "In Bearbeitung" },
  { id: "abgeschlossen", label: "Abgeschlossen" },
];

export type ProtocolItem = {
  id: string;
  text: string;
};

export type AgendaItem = {
  id: string;
  text: string;
  assigneeId: string | null;
  assigneeName: string;
  assigneeEmail: string;
  /** ISO date YYYY-MM-DD */
  dueDate: string;
  /** ISO timestamp after successful reminder mail */
  reminderSentAt: string | null;
};

export type MeetingProtocol = {
  id: string;
  title: string;
  /** ISO date YYYY-MM-DD */
  meetingDate: string;
  /** HH:mm */
  meetingTime: string;
  status: ProtocolStatus;
  participants: ProtocolItem[];
  agenda: AgendaItem[];
  notes: string;
  decisions: ProtocolItem[];
  createdAt: string;
  updatedAt: string;
};

export type MeetingStoreState = {
  version: 1;
  kind: MeetingKind;
  protocols: MeetingProtocol[];
  selectedId: string | null;
};

export function meetingStorageKey(kind: MeetingKind): string {
  return `apm.meetings.${kind}.v1`;
}

export function meetingKindLabel(kind: MeetingKind): string {
  return kind === "techniker" ? "Techniker Meeting" : "Ressourcenmeeting";
}

export function defaultProtocolTitle(kind: MeetingKind, dateIso: string): string {
  return `${meetingKindLabel(kind)} ${formatMeetingDate(dateIso)}`;
}

export function formatMeetingDate(dateIso: string): string {
  const [y, m, d] = dateIso.split("-");
  if (!y || !m || !d) return dateIso;
  return `${d}.${m}.${y}`;
}

export function formatMeetingDateTime(dateIso: string, time: string): string {
  return `${formatMeetingDate(dateIso)} ${time || "—"}`;
}

export function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function nowTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

export function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeAgendaItem(raw: Partial<AgendaItem> & { text?: string }): AgendaItem | null {
  if (!raw?.id || typeof raw.text !== "string") return null;
  return {
    id: raw.id,
    text: raw.text,
    assigneeId: typeof raw.assigneeId === "string" ? raw.assigneeId : null,
    assigneeName: typeof raw.assigneeName === "string" ? raw.assigneeName : "",
    assigneeEmail: typeof raw.assigneeEmail === "string" ? raw.assigneeEmail : "",
    dueDate: typeof raw.dueDate === "string" ? raw.dueDate : "",
    reminderSentAt:
      typeof raw.reminderSentAt === "string" ? raw.reminderSentAt : null,
  };
}

export function createEmptyProtocol(kind: MeetingKind): MeetingProtocol {
  const meetingDate = todayIso();
  const meetingTime = nowTime();
  const createdAt = new Date().toISOString();
  return {
    id: createId("proto"),
    title: defaultProtocolTitle(kind, meetingDate),
    meetingDate,
    meetingTime,
    status: "in_bearbeitung",
    participants: [],
    agenda: [],
    notes: "",
    decisions: [],
    createdAt,
    updatedAt: createdAt,
  };
}

export function createEmptyStore(kind: MeetingKind): MeetingStoreState {
  return {
    version: 1,
    kind,
    protocols: [],
    selectedId: null,
  };
}

export function statusLabel(status: ProtocolStatus): string {
  return (
    PROTOCOL_STATUS_OPTIONS.find((item) => item.id === status)?.label ?? status
  );
}

export function isAgendaDue(item: AgendaItem, today = todayIso()): boolean {
  return Boolean(item.dueDate && item.dueDate <= today);
}
