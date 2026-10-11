"use client";

export type MailboxDto = {
  id: string;
  displayName: string;
  email: string;
  connected: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  syncEnabled: boolean;
  provider?: "none" | "graph" | "imap";
  imapHost?: string;
  imapPort?: number;
  imapSecure?: boolean;
  imapUser?: string;
  hasImapPassword?: boolean;
};

export type SenderDto = {
  id: string;
  mailboxId: string;
  email: string;
  displayName: string;
  role: string;
};

export type MessageDto = {
  id: string;
  mailboxId: string;
  senderId: string;
  fromEmail: string;
  fromName: string;
  to: string[];
  subject: string;
  preview: string;
  bodyText: string;
  receivedAt: string;
  isRead: boolean;
  hasAttachments: boolean;
  status: "neu" | "in-bearbeitung" | "erledigt";
  priority: "niedrig" | "normal" | "hoch" | "kritisch";
  priorityReason: string;
  archived: boolean;
  flaggedCritical: boolean;
  staleWarnedAt: string | null;
};

export type FileDto = {
  id: string;
  mailboxId: string;
  messageId: string;
  senderId: string;
  senderEmail: string;
  name: string;
  mimeType: string;
  size: number;
  category: string;
  important: boolean;
  receivedAt: string;
};

export type LogDto = {
  id: string;
  at: string;
  mailboxId: string | null;
  action: string;
  message: string;
};

export type MailverwaltungState = {
  settings: {
    staleHours: number;
    escalateCritical: boolean;
    copyToOneDrive: boolean;
    tenantId: string;
    clientId: string;
    redirectUri: string;
    hasClientId: boolean;
  };
  mailboxes: MailboxDto[];
  senders: SenderDto[];
  messages: MessageDto[];
  files: FileDto[];
  logs: LogDto[];
  stats: {
    unread: number;
    critical: number;
    stale: number;
    importantFiles: number;
  };
};

export const STATUS_LABELS: Record<MessageDto["status"], string> = {
  neu: "Neu",
  "in-bearbeitung": "In Bearbeitung",
  erledigt: "Erledigt",
};

export const PRIORITY_LABELS: Record<MessageDto["priority"], string> = {
  niedrig: "Niedrig",
  normal: "Normal",
  hoch: "Hoch",
  kritisch: "Kritisch",
};

export const ROLE_LABELS: Record<string, string> = {
  chef: "Chef / Leitung",
  kunde: "Kunde",
  behoerde: "Behörde",
  lieferant: "Lieferant",
  system: "System",
  unbekannt: "Unbekannt",
};

export const FILE_LABELS: Record<string, string> = {
  rechnung: "Rechnungen",
  vertrag: "Verträge",
  formular: "Formulare",
  bild: "Bilder",
  bericht: "Berichte",
  sonstiges: "Sonstige",
};

export function formatWhen(iso: string): string {
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

export async function fetchMailState(): Promise<MailverwaltungState> {
  const res = await fetch("/api/mailverwaltung", { credentials: "same-origin" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Mailverwaltung konnte nicht geladen werden.");
  return data as MailverwaltungState;
}
