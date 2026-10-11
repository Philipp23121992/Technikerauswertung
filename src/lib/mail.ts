import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { applyMailTemplate, renderMailTemplate } from "@/lib/mail-templates/render";
import type { MailTemplateId } from "@/lib/mail-templates/types";
import {
  isSmtpConfigReady,
  readSmtpConfig,
  type SmtpConfig,
} from "./smtp-config";

export const SMTP_SETUP_HINT =
  "E-Mail ist nicht konfiguriert. Bitte unter Einstellung → E-Mail / SMTP einrichten.";

export type ReminderMailPayload = {
  to: string;
  assigneeName: string;
  agendaText: string;
  dueDate: string;
  protocolTitle: string;
  meetingKindLabel: string;
};

function extractEmail(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim().toLowerCase();
}

function extractDisplayName(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^(.*)<[^>]+>\s*$/);
  const name = match ? match[1].trim().replace(/^"|"$/g, "") : "";
  return name || "APM Servicetools";
}

function parseRecipients(to: string): string[] {
  return [
    ...new Set(
      to
        .split(/[,;]/)
        .map((item) => extractEmail(item))
        .filter((item) => item.includes("@")),
    ),
  ];
}

/** OVH u. a. akzeptieren From nur, wenn es dem SMTP-Login entspricht. */
function mailIdentity(config: SmtpConfig): {
  from: string;
  replyTo?: string;
  envelopeFrom: string;
} {
  const authUser = config.user.trim();
  const desiredFrom = extractEmail(config.from || authUser) || authUser.toLowerCase();
  const display = extractDisplayName(config.from || authUser);
  const replyTo =
    desiredFrom && desiredFrom !== authUser.toLowerCase() ? desiredFrom : undefined;
  return {
    from: `${display} <${authUser}>`,
    replyTo,
    envelopeFrom: authUser,
  };
}

function isOvhHost(host: string): boolean {
  return /(^|\.)ovh\.(net|com)$/i.test(host.trim());
}

function createTransport(config: SmtpConfig) {
  const port = config.port;
  const secure = config.secure || port === 465;
  const user = config.user.trim();
  const pass = config.pass;
  const options: SMTPTransport.Options = {
    host: config.host.trim(),
    port,
    secure,
    requireTLS: !secure && port === 587,
    authMethod: isOvhHost(config.host) ? "LOGIN" : undefined,
    auth: {
      user,
      pass,
    },
    tls: {
      minVersion: "TLSv1.2",
      servername: config.host.trim(),
    },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 25_000,
  };
  return nodemailer.createTransport(options);
}

export function formatSmtpError(error: unknown): string {
  if (!(error instanceof Error) && typeof error !== "object") {
    return "SMTP-Versand fehlgeschlagen.";
  }
  const err = error as {
    message?: string;
    code?: string;
    command?: string;
    response?: string;
    responseCode?: number;
  };
  const text = `${err.response ?? ""} ${err.message ?? ""}`;
  if (
    err.responseCode === 553 ||
    err.responseCode === 554 ||
    err.responseCode === 550 ||
    /sender address rejected|not owned by user|send as this sender|data not accepted|nicht berechtigt/i.test(
      text,
    )
  ) {
    return "Der SMTP-Server hat den Absender abgelehnt. From muss dieselbe Adresse sein wie der SMTP-Benutzer (bei OVH Pflicht).";
  }
  if (err.code === "EAUTH" || err.responseCode === 535) {
    return "OVH hat die Anmeldung abgelehnt (535 Authentication failed). Host und Port sind erreichbar, Login oder Passwort der Mailbox stimmen nicht. Benutzer muss ein echtes Postfach aus dem OVH-Kundencenter sein (volle Adresse, kein Alias wie postmaster@). Passwort dort neu setzen, hier speichern und Test erneut senden. Absender = dieselbe Adresse wie der SMTP-Benutzer.";
  }
  if (
    err.code === "ESOCKET" ||
    err.code === "ECONNECTION" ||
    err.code === "ETIMEDOUT" ||
    err.code === "EDNS"
  ) {
    return "Keine Verbindung zum SMTP-Server. Host, Port und SSL/TLS prüfen (OVH: Port 465 mit SSL).";
  }
  if (/no recipients defined/i.test(text)) {
    return "Kein Empfänger angegeben. Bitte eine gültige E-Mail-Adresse eintragen.";
  }
  if (err.message) return err.message;
  return "SMTP-Versand fehlgeschlagen.";
}

async function sendConfiguredMail(
  config: SmtpConfig,
  message: {
    to: string;
    cc?: string;
    subject: string;
    text: string;
  },
): Promise<void> {
  const recipients = parseRecipients(message.to);
  if (recipients.length === 0) {
    throw new Error("Kein Empfänger angegeben. Bitte eine gültige E-Mail-Adresse eintragen.");
  }
  const ccRecipients = message.cc?.trim() ? parseRecipients(message.cc) : [];
  const identity = mailIdentity(config);
  const transporter = createTransport(config);
  try {
    await transporter.sendMail({
      from: identity.from,
      replyTo: identity.replyTo,
      envelope: {
        from: identity.envelopeFrom,
        to: [...recipients, ...ccRecipients],
      },
      to: recipients.join(", "),
      ...(ccRecipients.length ? { cc: ccRecipients.join(", ") } : {}),
      subject: message.subject,
      text: message.text,
    });
  } catch (error) {
    throw new Error(formatSmtpError(error));
  }
}

export async function isMailConfigured(): Promise<boolean> {
  const config = await readSmtpConfig();
  return isSmtpConfigReady(config);
}

async function sendTemplatedMail(
  to: string | string[],
  templateId: MailTemplateId,
  vars: Record<string, string>,
): Promise<boolean> {
  const config = await readSmtpConfig();
  if (!isSmtpConfigReady(config)) {
    throw new Error(SMTP_SETUP_HINT);
  }
  const recipients = [...new Set(
    (Array.isArray(to) ? to : [to]).map((item) => item.trim()).filter((item) => item.includes("@")),
  )];
  if (recipients.length === 0) return false;

  const rendered = await renderMailTemplate(templateId, vars);
  if (!rendered) return false;

  await sendConfiguredMail(config, {
    to: recipients.join(", "),
    subject: rendered.subject,
    text: rendered.text,
  });
  return true;
}

export async function sendTestMailFromTemplate(input: {
  to: string;
  id: MailTemplateId;
  vars: Record<string, string>;
  subject?: string;
  bodyText?: string;
}): Promise<void> {
  const config = await readSmtpConfig();
  if (!isSmtpConfigReady(config)) {
    throw new Error("SMTP ist noch nicht vollständig konfiguriert.");
  }
  const subject = input.subject?.trim()
    ? applyMailTemplate(input.subject, input.vars)
    : (await renderMailTemplate(input.id, input.vars))?.subject;
  const text = input.bodyText?.trim()
    ? applyMailTemplate(input.bodyText, input.vars)
    : (await renderMailTemplate(input.id, input.vars))?.text;
  if (!subject || !text) {
    throw new Error("Vorlage ist deaktiviert oder leer.");
  }
  await sendConfiguredMail(config, { to: input.to, subject, text });
}

export async function sendAgendaReminderMail(
  payload: ReminderMailPayload,
): Promise<boolean> {
  const dueLabel = payload.dueDate.split("-").reverse().join(".");
  return sendTemplatedMail(payload.to, "meetings-due", {
    assigneeName: payload.assigneeName || "Team",
    agendaText: payload.agendaText,
    dueDate: dueLabel,
    protocolTitle: payload.protocolTitle,
    meetingKindLabel: payload.meetingKindLabel,
  });
}

export async function sendPlainTextMail(message: {
  to: string;
  cc?: string;
  subject: string;
  text: string;
}): Promise<void> {
  const config = await readSmtpConfig();
  if (!isSmtpConfigReady(config)) {
    throw new Error(SMTP_SETUP_HINT);
  }
  await sendConfiguredMail(config, message);
}

export async function sendTestMail(to: string): Promise<void> {
  const config = await readSmtpConfig();
  if (!isSmtpConfigReady(config)) {
    throw new Error("SMTP ist noch nicht vollständig konfiguriert.");
  }

  const transporter = createTransport(config);
  try {
    await transporter.verify();
  } catch (error) {
    throw new Error(formatSmtpError(error));
  }
  await sendConfiguredMail(config, {
    to,
    subject: "APM Servicetools – SMTP-Test",
    text: [
      "Dies ist eine Testmail aus APM Servicetools.",
      "",
      "Wenn du diese Nachricht siehst, funktioniert der SMTP-Versand.",
    ].join("\n"),
  });
}

export type TaskReminderMailPayload = {
  to: string;
  title: string;
  description?: string;
  dueDate: string | null;
  kind: "due" | "rhythm";
};

export async function sendTaskReminderMail(
  payload: TaskReminderMailPayload,
): Promise<boolean> {
  const dueLabel = payload.dueDate
    ? payload.dueDate.split("-").reverse().join(".")
    : "ohne Datum";
  const description = payload.description?.trim()
    ? `Beschreibung: ${payload.description.trim()}`
    : "";
  return sendTemplatedMail(
    payload.to,
    payload.kind === "due" ? "aufgaben-due" : "aufgaben-rhythm",
    {
      title: payload.title,
      description,
      dueDate: dueLabel,
    },
  );
}

export type ServiceboardDueMailPayload = {
  to: string[];
  title: string;
  columnLabel: string;
  dueDate: string;
  priorityLabel: string;
  statusLabel: string;
};

export async function sendServiceboardDueMail(
  payload: ServiceboardDueMailPayload,
): Promise<boolean> {
  const dueLabel = payload.dueDate.split("-").reverse().join(".");
  return sendTemplatedMail(payload.to, "serviceboard-due", {
    title: payload.title,
    columnLabel: payload.columnLabel,
    dueDate: dueLabel,
    priorityLabel: payload.priorityLabel,
    statusLabel: payload.statusLabel,
  });
}

export type ServiceboardAssignMailPayload = {
  to: string[];
  title: string;
  columnLabel: string;
  dueDate: string | null;
  priorityLabel: string;
  statusLabel: string;
};

export async function sendServiceboardAssignMail(
  payload: ServiceboardAssignMailPayload,
): Promise<boolean> {
  const dueLabel = payload.dueDate
    ? payload.dueDate.split("-").reverse().join(".")
    : "ohne Datum";
  return sendTemplatedMail(payload.to, "serviceboard-assign", {
    title: payload.title,
    columnLabel: payload.columnLabel,
    dueDate: dueLabel,
    priorityLabel: payload.priorityLabel,
    statusLabel: payload.statusLabel,
  });
}

export type DueItemMailPayload = {
  to: string[];
  subject: string;
  greetingName?: string;
  intro: string;
  lines: string[];
  footer?: string;
};

export async function sendDueItemMail(payload: DueItemMailPayload): Promise<boolean> {
  const config = await readSmtpConfig();
  if (!isSmtpConfigReady(config)) {
    throw new Error(SMTP_SETUP_HINT);
  }

  const recipients = [...new Set(payload.to.filter((item) => item.includes("@")))];
  if (recipients.length === 0) return false;

  const greeting = payload.greetingName?.trim()
    ? `Hallo ${payload.greetingName.trim()},`
    : "Hallo,";

  await sendConfiguredMail(config, {
    to: recipients.join(", "),
    subject: payload.subject,
    text: [
      greeting,
      "",
      payload.intro,
      "",
      ...payload.lines,
      "",
      payload.footer ?? "APM Servicetools",
    ].join("\n"),
  });
  return true;
}

export async function sendProjekteDueMail(payload: {
  to: string[];
  title: string;
  dueDate: string;
  status: string;
  priority: string;
  ownerName: string;
}): Promise<boolean> {
  return sendTemplatedMail(payload.to, "projekte-due", {
    title: payload.title,
    dueDate: payload.dueDate,
    status: payload.status,
    priority: payload.priority,
    ownerName: payload.ownerName || "—",
  });
}

export async function sendDienstreisenDueMail(payload: {
  to: string[];
  title: string;
  traveler: string;
  dueDate: string;
  status: string;
  priority: string;
}): Promise<boolean> {
  return sendTemplatedMail(payload.to, "dienstreisen-due", {
    title: payload.title,
    traveler: payload.traveler || "Team",
    dueDate: payload.dueDate,
    status: payload.status,
    priority: payload.priority,
  });
}

export async function sendHpInvoiceReminderMail(payload: {
  to: string[];
  assigneeName: string;
  invoiceNumber: string;
  hpOrderNumber: string;
  ticketNumber: string;
  dueDate: string | null;
  amount: string;
  status: string;
}): Promise<boolean> {
  const dueLabel = payload.dueDate
    ? payload.dueDate.split("-").reverse().join(".")
    : "ohne Datum";
  return sendTemplatedMail(payload.to, "hp-rechnungen-rhythm", {
    assigneeName: payload.assigneeName || "Team",
    invoiceNumber: payload.invoiceNumber || "—",
    hpOrderNumber: payload.hpOrderNumber || "—",
    ticketNumber: payload.ticketNumber || "—",
    dueDate: dueLabel,
    amount: payload.amount || "—",
    status: payload.status,
  });
}

export async function sendKostenvoranschlagDueMail(payload: {
  to: string[];
  assigneeName: string;
  processingNumber: string;
  quoteNumber: string;
  customer: string;
  validUntil: string | null;
  amount: string;
  status: string;
}): Promise<boolean> {
  const dueLabel = payload.validUntil
    ? payload.validUntil.split("-").reverse().join(".")
    : "ohne Datum";
  return sendTemplatedMail(payload.to, "kostenvoranschlaege-due", {
    assigneeName: payload.assigneeName || "Team",
    processingNumber: payload.processingNumber || "—",
    quoteNumber: payload.quoteNumber || "—",
    customer: payload.customer || "—",
    validUntil: dueLabel,
    amount: payload.amount || "—",
    status: payload.status,
  });
}
