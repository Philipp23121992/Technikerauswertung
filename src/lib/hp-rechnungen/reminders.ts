import { isMailConfigured, sendHpInvoiceReminderMail } from "@/lib/mail";
import { loadAddressBook, lookupEmails } from "@/lib/mail-reminders/addresses";
import { readHpRechnungenDb, writeHpRechnungenDb } from "./db";
import {
  INVOICE_STATUS_LABELS,
  shouldSendInvoiceRhythmMail,
  todayIso,
  type HpInvoice,
} from "./types";

export type HpInvoiceReminderResult = {
  sent: number;
  skipped: number;
  errors: string[];
  mailConfigured: boolean;
};

let inFlight: Promise<HpInvoiceReminderResult> | null = null;

export async function processHpInvoiceReminders(): Promise<HpInvoiceReminderResult> {
  if (inFlight) return inFlight;
  inFlight = runProcess().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runProcess(): Promise<HpInvoiceReminderResult> {
  const mailConfigured = await isMailConfigured();
  const db = await readHpRechnungenDb();
  if (!mailConfigured) {
    return { sent: 0, skipped: 0, errors: [], mailConfigured: false };
  }

  const book = await loadAddressBook();
  const today = todayIso();
  const now = new Date().toISOString();
  const errors: string[] = [];
  let sent = 0;
  let skipped = 0;
  const next: HpInvoice[] = [];

  for (const invoice of db.invoices) {
    if (!shouldSendInvoiceRhythmMail(invoice, today)) {
      next.push(invoice);
      continue;
    }

    const recipients = lookupEmails(book, {
      names: invoice.reminderName ? [invoice.reminderName] : [],
      emails: invoice.reminderEmail ? [invoice.reminderEmail] : [],
    });

    if (recipients.length === 0) {
      skipped += 1;
      next.push(invoice);
      continue;
    }

    try {
      const sentMail = await sendHpInvoiceReminderMail({
        to: recipients,
        assigneeName: invoice.reminderName || invoice.assignee,
        invoiceNumber: invoice.invoiceNumber,
        hpOrderNumber: invoice.hpOrderNumber,
        ticketNumber: invoice.ticketNumber,
        dueDate: invoice.dueDate,
        amount: invoice.amount
          ? `${invoice.amount} ${invoice.currency}`.trim()
          : "",
        status: INVOICE_STATUS_LABELS[invoice.status],
      });
      if (!sentMail) {
        next.push(invoice);
        continue;
      }
      sent += 1;
      next.push({
        ...invoice,
        reminderEmail: invoice.reminderEmail || recipients[0],
        lastReminderSentAt: now,
        updatedAt: now,
      });
    } catch (error) {
      errors.push(
        error instanceof Error
          ? `HP-Rechnung ${invoice.invoiceNumber || invoice.id}: ${error.message}`
          : `HP-Rechnung ${invoice.invoiceNumber || invoice.id} fehlgeschlagen`,
      );
      next.push(invoice);
    }
  }

  if (sent > 0) {
    await writeHpRechnungenDb({ version: 1, invoices: next });
  }

  return { sent, skipped, errors, mailConfigured: true };
}
