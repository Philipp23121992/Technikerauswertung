import { createId } from "@/lib/id";

export const MAIL_STATUSES = ["neu", "in-bearbeitung", "erledigt"] as const;
export type MailStatus = (typeof MAIL_STATUSES)[number];
export const MAIL_STATUS_LABELS: Record<MailStatus, string> = {
  neu: "Neu",
  "in-bearbeitung": "In Bearbeitung",
  erledigt: "Erledigt",
};

export const MAIL_PRIORITIES = ["niedrig", "normal", "hoch", "kritisch"] as const;
export type MailPriority = (typeof MAIL_PRIORITIES)[number];
export const MAIL_PRIORITY_LABELS: Record<MailPriority, string> = {
  niedrig: "Niedrig",
  normal: "Normal",
  hoch: "Hoch",
  kritisch: "Kritisch",
};

export const SENDER_ROLES = [
  "chef",
  "kunde",
  "behoerde",
  "lieferant",
  "system",
  "unbekannt",
] as const;
export type SenderRole = (typeof SENDER_ROLES)[number];
export const SENDER_ROLE_LABELS: Record<SenderRole, string> = {
  chef: "Chef / Leitung",
  kunde: "Kunde",
  behoerde: "Behörde",
  lieferant: "Lieferant",
  system: "System",
  unbekannt: "Unbekannt",
};

export const FILE_CATEGORIES = [
  "rechnung",
  "vertrag",
  "formular",
  "bild",
  "bericht",
  "sonstiges",
] as const;
export type FileCategory = (typeof FILE_CATEGORIES)[number];
export const FILE_CATEGORY_LABELS: Record<FileCategory, string> = {
  rechnung: "Rechnungen",
  vertrag: "Verträge",
  formular: "Formulare",
  bild: "Bilder",
  bericht: "Berichte",
  sonstiges: "Sonstige Dokumente",
};

export const LOG_ACTIONS = [
  "sort",
  "archive",
  "file",
  "priority",
  "sync",
  "error",
  "oauth",
  "imap",
  "status",
] as const;
export type MailLogAction = (typeof LOG_ACTIONS)[number];

export const MAILBOX_PROVIDERS = ["none", "graph", "imap"] as const;
export type MailboxProvider = (typeof MAILBOX_PROVIDERS)[number];

export type Mailbox = {
  id: string;
  displayName: string;
  email: string;
  connected: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  syncEnabled: boolean;
  createdAt: string;
  provider: MailboxProvider;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUser: string;
  hasImapPassword: boolean;
};

export type SenderFolder = {
  id: string;
  mailboxId: string;
  email: string;
  displayName: string;
  role: SenderRole;
  createdAt: string;
};

export type MailMessage = {
  id: string;
  mailboxId: string;
  senderId: string;
  graphId: string | null;
  graphConversationId: string | null;
  fromEmail: string;
  fromName: string;
  to: string[];
  subject: string;
  preview: string;
  bodyText: string;
  receivedAt: string;
  isRead: boolean;
  hasAttachments: boolean;
  status: MailStatus;
  priority: MailPriority;
  priorityReason: string;
  archived: boolean;
  archivedAt: string | null;
  outlookFolder: "inbox" | "archive";
  flaggedCritical: boolean;
  escalatedAt: string | null;
  staleWarnedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MailFile = {
  id: string;
  mailboxId: string;
  messageId: string;
  senderId: string;
  senderEmail: string;
  name: string;
  mimeType: string;
  size: number;
  category: FileCategory;
  important: boolean;
  storedName: string | null;
  receivedAt: string;
  graphAttachmentId: string | null;
};

export type MailLog = {
  id: string;
  at: string;
  mailboxId: string | null;
  action: MailLogAction;
  message: string;
};

export type MailverwaltungSettings = {
  staleHours: number;
  escalateCritical: boolean;
  copyToOneDrive: boolean;
  tenantId: string;
  clientId: string;
  redirectUri: string;
};

export type MailverwaltungDb = {
  version: 1;
  settings: MailverwaltungSettings;
  mailboxes: Mailbox[];
  senders: SenderFolder[];
  messages: MailMessage[];
  files: MailFile[];
  logs: MailLog[];
};

export function defaultSettings(): MailverwaltungSettings {
  return {
    staleHours: 8,
    escalateCritical: true,
    copyToOneDrive: false,
    tenantId: "common",
    clientId: "",
    redirectUri: "",
  };
}

export function createEmptyMailverwaltungDb(): MailverwaltungDb {
  return {
    version: 1,
    settings: defaultSettings(),
    mailboxes: [],
    senders: [],
    messages: [],
    files: [],
    logs: [],
  };
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asBool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeSettings(
  raw: Partial<MailverwaltungSettings> | undefined,
): MailverwaltungSettings {
  const base = defaultSettings();
  const stale = Number(raw?.staleHours);
  return {
    staleHours: Number.isFinite(stale) && stale > 0 ? stale : base.staleHours,
    escalateCritical: raw?.escalateCritical !== false,
    copyToOneDrive: Boolean(raw?.copyToOneDrive),
    tenantId: asString(raw?.tenantId, base.tenantId) || "common",
    clientId: asString(raw?.clientId),
    redirectUri: asString(raw?.redirectUri),
  };
}

export function normalizeMailbox(raw: Partial<Mailbox>, index = 0): Mailbox | null {
  const email = asString(raw.email).trim().toLowerCase();
  if (!email.includes("@")) return null;
  const port = Number(raw.imapPort);
  const provider = MAILBOX_PROVIDERS.includes(raw.provider as MailboxProvider)
    ? (raw.provider as MailboxProvider)
    : "none";
  return {
    id: asString(raw.id) || createId("mbx"),
    displayName: asString(raw.displayName).trim() || email,
    email,
    connected: asBool(raw.connected),
    lastSyncAt: typeof raw.lastSyncAt === "string" ? raw.lastSyncAt : null,
    lastError: typeof raw.lastError === "string" ? raw.lastError : null,
    syncEnabled: raw.syncEnabled !== false,
    createdAt: asString(raw.createdAt) || new Date(Date.now() - index * 1000).toISOString(),
    provider,
    imapHost: asString(raw.imapHost).trim(),
    imapPort: Number.isFinite(port) && port > 0 ? port : 993,
    imapSecure: raw.imapSecure !== false,
    imapUser: asString(raw.imapUser).trim() || email,
    hasImapPassword: asBool(raw.hasImapPassword),
  };
}

export function normalizeSender(raw: Partial<SenderFolder>): SenderFolder | null {
  const email = asString(raw.email).trim().toLowerCase();
  const mailboxId = asString(raw.mailboxId);
  if (!email.includes("@") || !mailboxId) return null;
  const role = SENDER_ROLES.includes(raw.role as SenderRole)
    ? (raw.role as SenderRole)
    : "unbekannt";
  return {
    id: asString(raw.id) || createId("snd"),
    mailboxId,
    email,
    displayName: asString(raw.displayName).trim() || email,
    role,
    createdAt: asString(raw.createdAt) || new Date().toISOString(),
  };
}

export function normalizeMessage(raw: Partial<MailMessage>): MailMessage | null {
  const mailboxId = asString(raw.mailboxId);
  const senderId = asString(raw.senderId);
  if (!mailboxId || !senderId) return null;
  const status = MAIL_STATUSES.includes(raw.status as MailStatus)
    ? (raw.status as MailStatus)
    : "neu";
  const priority = MAIL_PRIORITIES.includes(raw.priority as MailPriority)
    ? (raw.priority as MailPriority)
    : "normal";
  const now = asString(raw.createdAt) || new Date().toISOString();
  return {
    id: asString(raw.id) || createId("msg"),
    mailboxId,
    senderId,
    graphId: typeof raw.graphId === "string" ? raw.graphId : null,
    graphConversationId:
      typeof raw.graphConversationId === "string" ? raw.graphConversationId : null,
    fromEmail: asString(raw.fromEmail).trim().toLowerCase(),
    fromName: asString(raw.fromName).trim() || asString(raw.fromEmail),
    to: Array.isArray(raw.to)
      ? raw.to.filter((item): item is string => typeof item === "string")
      : [],
    subject: asString(raw.subject).trim() || "(ohne Betreff)",
    preview: asString(raw.preview),
    bodyText: asString(raw.bodyText),
    receivedAt: asString(raw.receivedAt) || now,
    isRead: asBool(raw.isRead),
    hasAttachments: asBool(raw.hasAttachments),
    status,
    priority,
    priorityReason: asString(raw.priorityReason),
    archived: asBool(raw.archived) || status === "erledigt",
    archivedAt: typeof raw.archivedAt === "string" ? raw.archivedAt : null,
    outlookFolder: raw.outlookFolder === "archive" || status === "erledigt" ? "archive" : "inbox",
    flaggedCritical: asBool(raw.flaggedCritical) || priority === "kritisch",
    escalatedAt: typeof raw.escalatedAt === "string" ? raw.escalatedAt : null,
    staleWarnedAt: typeof raw.staleWarnedAt === "string" ? raw.staleWarnedAt : null,
    createdAt: now,
    updatedAt: asString(raw.updatedAt) || now,
  };
}

export function normalizeFile(raw: Partial<MailFile>): MailFile | null {
  const mailboxId = asString(raw.mailboxId);
  const messageId = asString(raw.messageId);
  const name = asString(raw.name).trim();
  if (!mailboxId || !messageId || !name) return null;
  const category = FILE_CATEGORIES.includes(raw.category as FileCategory)
    ? (raw.category as FileCategory)
    : "sonstiges";
  return {
    id: asString(raw.id) || createId("mfile"),
    mailboxId,
    messageId,
    senderId: asString(raw.senderId),
    senderEmail: asString(raw.senderEmail).toLowerCase(),
    name,
    mimeType: asString(raw.mimeType) || "application/octet-stream",
    size: Number(raw.size) || 0,
    category,
    important: raw.important !== false && category !== "sonstiges",
    storedName: typeof raw.storedName === "string" ? raw.storedName : null,
    receivedAt: asString(raw.receivedAt) || new Date().toISOString(),
    graphAttachmentId:
      typeof raw.graphAttachmentId === "string" ? raw.graphAttachmentId : null,
  };
}

export function normalizeLog(raw: Partial<MailLog>): MailLog | null {
  const message = asString(raw.message).trim();
  if (!message) return null;
  const action = LOG_ACTIONS.includes(raw.action as MailLogAction)
    ? (raw.action as MailLogAction)
    : "sync";
  return {
    id: asString(raw.id) || createId("mlog"),
    at: asString(raw.at) || new Date().toISOString(),
    mailboxId: typeof raw.mailboxId === "string" ? raw.mailboxId : null,
    action,
    message,
  };
}

export function normalizeDb(raw: Partial<MailverwaltungDb> | null): MailverwaltungDb {
  return {
    version: 1,
    settings: normalizeSettings(raw?.settings),
    mailboxes: Array.isArray(raw?.mailboxes)
      ? raw.mailboxes
          .map((item, index) => normalizeMailbox(item as Partial<Mailbox>, index))
          .filter((item): item is Mailbox => Boolean(item))
      : [],
    senders: Array.isArray(raw?.senders)
      ? raw.senders
          .map((item) => normalizeSender(item as Partial<SenderFolder>))
          .filter((item): item is SenderFolder => Boolean(item))
      : [],
    messages: Array.isArray(raw?.messages)
      ? raw.messages
          .map((item) => normalizeMessage(item as Partial<MailMessage>))
          .filter((item): item is MailMessage => Boolean(item))
      : [],
    files: Array.isArray(raw?.files)
      ? raw.files
          .map((item) => normalizeFile(item as Partial<MailFile>))
          .filter((item): item is MailFile => Boolean(item))
      : [],
    logs: Array.isArray(raw?.logs)
      ? raw.logs
          .map((item) => normalizeLog(item as Partial<MailLog>))
          .filter((item): item is MailLog => Boolean(item))
          .slice(-500)
      : [],
  };
}

export function addLog(
  db: MailverwaltungDb,
  entry: Omit<MailLog, "id" | "at"> & { at?: string },
): MailverwaltungDb {
  const log = normalizeLog({
    ...entry,
    id: createId("mlog"),
    at: entry.at || new Date().toISOString(),
  });
  if (!log) return db;
  return { ...db, logs: [...db.logs, log].slice(-500) };
}

export function senderKey(mailboxId: string, email: string): string {
  return `${mailboxId}:${email.trim().toLowerCase()}`;
}
