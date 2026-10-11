import { isMailConfigured, sendDienstreisenDueMail } from "@/lib/mail";
import { readDienstreisenDb, writeDienstreisenDb } from "@/lib/dienstreisen/db";
import {
  TRIP_PRIORITY_LABELS,
  TRIP_STATUS_LABELS,
  type BusinessTrip,
} from "@/lib/dienstreisen/types";
import { todayIso } from "@/lib/meetings/types";
import { loadAddressBook, lookupEmails } from "./addresses";

export type DienstreisenReminderResult = {
  sent: number;
  skipped: number;
  errors: string[];
  mailConfigured: boolean;
};

export async function processDienstreisenReminders(): Promise<DienstreisenReminderResult> {
  const mailConfigured = await isMailConfigured();
  const db = await readDienstreisenDb();
  if (!mailConfigured) {
    return { sent: 0, skipped: 0, errors: [], mailConfigured: false };
  }

  const book = await loadAddressBook();
  const today = todayIso();
  const now = new Date().toISOString();
  const errors: string[] = [];
  let sent = 0;
  let skipped = 0;
  const next: BusinessTrip[] = [];

  for (const trip of db.trips) {
    if (trip.archived || !trip.dueDate || trip.dueDate > today || trip.dueMailSentAt) {
      next.push(trip);
      continue;
    }

    const recipients = lookupEmails(book, {
      names: trip.traveler ? [trip.traveler] : [],
    });

    if (recipients.length === 0) {
      skipped += 1;
      next.push(trip);
      continue;
    }

    const dueLabel = trip.dueDate.split("-").reverse().join(".");
    try {
      const sentMail = await sendDienstreisenDueMail({
        to: recipients,
        title: trip.title,
        traveler: trip.traveler,
        dueDate: dueLabel,
        status: TRIP_STATUS_LABELS[trip.status],
        priority: TRIP_PRIORITY_LABELS[trip.priority],
      });
      if (!sentMail) {
        next.push(trip);
        continue;
      }
      sent += 1;
      next.push({ ...trip, dueMailSentAt: now, updatedAt: now });
    } catch (error) {
      errors.push(
        error instanceof Error
          ? `Dienstreise „${trip.title}“: ${error.message}`
          : `Dienstreise „${trip.title}“ fehlgeschlagen`,
      );
      next.push(trip);
    }
  }

  if (sent > 0) {
    await writeDienstreisenDb({ version: 1, trips: next });
  }

  return { sent, skipped, errors, mailConfigured: true };
}
