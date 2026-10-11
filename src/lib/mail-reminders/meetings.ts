import { writeJsonAtomic } from "@/lib/atomic-write";
import {
  MEETINGS_RES_STORE_PATH,
  MEETINGS_TECH_STORE_PATH,
  readLocalBackup,
} from "@/lib/local-backup";
import { isMailConfigured, sendAgendaReminderMail } from "@/lib/mail";
import {
  isAgendaDue,
  meetingKindLabel,
  todayIso,
  type MeetingKind,
  type MeetingStoreState,
} from "@/lib/meetings/types";
import { loadAddressBook, lookupEmails } from "./addresses";

export type MeetingsReminderResult = {
  sent: number;
  skipped: number;
  errors: string[];
  mailConfigured: boolean;
};

export async function processMeetingsReminders(): Promise<MeetingsReminderResult> {
  const mailConfigured = await isMailConfigured();
  if (!mailConfigured) {
    return { sent: 0, skipped: 0, errors: [], mailConfigured: false };
  }

  const backup = await readLocalBackup();
  const book = await loadAddressBook();
  const today = todayIso();
  const now = new Date().toISOString();
  const errors: string[] = [];
  let sent = 0;
  let skipped = 0;

  const nextTechniker = await processStore(
    backup.meetingsTechniker,
    "techniker",
    book,
    today,
    now,
    errors,
  );
  sent += nextTechniker.sent;
  skipped += nextTechniker.skipped;

  const nextRessourcen = await processStore(
    backup.meetingsRessourcen,
    "ressourcen",
    book,
    today,
    now,
    errors,
  );
  sent += nextRessourcen.sent;
  skipped += nextRessourcen.skipped;

  if (nextTechniker.changed) {
    await writeJsonAtomic(MEETINGS_TECH_STORE_PATH, nextTechniker.store);
  }
  if (nextRessourcen.changed) {
    await writeJsonAtomic(MEETINGS_RES_STORE_PATH, nextRessourcen.store);
  }

  return { sent, skipped, errors, mailConfigured: true };
}

async function processStore(
  store: MeetingStoreState,
  kind: MeetingKind,
  book: Awaited<ReturnType<typeof loadAddressBook>>,
  today: string,
  now: string,
  errors: string[],
): Promise<{ store: MeetingStoreState; sent: number; skipped: number; changed: boolean }> {
  let sent = 0;
  let skipped = 0;
  let changed = false;

  const protocols = [];
  for (const protocol of store.protocols) {
    let agendaChanged = false;
    const agenda = [];

    for (const item of protocol.agenda) {
      if (!isAgendaDue(item, today) || item.reminderSentAt) {
        agenda.push(item);
        continue;
      }

      const recipients = lookupEmails(book, {
        ids: item.assigneeId ? [item.assigneeId] : [],
        names: item.assigneeName ? [item.assigneeName] : [],
        emails: item.assigneeEmail ? [item.assigneeEmail] : [],
      });

      if (recipients.length === 0) {
        skipped += 1;
        agenda.push(item);
        continue;
      }

      try {
        const sentMail = await sendAgendaReminderMail({
          to: recipients[0],
          assigneeName: item.assigneeName,
          agendaText: item.text,
          dueDate: item.dueDate,
          protocolTitle: protocol.title,
          meetingKindLabel: meetingKindLabel(kind),
        });
        if (!sentMail) {
          agenda.push(item);
          continue;
        }
        agenda.push({
          ...item,
          assigneeEmail: item.assigneeEmail || recipients[0],
          reminderSentAt: now,
        });
        agendaChanged = true;
        sent += 1;
      } catch (error) {
        errors.push(
          error instanceof Error
            ? `Meeting „${item.text}“: ${error.message}`
            : `Meeting „${item.text}“ fehlgeschlagen`,
        );
        agenda.push(item);
      }
    }

    if (agendaChanged) {
      changed = true;
      protocols.push({ ...protocol, agenda, updatedAt: now });
    } else {
      protocols.push(protocol);
    }
  }

  return {
    store: changed ? { ...store, protocols, savedAt: now } : store,
    sent,
    skipped,
    changed,
  };
}
