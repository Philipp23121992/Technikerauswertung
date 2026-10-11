import { isMailConfigured, sendKostenvoranschlagDueMail } from "@/lib/mail";
import { readQuoteAssigneesDb } from "./assignees-db";
import { readKostenvoranschlaegeDb, writeKostenvoranschlaegeDb } from "./db";
import {
  QUOTE_STATUS_LABELS,
  shouldSendQuoteDueMail,
  todayIso,
  type CostQuote,
} from "./types";

export type QuoteReminderResult = {
  sent: number;
  skipped: number;
  errors: string[];
  mailConfigured: boolean;
};

let inFlight: Promise<QuoteReminderResult> | null = null;

export async function processKostenvoranschlagReminders(): Promise<QuoteReminderResult> {
  if (inFlight) return inFlight;
  inFlight = runProcess().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runProcess(): Promise<QuoteReminderResult> {
  const mailConfigured = await isMailConfigured();
  const db = await readKostenvoranschlaegeDb();
  if (!mailConfigured) {
    return { sent: 0, skipped: 0, errors: [], mailConfigured: false };
  }

  const { assignees } = await readQuoteAssigneesDb();
  const byId = new Map(assignees.map((item) => [item.id, item]));
  const today = todayIso();
  const now = new Date().toISOString();
  const errors: string[] = [];
  let sent = 0;
  let skipped = 0;
  const next: CostQuote[] = [];

  for (const quote of db.quotes) {
    if (!shouldSendQuoteDueMail(quote, today)) {
      next.push(quote);
      continue;
    }

    const person = quote.assigneeId ? byId.get(quote.assigneeId) : undefined;
    const email = person?.email.trim() ?? "";
    if (!email.includes("@")) {
      skipped += 1;
      next.push(quote);
      continue;
    }

    const label = quote.processingNumber || quote.quoteNumber || quote.id;
    try {
      const sentMail = await sendKostenvoranschlagDueMail({
        to: [email],
        assigneeName: person?.name || quote.assignee || "Team",
        processingNumber: quote.processingNumber,
        quoteNumber: quote.quoteNumber,
        customer: quote.customer,
        validUntil: quote.validUntil,
        amount: quote.amount ? `${quote.amount} ${quote.currency}`.trim() : "",
        status: QUOTE_STATUS_LABELS[quote.status],
      });
      if (!sentMail) {
        next.push(quote);
        continue;
      }
      sent += 1;
      next.push({
        ...quote,
        dueMailSentAt: now,
        dueMailForDate: quote.validUntil,
        updatedAt: now,
      });
    } catch (error) {
      errors.push(
        error instanceof Error
          ? `KV ${label}: ${error.message}`
          : `KV ${label} fehlgeschlagen`,
      );
      next.push(quote);
    }
  }

  if (sent > 0) {
    await writeKostenvoranschlaegeDb({ version: 1, quotes: next });
  }

  return { sent, skipped, errors, mailConfigured: true };
}
