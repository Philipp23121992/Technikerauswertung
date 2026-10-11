import { processAufgabenReminders } from "@/lib/aufgaben/reminders";
import { processKostenvoranschlagReminders } from "@/lib/kostenvoranschlaege/reminders";
import { processHpInvoiceReminders } from "@/lib/hp-rechnungen/reminders";
import { isMailConfigured } from "@/lib/mail";
import { processServiceboardReminders } from "@/lib/serviceboard/reminders";
import { processDienstreisenReminders } from "./dienstreisen";
import { processMeetingsReminders } from "./meetings";
import { processProjekteReminders } from "./projekte";

export type AllRemindersResult = {
  mailConfigured: boolean;
  sent: number;
  skipped: number;
  errors: string[];
  aufgaben: number;
  serviceboard: number;
  meetings: number;
  projekte: number;
  dienstreisen: number;
  hprechnungen: number;
  kostenvoranschlaege: number;
};

let inFlight: Promise<AllRemindersResult> | null = null;

export async function processAllReminders(): Promise<AllRemindersResult> {
  if (inFlight) return inFlight;
  inFlight = runAll().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runAll(): Promise<AllRemindersResult> {
  const mailConfigured = await isMailConfigured();
  if (!mailConfigured) {
    return {
      mailConfigured: false,
      sent: 0,
      skipped: 0,
      errors: [],
      aufgaben: 0,
      serviceboard: 0,
      meetings: 0,
      projekte: 0,
      dienstreisen: 0,
      hprechnungen: 0,
      kostenvoranschlaege: 0,
    };
  }

  const aufgaben = await processAufgabenReminders();
  const serviceboard = await processServiceboardReminders();
  const meetings = await processMeetingsReminders();
  const projekte = await processProjekteReminders();
  const dienstreisen = await processDienstreisenReminders();
  const hprechnungen = await processHpInvoiceReminders();
  const kostenvoranschlaege = await processKostenvoranschlagReminders();

  const errors = [
    ...aufgaben.errors.map((item) => `Aufgaben: ${item}`),
    ...serviceboard.errors.map((item) => `Serviceboard: ${item}`),
    ...meetings.errors.map((item) => `Meetings: ${item}`),
    ...projekte.errors.map((item) => `Projekte: ${item}`),
    ...dienstreisen.errors.map((item) => `Dienstreisen: ${item}`),
    ...hprechnungen.errors.map((item) => `HP-Rechnungen: ${item}`),
    ...kostenvoranschlaege.errors.map((item) => `Kostenvoranschläge: ${item}`),
  ];

  return {
    mailConfigured: true,
    sent:
      aufgaben.sent +
      serviceboard.sent +
      meetings.sent +
      projekte.sent +
      dienstreisen.sent +
      hprechnungen.sent +
      kostenvoranschlaege.sent,
    skipped:
      meetings.skipped +
      projekte.skipped +
      dienstreisen.skipped +
      hprechnungen.skipped +
      kostenvoranschlaege.skipped,
    errors,
    aufgaben: aufgaben.sent,
    serviceboard: serviceboard.sent,
    meetings: meetings.sent,
    projekte: projekte.sent,
    dienstreisen: dienstreisen.sent,
    hprechnungen: hprechnungen.sent,
    kostenvoranschlaege: kostenvoranschlaege.sent,
  };
}
