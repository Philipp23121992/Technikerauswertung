import { createId } from "@/lib/id";

export const BOARD_COLUMNS = [
  { id: "offen", label: "Offen", color: "#1f2937", emails: [] as string[] },
  {
    id: "fabian-eberhard",
    label: "Fabian Eberhard",
    color: "#2563eb",
    emails: ["fabian.eberhard@acp.de"],
  },
  {
    id: "christian-zimmermann",
    label: "Christian Zimmermann",
    color: "#7c3aed",
    emails: ["christian.zimmermann@acp.de"],
  },
  {
    id: "philipp-heyser",
    label: "Philipp Heyser",
    color: "#16a34a",
    emails: ["philipp.heyser@acp.de"],
  },
  {
    id: "korki",
    label: "Korki",
    color: "#ca8a04",
    emails: ["ozan.korkmaz@acp.de"],
  },
  {
    id: "mathias-mueller",
    label: "Mathias Müller",
    color: "#0ea5e9",
    emails: ["mathias.mueller@acp.de"],
  },
  {
    id: "besprechen",
    label: "Besprechen",
    color: "#db2777",
    emails: [
      "fabian.eberhard@acp.de",
      "christian.zimmermann@acp.de",
      "philipp.heyser@acp.de",
    ],
  },
  { id: "warten", label: "Warten", color: "#ea580c", emails: [] as string[] },
  {
    id: "dokumente",
    label: "Dokumente",
    color: "#475569",
    emails: [] as string[],
  },
] as const;

export type BoardColumnId = (typeof BOARD_COLUMNS)[number]["id"];

export const CARD_PRIORITIES = ["niedrig", "mittel", "hoch", "sehr-hoch"] as const;
export type CardPriority = (typeof CARD_PRIORITIES)[number];

export const CARD_PRIORITY_LABELS: Record<CardPriority, string> = {
  niedrig: "Niedrig",
  mittel: "Mittel",
  hoch: "Hoch",
  "sehr-hoch": "Sehr Hoch",
};

export const CARD_STATUSES = ["offen", "bearbeitung", "erledigt"] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

export const CARD_STATUS_LABELS: Record<CardStatus, string> = {
  offen: "offen",
  bearbeitung: "In Bearbeitung",
  erledigt: "Erledigt",
};

export type BoardComment = {
  id: string;
  text: string;
  createdAt: string;
};

export type BoardCard = {
  id: string;
  title: string;
  columnId: BoardColumnId;
  priority: CardPriority;
  status: CardStatus;
  dueDate: string | null;
  comments: BoardComment[];
  order: number;
  createdAt: string;
  updatedAt: string;
  /** `${columnId}|${dueDate}` after a due-mail was sent; reset when either changes. */
  dueMailSentKey: string | null;
};

export type ServiceboardDb = {
  version: 1;
  cards: BoardCard[];
};

export function createEmptyServiceboardDb(): ServiceboardDb {
  return { version: 1, cards: [] };
}

function isColumnId(value: unknown): value is BoardColumnId {
  return (
    typeof value === "string" &&
    BOARD_COLUMNS.some((column) => column.id === value)
  );
}

function isPriority(value: unknown): value is CardPriority {
  return (
    typeof value === "string" &&
    (CARD_PRIORITIES as readonly string[]).includes(value)
  );
}

function isStatus(value: unknown): value is CardStatus {
  return (
    typeof value === "string" &&
    (CARD_STATUSES as readonly string[]).includes(value)
  );
}

function normalizeComment(raw: Partial<BoardComment>): BoardComment | null {
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

export function normalizeBoardCard(
  raw: Partial<BoardCard>,
  index = 0,
): BoardCard | null {
  if (!raw?.id || typeof raw.id !== "string") return null;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title) return null;

  const comments = Array.isArray(raw.comments)
    ? raw.comments
        .map((item) => normalizeComment(item as Partial<BoardComment>))
        .filter((item): item is BoardComment => Boolean(item))
    : [];

  return {
    id: raw.id,
    title,
    columnId: isColumnId(raw.columnId) ? raw.columnId : "offen",
    priority: isPriority(raw.priority) ? raw.priority : "mittel",
    status: isStatus(raw.status) ? raw.status : "offen",
    dueDate:
      typeof raw.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.dueDate)
        ? raw.dueDate
        : null,
    comments,
    order: typeof raw.order === "number" && Number.isFinite(raw.order) ? raw.order : index,
    createdAt:
      typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    updatedAt:
      typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
    dueMailSentKey:
      typeof raw.dueMailSentKey === "string" && raw.dueMailSentKey
        ? raw.dueMailSentKey
        : null,
  };
}

export function createBoardCard(input: {
  title: string;
  columnId?: BoardColumnId;
  priority?: CardPriority;
  status?: CardStatus;
  dueDate?: string | null;
  order?: number;
}): BoardCard {
  const now = new Date().toISOString();
  return {
    id: createId("sbc"),
    title: input.title.trim(),
    columnId: input.columnId ?? "offen",
    priority: input.priority ?? "mittel",
    status: input.status ?? "offen",
    dueDate: input.dueDate ?? null,
    comments: [],
    order: input.order ?? Date.now(),
    createdAt: now,
    updatedAt: now,
    dueMailSentKey: null,
  };
}

export function createBoardComment(text: string): BoardComment {
  return {
    id: createId("sbcmt"),
    text: text.trim(),
    createdAt: new Date().toISOString(),
  };
}

export function formatDueDateDe(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("de-DE", { month: "short", day: "numeric" });
}

export function initialsForColumn(columnId: BoardColumnId): string {
  if (columnId === "fabian-eberhard") return "FE";
  if (columnId === "christian-zimmermann") return "CZ";
  if (columnId === "philipp-heyser") return "PH";
  if (columnId === "korki") return "KO";
  if (columnId === "mathias-mueller") return "MM";
  return "";
}

export function emailsForColumn(columnId: BoardColumnId): string[] {
  return [...(BOARD_COLUMNS.find((column) => column.id === columnId)?.emails ?? [])];
}

export function dueMailKey(
  columnId: BoardColumnId,
  dueDate: string | null,
): string | null {
  if (!dueDate) return null;
  return `${columnId}|${dueDate}`;
}

export function todayIsoLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function mergeDueMailState(
  incoming: BoardCard,
  existing: BoardCard | undefined,
): BoardCard {
  const nextKey = dueMailKey(incoming.columnId, incoming.dueDate);
  if (!existing) {
    return { ...incoming, dueMailSentKey: incoming.dueMailSentKey ?? null };
  }
  const prevKey = dueMailKey(existing.columnId, existing.dueDate);
  if (prevKey !== nextKey) {
    return { ...incoming, dueMailSentKey: null };
  }
  return {
    ...incoming,
    dueMailSentKey: existing.dueMailSentKey ?? incoming.dueMailSentKey ?? null,
  };
}

export function shouldSendColumnDueMail(card: BoardCard, today: string): boolean {
  if (card.status === "erledigt") return false;
  if (!card.dueDate || card.dueDate > today) return false;
  if (emailsForColumn(card.columnId).length === 0) return false;
  const key = dueMailKey(card.columnId, card.dueDate);
  return Boolean(key) && card.dueMailSentKey !== key;
}
