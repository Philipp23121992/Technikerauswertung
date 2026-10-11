import { createId } from "@/lib/id";
import { classifyAttachment, inferSenderRole, prioritizeMail } from "./classify";
import { readMailverwaltungDb, writeMailverwaltungDb } from "./db";
import {
  graphArchiveMessage,
  graphListAttachments,
  graphListMessages,
  graphMarkRead,
  graphMe,
  graphMessageBody,
  getValidAccessToken,
  type GraphMail,
} from "./graph";
import { getImapPassword, getMailboxToken } from "./tokens";
import {
  imapArchiveMessage,
  imapListMessages,
  mailboxToImapAccount,
  parseImapUid,
  type ImapFetchedMail,
} from "./imap";
import {
  addLog,
  senderKey,
  type MailFile,
  type MailMessage,
  type MailverwaltungDb,
  type SenderFolder,
} from "./types";

export type SyncResult = {
  mailboxId: string;
  imported: number;
  archived: number;
  stale: number;
  error?: string;
};

function findOrCreateSender(
  db: MailverwaltungDb,
  mailboxId: string,
  email: string,
  name: string,
): { db: MailverwaltungDb; sender: SenderFolder; created: boolean } {
  const key = email.trim().toLowerCase();
  const existing = db.senders.find(
    (item) => item.mailboxId === mailboxId && item.email === key,
  );
  if (existing) return { db, sender: existing, created: false };
  const sender: SenderFolder = {
    id: createId("snd"),
    mailboxId,
    email: key,
    displayName: name.trim() || key,
    role: inferSenderRole(key, name),
    createdAt: new Date().toISOString(),
  };
  return {
    db: addLog(
      { ...db, senders: [...db.senders, sender] },
      {
        mailboxId,
        action: "sort",
        message: `Absenderordner für ${sender.displayName} (<${sender.email}>) angelegt.`,
      },
    ),
    sender,
    created: true,
  };
}

function applyClassification(db: MailverwaltungDb, message: MailMessage, files: MailFile[]): MailMessage {
  const sender = db.senders.find((item) => item.id === message.senderId);
  const previousCriticalCount = db.messages.filter(
    (item) =>
      item.mailboxId === message.mailboxId &&
      item.senderId === message.senderId &&
      item.id !== message.id &&
      item.priority === "kritisch",
  ).length;
  const result = prioritizeMail({
    fromEmail: message.fromEmail,
    fromName: message.fromName,
    subject: message.subject,
    bodyText: message.bodyText,
    hasAttachments: message.hasAttachments,
    attachmentNames: files.map((item) => item.name),
    senderRole: sender?.role ?? inferSenderRole(message.fromEmail, message.fromName),
    previousCriticalCount,
  });
  return {
    ...message,
    priority: result.priority,
    priorityReason: result.reason,
    flaggedCritical: result.priority === "kritisch",
  };
}

async function importGraphMail(
  db: MailverwaltungDb,
  mailboxId: string,
  accessToken: string,
  item: GraphMail,
): Promise<MailverwaltungDb> {
  if (db.messages.some((msg) => msg.mailboxId === mailboxId && msg.graphId === item.id)) {
    return db;
  }
  const fromEmail = item.from?.emailAddress?.address?.toLowerCase() || "unbekannt@local";
  const fromName = item.from?.emailAddress?.name || fromEmail;
  const created = findOrCreateSender(db, mailboxId, fromEmail, fromName);
  db = created.db;
  const bodyText = item.bodyPreview || "";
  let attachments: MailFile[] = [];
  if (item.hasAttachments && item.id) {
    try {
      const listed = await graphListAttachments(accessToken, item.id);
      attachments = listed.map((file) => {
        const classified = classifyAttachment(file.name || "anhang", file.contentType);
        return {
          id: createId("mfile"),
          mailboxId,
          messageId: "",
          senderId: created.sender.id,
          senderEmail: fromEmail,
          name: file.name || "anhang",
          mimeType: file.contentType || "application/octet-stream",
          size: Number(file.size) || 0,
          category: classified.category,
          important: classified.important,
          storedName: null,
          receivedAt: item.receivedDateTime || new Date().toISOString(),
          graphAttachmentId: file.id,
        } satisfies MailFile;
      });
    } catch {
      /* attachments optional */
    }
  }
  let body = bodyText;
  try {
    if (item.id) body = (await graphMessageBody(accessToken, item.id)) || bodyText;
  } catch {
    /* preview reicht */
  }
  const now = new Date().toISOString();
  let message: MailMessage = {
    id: createId("msg"),
    mailboxId,
    senderId: created.sender.id,
    graphId: item.id || null,
    graphConversationId: item.conversationId || null,
    fromEmail,
    fromName,
    to: (item.toRecipients ?? [])
      .map((entry) => entry.emailAddress?.address || "")
      .filter(Boolean),
    subject: item.subject || "(ohne Betreff)",
    preview: (item.bodyPreview || body).slice(0, 180),
    bodyText: body,
    receivedAt: item.receivedDateTime || now,
    isRead: Boolean(item.isRead),
    hasAttachments: Boolean(item.hasAttachments),
    status: "neu",
    priority: "normal",
    priorityReason: "",
    archived: false,
    archivedAt: null,
    outlookFolder: "inbox",
    flaggedCritical: false,
    escalatedAt: null,
    staleWarnedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  attachments = attachments.map((file) => ({ ...file, messageId: message.id }));
  message = applyClassification(db, message, attachments);
  db = {
    ...db,
    messages: [message, ...db.messages],
    files: [...db.files, ...attachments],
  };
  db = addLog(db, {
    mailboxId,
    action: "priority",
    message: `Mail „${message.subject}“ von ${fromName}: ${message.priority} (${message.priorityReason}).`,
  });
  if (attachments.length) {
    db = addLog(db, {
      mailboxId,
      action: "file",
      message: `${attachments.length} Anhang/Anhänge klassifiziert.`,
    });
  }
  if (message.priority === "kritisch" && db.settings.escalateCritical) {
    message = { ...message, escalatedAt: now };
    db = {
      ...db,
      messages: db.messages.map((item) => (item.id === message.id ? message : item)),
    };
    db = addLog(db, {
      mailboxId,
      action: "priority",
      message: `Kritische Mail „${message.subject}“ eskaliert.`,
    });
  }
  return db;
}

async function importImapMail(
  db: MailverwaltungDb,
  mailboxId: string,
  item: ImapFetchedMail,
): Promise<MailverwaltungDb> {
  if (db.messages.some((msg) => msg.mailboxId === mailboxId && msg.graphId === item.graphId)) {
    return db;
  }
  const created = findOrCreateSender(db, mailboxId, item.fromEmail, item.fromName);
  db = created.db;
  const now = new Date().toISOString();
  let attachments: MailFile[] = item.attachments.map((file) => {
    const classified = classifyAttachment(file.name, file.mimeType);
    return {
      id: createId("mfile"),
      mailboxId,
      messageId: "",
      senderId: created.sender.id,
      senderEmail: item.fromEmail,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      category: classified.category,
      important: classified.important,
      storedName: null,
      receivedAt: item.receivedAt || now,
      graphAttachmentId: file.id,
    } satisfies MailFile;
  });
  let message: MailMessage = {
    id: createId("msg"),
    mailboxId,
    senderId: created.sender.id,
    graphId: item.graphId,
    graphConversationId: null,
    fromEmail: item.fromEmail,
    fromName: item.fromName,
    to: item.to,
    subject: item.subject,
    preview: item.preview,
    bodyText: item.bodyText,
    receivedAt: item.receivedAt,
    isRead: item.isRead,
    hasAttachments: item.hasAttachments,
    status: "neu",
    priority: "normal",
    priorityReason: "",
    archived: false,
    archivedAt: null,
    outlookFolder: "inbox",
    flaggedCritical: false,
    escalatedAt: null,
    staleWarnedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  attachments = attachments.map((file) => ({ ...file, messageId: message.id }));
  message = applyClassification(db, message, attachments);
  db = {
    ...db,
    messages: [message, ...db.messages],
    files: [...db.files, ...attachments],
  };
  db = addLog(db, {
    mailboxId,
    action: "priority",
    message: `Mail „${message.subject}“ von ${item.fromName}: ${message.priority} (${message.priorityReason}).`,
  });
  if (attachments.length) {
    db = addLog(db, {
      mailboxId,
      action: "file",
      message: `${attachments.length} Anhang/Anhänge klassifiziert.`,
    });
  }
  if (message.priority === "kritisch" && db.settings.escalateCritical) {
    message = { ...message, escalatedAt: now };
    db = {
      ...db,
      messages: db.messages.map((entry) => (entry.id === message.id ? message : entry)),
    };
    db = addLog(db, {
      mailboxId,
      action: "priority",
      message: `Kritische Mail „${message.subject}“ eskaliert.`,
    });
  }
  return db;
}

async function pushLocalStatusToOutlook(
  db: MailverwaltungDb,
  mailboxId: string,
  accessToken: string,
): Promise<{ db: MailverwaltungDb; archived: number }> {
  let archived = 0;
  const pending = db.messages.filter(
    (item) =>
      item.mailboxId === mailboxId &&
      item.status === "erledigt" &&
      item.graphId &&
      item.outlookFolder !== "archive",
  );
  for (const message of pending) {
    try {
      const sender = db.senders.find((item) => item.id === message.senderId);
      await graphArchiveMessage(
        accessToken,
        message.graphId as string,
        sender?.displayName || message.fromName,
      );
      if (!message.isRead) {
        await graphMarkRead(accessToken, message.graphId as string, true);
      }
      archived += 1;
      db = {
        ...db,
        messages: db.messages.map((item) =>
          item.id === message.id
            ? {
                ...item,
                archived: true,
                archivedAt: item.archivedAt || new Date().toISOString(),
                outlookFolder: "archive",
                isRead: true,
                updatedAt: new Date().toISOString(),
              }
            : item,
        ),
      };
      db = addLog(db, {
        mailboxId,
        action: "archive",
        message: `Mail „${message.subject}“ in Outlook-Archiv unter ${sender?.displayName || message.fromName} verschoben.`,
      });
    } catch (error) {
      db = addLog(db, {
        mailboxId,
        action: "error",
        message: `Archivierung in Outlook fehlgeschlagen: ${error instanceof Error ? error.message : "unbekannt"}`,
      });
    }
  }
  return { db, archived };
}

async function pushLocalStatusToImap(
  db: MailverwaltungDb,
  mailboxId: string,
  account: ReturnType<typeof mailboxToImapAccount>,
): Promise<{ db: MailverwaltungDb; archived: number }> {
  let archived = 0;
  const pending = db.messages.filter(
    (item) =>
      item.mailboxId === mailboxId &&
      item.status === "erledigt" &&
      parseImapUid(item.graphId) &&
      item.outlookFolder !== "archive",
  );
  for (const message of pending) {
    const uid = parseImapUid(message.graphId);
    if (!uid) continue;
    try {
      const sender = db.senders.find((item) => item.id === message.senderId);
      await imapArchiveMessage(account, uid, sender?.displayName || message.fromName);
      archived += 1;
      db = {
        ...db,
        messages: db.messages.map((item) =>
          item.id === message.id
            ? {
                ...item,
                archived: true,
                archivedAt: item.archivedAt || new Date().toISOString(),
                outlookFolder: "archive",
                isRead: true,
                updatedAt: new Date().toISOString(),
              }
            : item,
        ),
      };
      db = addLog(db, {
        mailboxId,
        action: "archive",
        message: `Mail „${message.subject}“ per IMAP ins Archiv unter ${sender?.displayName || message.fromName} verschoben.`,
      });
    } catch (error) {
      db = addLog(db, {
        mailboxId,
        action: "error",
        message: `IMAP-Archivierung fehlgeschlagen: ${error instanceof Error ? error.message : "unbekannt"}`,
      });
    }
  }
  return { db, archived };
}

function markStale(db: MailverwaltungDb, mailboxId: string): { db: MailverwaltungDb; stale: number } {
  const limitMs = db.settings.staleHours * 60 * 60 * 1000;
  const now = Date.now();
  let stale = 0;
  const messages = db.messages.map((item) => {
    if (item.mailboxId !== mailboxId) return item;
    if (item.status === "erledigt" || item.staleWarnedAt) return item;
    const age = now - new Date(item.receivedAt).getTime();
    if (age < limitMs) return item;
    stale += 1;
    return { ...item, staleWarnedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  });
  if (!stale) return { db, stale: 0 };
  return {
    db: addLog(
      { ...db, messages },
      {
        mailboxId,
        action: "status",
        message: `${stale} Mail(s) länger als ${db.settings.staleHours} Stunden unbearbeitet.`,
      },
    ),
    stale,
  };
}

export async function syncMailbox(mailboxId: string): Promise<SyncResult> {
  let db = await readMailverwaltungDb();
  const mailbox = db.mailboxes.find((item) => item.id === mailboxId);
  if (!mailbox) {
    return { mailboxId, imported: 0, archived: 0, stale: 0, error: "Postfach nicht gefunden." };
  }
  if (!mailbox.syncEnabled) {
    return { mailboxId, imported: 0, archived: 0, stale: 0, error: "Synchronisation deaktiviert." };
  }

  const token = await getMailboxToken(mailboxId);
  const imapPassword = await getImapPassword(mailboxId);
  const useImap = mailbox.provider === "imap" && Boolean(imapPassword) && Boolean(mailbox.imapHost);
  let imported = 0;
  let archived = 0;

  if (useImap) {
    try {
      const account = mailboxToImapAccount(mailbox, imapPassword);
      const mails = await imapListMessages(account);
      const before = db.messages.length;
      for (const mail of mails) {
        db = await importImapMail(db, mailboxId, mail);
      }
      imported = db.messages.length - before;
      const pushed = await pushLocalStatusToImap(db, mailboxId, account);
      db = pushed.db;
      archived = pushed.archived;
      db = {
        ...db,
        mailboxes: db.mailboxes.map((item) =>
          item.id === mailboxId
            ? {
                ...item,
                connected: true,
                lastSyncAt: new Date().toISOString(),
                lastError: null,
                provider: "imap",
              }
            : item,
        ),
      };
      db = addLog(db, {
        mailboxId,
        action: "sync",
        message: `IMAP-Sync: ${imported} neu, ${archived} archiviert.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "IMAP-Sync fehlgeschlagen.";
      db = {
        ...db,
        mailboxes: db.mailboxes.map((item) =>
          item.id === mailboxId ? { ...item, lastError: message, lastSyncAt: new Date().toISOString() } : item,
        ),
      };
      db = addLog(db, { mailboxId, action: "error", message });
      const staleResult = markStale(db, mailboxId);
      await writeMailverwaltungDb(staleResult.db);
      return { mailboxId, imported, archived, stale: staleResult.stale, error: message };
    }
  } else if (token) {
    try {
      const accessToken = await getValidAccessToken(db.settings, mailboxId);
      const me = await graphMe(accessToken);
      const mails = await graphListMessages(accessToken);
      const before = db.messages.length;
      for (const mail of mails) {
        db = await importGraphMail(db, mailboxId, accessToken, mail);
      }
      imported = db.messages.length - before;
      const pushed = await pushLocalStatusToOutlook(db, mailboxId, accessToken);
      db = pushed.db;
      archived = pushed.archived;
      db = {
        ...db,
        mailboxes: db.mailboxes.map((item) =>
          item.id === mailboxId
            ? {
                ...item,
                connected: true,
                lastError: null,
                lastSyncAt: new Date().toISOString(),
                provider: "graph" as const,
                email: (me.mail || me.userPrincipalName || item.email).toLowerCase(),
                displayName: me.displayName || item.displayName,
              }
            : item,
        ),
      };
      db = addLog(db, {
        mailboxId,
        action: "sync",
        message: `Graph-Sync: ${imported} neu, ${archived} archiviert.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Graph-Sync fehlgeschlagen.";
      db = {
        ...db,
        mailboxes: db.mailboxes.map((item) =>
          item.id === mailboxId ? { ...item, lastError: message, lastSyncAt: new Date().toISOString() } : item,
        ),
      };
      db = addLog(db, { mailboxId, action: "error", message });
      const staleResult = markStale(db, mailboxId);
      await writeMailverwaltungDb(staleResult.db);
      return { mailboxId, imported, archived, stale: staleResult.stale, error: message };
    }
  } else {
    db = {
      ...db,
      mailboxes: db.mailboxes.map((item) =>
        item.id === mailboxId
          ? { ...item, lastSyncAt: new Date().toISOString(), lastError: null }
          : item,
      ),
    };
    db = addLog(db, {
      mailboxId,
      action: "sync",
      message: "Lokaler Sync ohne Outlook-Verbindung (Beispieldaten / manuelle Mails).",
    });
  }

  const staleResult = markStale(db, mailboxId);
  await writeMailverwaltungDb(staleResult.db);
  return { mailboxId, imported, archived, stale: staleResult.stale };
}

export async function syncAllMailboxes(): Promise<{ results: SyncResult[] }> {
  const db = await readMailverwaltungDb();
  const results: SyncResult[] = [];
  for (const mailbox of db.mailboxes.filter((item) => item.syncEnabled)) {
    results.push(await syncMailbox(mailbox.id));
  }
  return { results };
}

export async function setMessageStatus(
  messageId: string,
  status: MailMessage["status"],
): Promise<MailverwaltungDb> {
  let db = await readMailverwaltungDb();
  const current = db.messages.find((item) => item.id === messageId);
  if (!current) throw new Error("Mail nicht gefunden.");
  const now = new Date().toISOString();
  const archived = status === "erledigt";
  db = {
    ...db,
    messages: db.messages.map((item) =>
      item.id === messageId
        ? {
            ...item,
            status,
            archived,
            archivedAt: archived ? now : null,
            outlookFolder: archived ? "archive" : "inbox",
            isRead: status !== "neu" ? true : item.isRead,
            updatedAt: now,
          }
        : item,
    ),
  };
  db = addLog(db, {
    mailboxId: current.mailboxId,
    action: "status",
    message: `Status von „${current.subject}“ auf ${status} gesetzt.`,
  });
  if (archived) {
    db = addLog(db, {
      mailboxId: current.mailboxId,
      action: "archive",
      message: `Mail „${current.subject}“ lokal archiviert.`,
    });
  }
  db = await writeMailverwaltungDb(db);
  if (archived && current.graphId) {
    try {
      await syncMailbox(current.mailboxId);
      db = await readMailverwaltungDb();
    } catch {
      /* local archive bleibt */
    }
  }
  return db;
}

export function publicDb(db: MailverwaltungDb) {
  const unread = db.messages.filter((item) => item.status === "neu").length;
  const critical = db.messages.filter(
    (item) => item.priority === "kritisch" && item.status !== "erledigt",
  ).length;
  const stale = db.messages.filter((item) => Boolean(item.staleWarnedAt) && item.status !== "erledigt").length;
  return {
    settings: {
      ...db.settings,
      hasClientId: Boolean(db.settings.clientId),
    },
    mailboxes: db.mailboxes,
    senders: db.senders,
    messages: db.messages,
    files: db.files,
    logs: [...db.logs].reverse().slice(0, 200),
    stats: {
      unread,
      critical,
      stale,
      importantFiles: db.files.filter((item) => item.important).length,
    },
    senderKeys: db.senders.map((item) => senderKey(item.mailboxId, item.email)),
  };
}
