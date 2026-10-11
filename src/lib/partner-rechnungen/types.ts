import { createId } from "@/lib/id";

export const INVOICE_STATUSES = [
  "offen",
  "klaerung-intern",
  "klaerung-extern",
  "gutschrift",
  "zahlung-faellig",
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  offen: "Offen",
  "klaerung-intern": "in Klärung Intern",
  "klaerung-extern": "in Klärung Extern",
  gutschrift: "Gutschrift",
  "zahlung-faellig": "Rechnung muss Bezahlt werden",
};

const LEGACY_STATUS_MAP: Record<string, InvoiceStatus> = {
  "in-bearbeitung": "klaerung-intern",
  klaerung: "klaerung-intern",
  bezahlt: "zahlung-faellig",
  abgelehnt: "klaerung-extern",
  abgeschlossen: "zahlung-faellig",
};

export type InvoiceUpdate = {
  id: string;
  text: string;
  createdAt: string;
};

export const INVOICE_FILE_KINDS = ["rechnung", "gutschrift"] as const;

export type InvoiceFileKind = (typeof INVOICE_FILE_KINDS)[number];

export const INVOICE_FILE_KIND_LABELS: Record<InvoiceFileKind, string> = {
  rechnung: "Originalrechnung",
  gutschrift: "Gutschrift",
};

export type InvoiceAttachment = {
  id: string;
  kind: InvoiceFileKind;
  name: string;
  storedName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
};

export type PartnerInvoice = {
  id: string;
  invoiceNumber: string;
  creditNoteNumber: string;
  invoiceDate: string | null;
  dueDate: string | null;
  amount: string;
  currency: string;
  vendor: string;
  customer: string;
  ticketNumber: string;
  assignee: string;
  billingMonth: string;
  status: InvoiceStatus;
  updates: InvoiceUpdate[];
  attachments: InvoiceAttachment[];
  createdAt: string;
  updatedAt: string;
};

export type PartnerRechnungenDb = {
  version: 1;
  invoices: PartnerInvoice[];
};

export function createEmptyPartnerRechnungenDb(): PartnerRechnungenDb {
  return { version: 1, invoices: [] };
}

function billingMonthOf(
  value: unknown,
  invoiceDate: string | null,
  createdAt?: string,
): string {
  if (typeof value === "string" && /^\d{4}-\d{2}$/.test(value)) return value;
  if (invoiceDate && /^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) return invoiceDate.slice(0, 7);
  if (createdAt && /^\d{4}-\d{2}-\d{2}/.test(createdAt)) return createdAt.slice(0, 7);
  return new Date().toISOString().slice(0, 7);
}

function isStatus(value: unknown): value is InvoiceStatus {
  return typeof value === "string" && (INVOICE_STATUSES as readonly string[]).includes(value);
}

function migrateStatus(value: unknown): InvoiceStatus {
  if (isStatus(value)) return value;
  if (typeof value === "string" && value in LEGACY_STATUS_MAP) {
    return LEGACY_STATUS_MAP[value];
  }
  return "offen";
}

function normalizeUpdate(raw: Partial<InvoiceUpdate>): InvoiceUpdate | null {
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

function isFileKind(value: unknown): value is InvoiceFileKind {
  return typeof value === "string" && (INVOICE_FILE_KINDS as readonly string[]).includes(value);
}

function normalizeIsoDate(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function normalizeAttachment(
  raw: Partial<InvoiceAttachment>,
): InvoiceAttachment | null {
  if (!raw?.id || typeof raw.id !== "string") return null;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const storedName = typeof raw.storedName === "string" ? raw.storedName.trim() : "";
  if (!name || !storedName) return null;
  const size = typeof raw.size === "number" && Number.isFinite(raw.size) ? raw.size : 0;
  return {
    id: raw.id,
    kind: isFileKind(raw.kind) ? raw.kind : "rechnung",
    name,
    storedName,
    mimeType: typeof raw.mimeType === "string" ? raw.mimeType : "application/octet-stream",
    size: Math.max(0, size),
    uploadedAt:
      typeof raw.uploadedAt === "string" ? raw.uploadedAt : new Date().toISOString(),
    uploadedBy: typeof raw.uploadedBy === "string" ? raw.uploadedBy.trim() : "",
  };
}

export function normalizeInvoice(raw: Partial<PartnerInvoice>, _index = 0): PartnerInvoice | null {
  if (!raw?.id || typeof raw.id !== "string") return null;
  const attachments = Array.isArray(raw.attachments)
    ? raw.attachments
        .map((item) => normalizeAttachment(item as Partial<InvoiceAttachment>))
        .filter((item): item is InvoiceAttachment => Boolean(item))
    : [];
  const updates = Array.isArray(raw.updates)
    ? raw.updates
        .map((item) => normalizeUpdate(item as Partial<InvoiceUpdate>))
        .filter((item): item is InvoiceUpdate => Boolean(item))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [];
  const legacyNote =
    typeof (raw as { note?: unknown }).note === "string"
      ? ((raw as { note?: string }).note ?? "").trim()
      : "";
  if (legacyNote && !updates.some((item) => item.text === legacyNote)) {
    updates.push({
      id: createId("prtupd"),
      text: legacyNote,
      createdAt:
        typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    });
    updates.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  return {
    id: raw.id,
    invoiceNumber: typeof raw.invoiceNumber === "string" ? raw.invoiceNumber.trim() : "",
    creditNoteNumber:
      typeof raw.creditNoteNumber === "string" ? raw.creditNoteNumber.trim() : "",
    invoiceDate: normalizeIsoDate(raw.invoiceDate),
    dueDate: normalizeIsoDate(raw.dueDate),
    amount: typeof raw.amount === "string" ? raw.amount.trim() : "",
    currency: typeof raw.currency === "string" && raw.currency.trim() ? raw.currency.trim() : "EUR",
    vendor: typeof raw.vendor === "string" && raw.vendor.trim() ? raw.vendor.trim() : "Partner",
    customer: typeof raw.customer === "string" ? raw.customer.trim() : "",
    ticketNumber: typeof raw.ticketNumber === "string" ? raw.ticketNumber.trim() : "",
    assignee: typeof raw.assignee === "string" ? raw.assignee.trim() : "",
    billingMonth: billingMonthOf(
      (raw as { billingMonth?: unknown }).billingMonth,
      normalizeIsoDate(raw.invoiceDate),
      typeof raw.createdAt === "string" ? raw.createdAt : undefined,
    ),
    status: migrateStatus(raw.status),
    updates,
    attachments,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

export function createInvoice(partial?: Partial<PartnerInvoice>): PartnerInvoice {
  const now = new Date().toISOString();
  return {
    id: createId("prtinv"),
    invoiceNumber: partial?.invoiceNumber?.trim() ?? "",
    creditNoteNumber: partial?.creditNoteNumber?.trim() ?? "",
    invoiceDate: partial?.invoiceDate ?? null,
    dueDate: partial?.dueDate ?? null,
    amount: partial?.amount?.trim() ?? "",
    currency: partial?.currency?.trim() || "EUR",
    vendor: partial?.vendor?.trim() || "Partner",
    customer: partial?.customer?.trim() ?? "",
    ticketNumber: partial?.ticketNumber?.trim() ?? "",
    assignee: partial?.assignee?.trim() ?? "",
    billingMonth: billingMonthOf(
      partial?.billingMonth,
      partial?.invoiceDate ?? null,
      now,
    ),
    status: migrateStatus(partial?.status),
    updates: partial?.updates ?? [],
    attachments: partial?.attachments ?? [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createInvoiceUpdate(text: string): InvoiceUpdate {
  return {
    id: createId("prtupd"),
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
