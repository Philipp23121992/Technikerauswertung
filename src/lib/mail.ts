import nodemailer from "nodemailer";
import {
  isSmtpConfigReady,
  readSmtpConfig,
  type SmtpConfig,
} from "./smtp-config";

export type ReminderMailPayload = {
  to: string;
  assigneeName: string;
  agendaText: string;
  dueDate: string;
  protocolTitle: string;
  meetingKindLabel: string;
};

function createTransport(config: SmtpConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure || config.port === 465,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
}

export async function isMailConfigured(): Promise<boolean> {
  const config = await readSmtpConfig();
  return isSmtpConfigReady(config);
}

export async function sendAgendaReminderMail(
  payload: ReminderMailPayload,
): Promise<void> {
  const config = await readSmtpConfig();
  if (!isSmtpConfigReady(config)) {
    throw new Error(
      "E-Mail ist nicht konfiguriert. Bitte unter Meetings → E-Mail / SMTP einrichten.",
    );
  }

  const dueLabel = payload.dueDate.split("-").reverse().join(".");
  const transporter = createTransport(config);

  await transporter.sendMail({
    from: config.from || config.user,
    to: payload.to,
    subject: `Erinnerung: ${payload.agendaText}`,
    text: [
      `Hallo ${payload.assigneeName || "Team"},`,
      "",
      `Erinnerung zu einem Agenda-Punkt aus „${payload.protocolTitle}“ (${payload.meetingKindLabel}).`,
      "",
      `Aufgabe: ${payload.agendaText}`,
      `Fällig am: ${dueLabel}`,
      "",
      "Bitte den Punkt zeitnah bearbeiten bzw. im Meeting-Protokoll aktualisieren.",
      "",
      "APM Servicetools",
    ].join("\n"),
  });
}

export async function sendTestMail(to: string): Promise<void> {
  const config = await readSmtpConfig();
  if (!isSmtpConfigReady(config)) {
    throw new Error("SMTP ist noch nicht vollständig konfiguriert.");
  }

  const transporter = createTransport(config);
  await transporter.verify();
  await transporter.sendMail({
    from: config.from || config.user,
    to,
    subject: "APM Servicetools – SMTP-Test",
    text: [
      "Dies ist eine Testmail aus APM Servicetools.",
      "",
      "Wenn du diese Nachricht siehst, funktioniert der SMTP-Versand.",
    ].join("\n"),
  });
}
