import { createId } from "@/lib/id";
import { classifyAttachment, inferSenderRole, prioritizeMail } from "./classify";
import {
  addLog,
  type MailFile,
  type MailMessage,
  type MailverwaltungDb,
  type SenderFolder,
} from "./types";

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

export function createSeedDb(): MailverwaltungDb {
  const mbxPhilipp = {
    id: "mbx-philipp",
    displayName: "Philipp Heyser",
    email: "philipp.heyser@acp.de",
    connected: false,
    lastSyncAt: hoursAgo(1),
    lastError: null,
    syncEnabled: true,
    createdAt: hoursAgo(240),
    provider: "none" as const,
    imapHost: "",
    imapPort: 993,
    imapSecure: true,
    imapUser: "philipp.heyser@acp.de",
    hasImapPassword: false,
  };
  const mbxService = {
    id: "mbx-service",
    displayName: "Service ACP",
    email: "service@acp.de",
    connected: false,
    lastSyncAt: hoursAgo(2),
    lastError: null,
    syncEnabled: true,
    createdAt: hoursAgo(240),
    provider: "none" as const,
    imapHost: "",
    imapPort: 993,
    imapSecure: true,
    imapUser: "service@acp.de",
    hasImapPassword: false,
  };

  const senders: SenderFolder[] = [
    {
      id: "snd-leitung",
      mailboxId: mbxPhilipp.id,
      email: "leitung@acp.de",
      displayName: "ACP Leitung",
      role: inferSenderRole("leitung@acp.de", "ACP Leitung"),
      createdAt: hoursAgo(200),
    },
    {
      id: "snd-kunde",
      mailboxId: mbxPhilipp.id,
      email: "einkauf@rudolph-holding.de",
      displayName: "Rudolph Holding Einkauf",
      role: inferSenderRole("einkauf@rudolph-holding.de", "Rudolph Holding"),
      createdAt: hoursAgo(120),
    },
    {
      id: "snd-hp",
      mailboxId: mbxPhilipp.id,
      email: "noreply@hp.com",
      displayName: "HP Warranty",
      role: inferSenderRole("noreply@hp.com", "HP"),
      createdAt: hoursAgo(80),
    },
    {
      id: "snd-finanzamt",
      mailboxId: mbxService.id,
      email: "poststelle@finanzamt.bund.de",
      displayName: "Finanzamt",
      role: inferSenderRole("poststelle@finanzamt.bund.de", "Finanzamt"),
      createdAt: hoursAgo(30),
    },
    {
      id: "snd-lieferant",
      mailboxId: mbxService.id,
      email: "invoice@distrelec.com",
      displayName: "Distrelec Rechnungen",
      role: inferSenderRole("invoice@distrelec.com", "Distrelec"),
      createdAt: hoursAgo(40),
    },
  ];

  const drafts: Array<{
    mailboxId: string;
    senderId: string;
    fromEmail: string;
    fromName: string;
    subject: string;
    body: string;
    hours: number;
    attachments: string[];
    status?: MailMessage["status"];
  }> = [
    {
      mailboxId: mbxPhilipp.id,
      senderId: "snd-leitung",
      fromEmail: "leitung@acp.de",
      fromName: "ACP Leitung",
      subject: "Sofort: Eskalation Kunde Rudolph",
      body: "Bitte heute noch Rückmeldung. Der Kunde droht mit Eskalation an die Geschäftsführung.",
      hours: 2,
      attachments: [],
    },
    {
      mailboxId: mbxPhilipp.id,
      senderId: "snd-kunde",
      fromEmail: "einkauf@rudolph-holding.de",
      fromName: "Rudolph Holding Einkauf",
      subject: "KV TVDAU1292412 – Freigabe und Frist",
      body: "Der Kostenvoranschlag muss bis Freitag bestätigt werden. Anhang: Angebot.",
      hours: 5,
      attachments: ["KV-TVDAU1292412.pdf"],
    },
    {
      mailboxId: mbxPhilipp.id,
      senderId: "snd-kunde",
      fromEmail: "einkauf@rudolph-holding.de",
      fromName: "Rudolph Holding Einkauf",
      subject: "Danke für den Einsatz letzte Woche",
      body: "Nur zur Kenntnis: der Einsatz in Sontra ist abgeschlossen.",
      hours: 30,
      attachments: [],
      status: "erledigt",
    },
    {
      mailboxId: mbxPhilipp.id,
      senderId: "snd-hp",
      fromEmail: "noreply@hp.com",
      fromName: "HP Warranty",
      subject: "Ihre Garantiebestätigung",
      body: "Automatische Bestätigung. Keine Antwort nötig.",
      hours: 10,
      attachments: ["garantie-bericht.pdf"],
    },
    {
      mailboxId: mbxService.id,
      senderId: "snd-finanzamt",
      fromEmail: "poststelle@finanzamt.bund.de",
      fromName: "Finanzamt",
      subject: "Bescheid – Frist 14 Tage",
      body: "Bitte den beigefügten Bescheid prüfen. Frist 14 Tage.",
      hours: 6,
      attachments: ["bescheid-formular.pdf"],
    },
    {
      mailboxId: mbxService.id,
      senderId: "snd-lieferant",
      fromEmail: "invoice@distrelec.com",
      fromName: "Distrelec",
      subject: "Rechnung 2026-88421",
      body: "Anbei die Rechnung über Ersatzteile.",
      hours: 4,
      attachments: ["Rechnung-2026-88421.pdf"],
    },
    {
      mailboxId: mbxService.id,
      senderId: "snd-lieferant",
      fromEmail: "invoice@distrelec.com",
      fromName: "Distrelec",
      subject: "Lieferschein und Fotos Wareneingang",
      body: "Fotos der Lieferung im Anhang.",
      hours: 18,
      attachments: ["wareneingang.jpg", "vertrag-rahmen.docx"],
      status: "in-bearbeitung",
    },
  ];

  const messages: MailMessage[] = [];
  const files: MailFile[] = [];

  for (const draft of drafts) {
    const classification = prioritizeMail({
      fromEmail: draft.fromEmail,
      fromName: draft.fromName,
      subject: draft.subject,
      bodyText: draft.body,
      hasAttachments: draft.attachments.length > 0,
      attachmentNames: draft.attachments,
      senderRole: senders.find((item) => item.id === draft.senderId)?.role ?? "unbekannt",
      previousCriticalCount: 0,
    });
    const receivedAt = hoursAgo(draft.hours);
    const status = draft.status ?? "neu";
    const archived = status === "erledigt";
    const message: MailMessage = {
      id: createId("msg"),
      mailboxId: draft.mailboxId,
      senderId: draft.senderId,
      graphId: null,
      graphConversationId: null,
      fromEmail: draft.fromEmail,
      fromName: draft.fromName,
      to: [draft.mailboxId === mbxPhilipp.id ? mbxPhilipp.email : mbxService.email],
      subject: draft.subject,
      preview: draft.body.slice(0, 140),
      bodyText: draft.body,
      receivedAt,
      isRead: status !== "neu",
      hasAttachments: draft.attachments.length > 0,
      status,
      priority: classification.priority,
      priorityReason: classification.reason,
      archived,
      archivedAt: archived ? hoursAgo(draft.hours - 1) : null,
      outlookFolder: archived ? "archive" : "inbox",
      flaggedCritical: classification.priority === "kritisch",
      escalatedAt: classification.priority === "kritisch" ? receivedAt : null,
      staleWarnedAt: null,
      createdAt: receivedAt,
      updatedAt: receivedAt,
    };
    messages.push(message);
    for (const name of draft.attachments) {
      const fileInfo = classifyAttachment(name);
      files.push({
        id: createId("mfile"),
        mailboxId: draft.mailboxId,
        messageId: message.id,
        senderId: draft.senderId,
        senderEmail: draft.fromEmail,
        name,
        mimeType: name.endsWith(".jpg")
          ? "image/jpeg"
          : name.endsWith(".docx")
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : "application/pdf",
        size: 48_000 + name.length * 120,
        category: fileInfo.category,
        important: fileInfo.important,
        storedName: null,
        receivedAt,
        graphAttachmentId: null,
      });
    }
  }

  let db: MailverwaltungDb = {
    version: 1,
    settings: {
      staleHours: 8,
      escalateCritical: true,
      copyToOneDrive: false,
      tenantId: "common",
      clientId: "",
      redirectUri: "",
    },
    mailboxes: [mbxPhilipp, mbxService],
    senders,
    messages,
    files,
    logs: [],
  };

  db = addLog(db, {
    mailboxId: null,
    action: "sync",
    message: "Beispieldaten für Mailverwaltung angelegt (zwei Postfächer).",
  });
  db = addLog(db, {
    mailboxId: mbxPhilipp.id,
    action: "priority",
    message: "Kritische Mail von ACP Leitung priorisiert.",
  });
  db = addLog(db, {
    mailboxId: mbxService.id,
    action: "file",
    message: "Rechnung Distrelec als wichtige Datei klassifiziert.",
  });
  return db;
}
