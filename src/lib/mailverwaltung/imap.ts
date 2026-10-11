import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";
import type { Mailbox } from "./types";

export type ImapAccount = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
};

export type ImapFetchedMail = {
  uid: number;
  graphId: string;
  fromEmail: string;
  fromName: string;
  to: string[];
  subject: string;
  preview: string;
  bodyText: string;
  receivedAt: string;
  isRead: boolean;
  hasAttachments: boolean;
  attachments: Array<{
    name: string;
    mimeType: string;
    size: number;
    id: string;
  }>;
};

const IMAP_TIMEOUT_MS = 20_000;

export function imapGraphId(uid: number): string {
  return `imap:${uid}`;
}

export function parseImapUid(graphId: string | null | undefined): number | null {
  if (!graphId?.startsWith("imap:")) return null;
  const uid = Number(graphId.slice("imap:".length));
  return Number.isFinite(uid) && uid > 0 ? Math.floor(uid) : null;
}

export function mailboxToImapAccount(mailbox: Mailbox, password: string): ImapAccount {
  return {
    host: mailbox.imapHost.trim(),
    port: mailbox.imapPort || 993,
    secure: mailbox.imapSecure !== false,
    user: (mailbox.imapUser || mailbox.email).trim(),
    password: password.trim(),
  };
}

export function guessImapPreset(email: string): Pick<ImapAccount, "host" | "port" | "secure"> {
  const domain = email.split("@")[1]?.trim().toLowerCase() || "";
  if (
    domain.endsWith(".onmicrosoft.com") ||
    domain === "outlook.com" ||
    domain === "hotmail.com" ||
    domain === "live.com" ||
    domain === "acp.de"
  ) {
    return { host: "outlook.office365.com", port: 993, secure: true };
  }
  if (domain.includes("ovh") || domain === "krsystems-techtools.de") {
    return { host: "ssl0.ovh.net", port: 993, secure: true };
  }
  return { host: "", port: 993, secure: true };
}

export function mapImapError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const low = message.toLowerCase();
  if (
    low.includes("auth") ||
    low.includes("login") ||
    low.includes("invalid credentials") ||
    low.includes("authenticationfailed")
  ) {
    return "IMAP-Anmeldung abgelehnt. Passwort prüfen. Bei Microsoft 365 ist IMAP oft ebenfalls deaktiviert — dann den Posteingang an ein eigenes Postfach (z. B. OVH) weiterleiten und dieses verbinden.";
  }
  if (low.includes("timeout") || low.includes("timed out") || low.includes("etimedout")) {
    return "Keine Verbindung zum IMAP-Server (Timeout). Host, Port und Firewall prüfen.";
  }
  if (low.includes("enotfound") || low.includes("getaddrinfo")) {
    return "IMAP-Host nicht gefunden. Bitte den Servernamen prüfen.";
  }
  if (low.includes("cert") || low.includes("ssl") || low.includes("tls")) {
    return "TLS/SSL-Fehler am IMAP-Server. Port 993 mit SSL ist der übliche Weg.";
  }
  return message || "IMAP-Verbindung fehlgeschlagen.";
}

function firstAddress(value: AddressObject | AddressObject[] | undefined): {
  email: string;
  name: string;
} {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  const entry = list[0]?.value?.[0];
  const email = (entry?.address || "unbekannt@local").toLowerCase();
  return { email, name: entry?.name?.trim() || email };
}

function allAddresses(value: AddressObject | AddressObject[] | undefined): string[] {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list
    .flatMap((item) => item.value ?? [])
    .map((entry) => entry.address?.toLowerCase() || "")
    .filter(Boolean);
}

function sanitizeFolderPart(value: string): string {
  return value
    .replace(/[\\/]+/g, "-")
    .replace(/[\x00-\x1f]+/g, "")
    .trim()
    .slice(0, 48) || "Absender";
}

async function withImap<T>(account: ImapAccount, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  if (!account.host.trim() || !account.user.trim() || !account.password.trim()) {
    throw new Error("IMAP-Host, Benutzername und Passwort werden benötigt.");
  }
  const client = new ImapFlow({
    host: account.host.trim(),
    port: account.port || 993,
    secure: account.secure !== false,
    auth: { user: account.user.trim(), pass: account.password },
    logger: false,
    connectionTimeout: IMAP_TIMEOUT_MS,
    greetingTimeout: IMAP_TIMEOUT_MS,
    socketTimeout: IMAP_TIMEOUT_MS,
  });
  try {
    await client.connect();
    return await fn(client);
  } finally {
    try {
      await client.logout();
    } catch {
      client.close();
    }
  }
}

export async function testImapLogin(account: ImapAccount): Promise<{ messages: number }> {
  try {
    return await withImap(account, async (client) => {
      const status = await client.status("INBOX", { messages: true });
      return { messages: Number(status.messages) || 0 };
    });
  } catch (error) {
    throw new Error(mapImapError(error));
  }
}

function toFetched(uid: number, flags: Set<string> | string[] | undefined, parsed: ParsedMail): ImapFetchedMail {
  const from = firstAddress(parsed.from);
  const html = typeof parsed.html === "string" ? parsed.html : "";
  const body = (parsed.text || html.replace(/<[^>]+>/g, " ") || "").replace(/\s+/g, " ").trim();
  const attachments = (parsed.attachments ?? [])
    .filter((item) => item.filename || item.contentType)
    .map((item, index) => ({
      name: item.filename || `anhang-${index + 1}`,
      mimeType: item.contentType || "application/octet-stream",
      size: Number(item.size) || (Buffer.isBuffer(item.content) ? item.content.length : 0),
      id: `imap-att-${uid}-${index}`,
    }));
  const received =
    parsed.date && !Number.isNaN(parsed.date.getTime())
      ? parsed.date.toISOString()
      : new Date().toISOString();
  const flagList = flags instanceof Set ? flags : new Set(flags ?? []);
  return {
    uid,
    graphId: imapGraphId(uid),
    fromEmail: from.email,
    fromName: from.name,
    to: allAddresses(parsed.to),
    subject: parsed.subject?.trim() || "(ohne Betreff)",
    preview: body.slice(0, 180),
    bodyText: body,
    receivedAt: received,
    isRead: flagList.has("\\Seen") || flagList.has("Seen"),
    hasAttachments: attachments.length > 0,
    attachments,
  };
}

export async function imapListMessages(account: ImapAccount, limit = 40): Promise<ImapFetchedMail[]> {
  try {
    return await withImap(account, async (client) => {
      const lock = await client.getMailboxLock("INBOX");
      try {
        const box = client.mailbox;
        const exists = box ? Number(box.exists) || 0 : 0;
        if (!exists) return [];
        const from = Math.max(1, exists - (limit - 1));
        const fetched: ImapFetchedMail[] = [];
        for await (const msg of client.fetch(`${from}:${exists}`, {
          uid: true,
          flags: true,
          source: true,
        })) {
          if (!msg.source || !msg.uid) continue;
          const parsed = await simpleParser(msg.source);
          fetched.push(toFetched(msg.uid, msg.flags, parsed));
        }
        return fetched;
      } finally {
        lock.release();
      }
    });
  } catch (error) {
    throw new Error(mapImapError(error));
  }
}

async function ensureFolder(client: ImapFlow, parts: string[]): Promise<string[]> {
  const clean = parts.map((part) => sanitizeFolderPart(part));
  const built: string[] = [];
  for (const part of clean) {
    built.push(part);
    try {
      await client.mailboxCreate(built);
    } catch {
      /* existiert bereits */
    }
  }
  return built;
}

export async function imapArchiveMessage(
  account: ImapAccount,
  uid: number,
  senderName: string,
): Promise<void> {
  try {
    await withImap(account, async (client) => {
      const dest = await ensureFolder(client, ["APM Mailverwaltung", senderName, "Archiv"]);
      const lock = await client.getMailboxLock("INBOX");
      try {
        await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
        const moved = await client.messageMove(String(uid), dest, { uid: true });
        if (!moved) {
          throw new Error("IMAP-Verschieben ins Archiv hat nicht geantwortet.");
        }
      } finally {
        lock.release();
      }
    });
  } catch (error) {
    throw new Error(mapImapError(error));
  }
}
