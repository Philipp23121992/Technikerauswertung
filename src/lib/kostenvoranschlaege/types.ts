import { createId } from "@/lib/id";

export const QUOTE_STATUSES = ["offen", "angenommen", "abgelehnt"] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  offen: "Offen",
  angenommen: "Angenommen",
  abgelehnt: "Abgelehnt",
};

export const ORDER_STATUSES = ["bestellung-offen", "bestellt"] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  "bestellung-offen": "Bestellung offen",
  bestellt: "Bestellt",
};

export type QuoteUpdate = {
  id: string;
  text: string;
  createdAt: string;
};

export const QUOTE_FILE_KINDS = ["kostenvoranschlag", "sonstiges"] as const;

export type QuoteFileKind = (typeof QUOTE_FILE_KINDS)[number];

export const QUOTE_FILE_KIND_LABELS: Record<QuoteFileKind, string> = {
  kostenvoranschlag: "Kostenvoranschlag",
  sonstiges: "Sonstiges",
};

export type QuoteAttachment = {
  id: string;
  kind: QuoteFileKind;
  name: string;
  storedName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
};

export type CostQuote = {
  id: string;
  quoteNumber: string;
  processingNumber: string;
  quoteDate: string | null;
  validUntil: string | null;
  amount: string;
  currency: string;
  customer: string;
  contact: string;
  device: string;
  serialNumber: string;
  description: string;
  assignee: string;
  assigneeId: string;
  status: QuoteStatus;
  orderStatus: OrderStatus;
  dueMailSentAt: string | null;
  dueMailForDate: string | null;
  updates: QuoteUpdate[];
  attachments: QuoteAttachment[];
  createdAt: string;
  updatedAt: string;
};

export type KostenvoranschlaegeDb = {
  version: 1;
  quotes: CostQuote[];
};

export function createEmptyKostenvoranschlaegeDb(): KostenvoranschlaegeDb {
  return { version: 1, quotes: [] };
}

function isStatus(value: unknown): value is QuoteStatus {
  return typeof value === "string" && (QUOTE_STATUSES as readonly string[]).includes(value);
}

function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}

function isFileKind(value: unknown): value is QuoteFileKind {
  return typeof value === "string" && (QUOTE_FILE_KINDS as readonly string[]).includes(value);
}

function normalizeIsoDate(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function normalizeUpdate(raw: Partial<QuoteUpdate>): QuoteUpdate | null {
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

export function normalizeAttachment(
  raw: Partial<QuoteAttachment>,
): QuoteAttachment | null {
  if (!raw?.id || typeof raw.id !== "string") return null;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const storedName = typeof raw.storedName === "string" ? raw.storedName.trim() : "";
  if (!name || !storedName) return null;
  const size = typeof raw.size === "number" && Number.isFinite(raw.size) ? raw.size : 0;
  return {
    id: raw.id,
    kind: isFileKind(raw.kind) ? raw.kind : "kostenvoranschlag",
    name,
    storedName,
    mimeType: typeof raw.mimeType === "string" ? raw.mimeType : "application/octet-stream",
    size: Math.max(0, size),
    uploadedAt:
      typeof raw.uploadedAt === "string" ? raw.uploadedAt : new Date().toISOString(),
    uploadedBy: typeof raw.uploadedBy === "string" ? raw.uploadedBy.trim() : "",
  };
}

export function normalizeQuote(raw: Partial<CostQuote>, _index = 0): CostQuote | null {
  if (!raw?.id || typeof raw.id !== "string") return null;
  const attachments = Array.isArray(raw.attachments)
    ? raw.attachments
        .map((item) => normalizeAttachment(item as Partial<QuoteAttachment>))
        .filter((item): item is QuoteAttachment => Boolean(item))
    : [];
  const updates = Array.isArray(raw.updates)
    ? raw.updates
        .map((item) => normalizeUpdate(item as Partial<QuoteUpdate>))
        .filter((item): item is QuoteUpdate => Boolean(item))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [];

  return {
    id: raw.id,
    quoteNumber: typeof raw.quoteNumber === "string" ? raw.quoteNumber.trim() : "",
    processingNumber:
      typeof raw.processingNumber === "string" ? raw.processingNumber.trim() : "",
    quoteDate: normalizeIsoDate(raw.quoteDate),
    validUntil: normalizeIsoDate(raw.validUntil),
    amount: typeof raw.amount === "string" ? raw.amount.trim() : "",
    currency: typeof raw.currency === "string" && raw.currency.trim() ? raw.currency.trim() : "EUR",
    customer: typeof raw.customer === "string" ? raw.customer.trim() : "",
    contact: typeof raw.contact === "string" ? raw.contact.trim() : "",
    device: typeof raw.device === "string" ? raw.device.trim() : "",
    serialNumber: typeof raw.serialNumber === "string" ? raw.serialNumber.trim() : "",
    description: typeof raw.description === "string" ? raw.description.trim() : "",
    assignee: typeof raw.assignee === "string" ? raw.assignee.trim() : "",
    assigneeId: typeof raw.assigneeId === "string" ? raw.assigneeId.trim() : "",
    status: isStatus(raw.status) ? raw.status : "offen",
    orderStatus: isOrderStatus(raw.orderStatus) ? raw.orderStatus : "bestellung-offen",
    dueMailSentAt:
      typeof raw.dueMailSentAt === "string" && raw.dueMailSentAt ? raw.dueMailSentAt : null,
    dueMailForDate: normalizeIsoDate(raw.dueMailForDate),
    updates,
    attachments,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

export function createQuote(partial?: Partial<CostQuote>): CostQuote {
  const now = new Date().toISOString();
  return {
    id: createId("kvid"),
    quoteNumber: partial?.quoteNumber?.trim() ?? "",
    processingNumber: partial?.processingNumber?.trim() ?? "",
    quoteDate: partial?.quoteDate ?? null,
    validUntil: partial?.validUntil ?? null,
    amount: partial?.amount?.trim() ?? "",
    currency: partial?.currency?.trim() || "EUR",
    customer: partial?.customer?.trim() ?? "",
    contact: partial?.contact?.trim() ?? "",
    device: partial?.device?.trim() ?? "",
    serialNumber: partial?.serialNumber?.trim() ?? "",
    description: partial?.description?.trim() ?? "",
    assignee: partial?.assignee?.trim() ?? "",
    assigneeId: partial?.assigneeId?.trim() ?? "",
    status: isStatus(partial?.status) ? partial.status : "offen",
    orderStatus: isOrderStatus(partial?.orderStatus)
      ? partial.orderStatus
      : "bestellung-offen",
    dueMailSentAt: partial?.dueMailSentAt ?? null,
    dueMailForDate: partial?.dueMailForDate ?? null,
    updates: partial?.updates ?? [],
    attachments: partial?.attachments ?? [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createQuoteUpdate(text: string): QuoteUpdate {
  return {
    id: createId("kvupd"),
    text: text.trim(),
    createdAt: new Date().toISOString(),
  };
}

export function formatDateDe(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
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

export function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isQuoteExpired(quote: Pick<CostQuote, "validUntil" | "status">): boolean {
  if (!quote.validUntil || quote.status !== "offen") return false;
  return quote.validUntil < todayIso();
}

export function shouldSendQuoteDueMail(quote: CostQuote, today: string): boolean {
  if (quote.status === "angenommen" || quote.status === "abgelehnt") return false;
  if (!quote.assigneeId.trim()) return false;
  if (!quote.validUntil) return false;
  if (quote.validUntil > today) return false;
  if (quote.dueMailSentAt && quote.dueMailForDate === quote.validUntil) return false;
  return true;
}
