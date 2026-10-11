import {
  isMailConfigured,
  sendServiceboardAssignMail,
  sendServiceboardDueMail,
} from "@/lib/mail";
import { readServiceboardDb, writeServiceboardDb } from "./db";
import {
  BOARD_COLUMNS,
  CARD_PRIORITY_LABELS,
  CARD_STATUS_LABELS,
  dueMailKey,
  emailsForColumn,
  shouldSendColumnDueMail,
  todayIsoLocal,
  type BoardCard,
} from "./types";

export type ServiceboardReminderResult = {
  sent: number;
  errors: string[];
  cards: BoardCard[];
  mailConfigured: boolean;
};

let inFlight: Promise<ServiceboardReminderResult> | null = null;

export async function processServiceboardReminders(): Promise<ServiceboardReminderResult> {
  if (inFlight) return inFlight;
  inFlight = runProcess().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runProcess(): Promise<ServiceboardReminderResult> {
  const mailConfigured = await isMailConfigured();
  const db = await readServiceboardDb();
  if (!mailConfigured) {
    return {
      sent: 0,
      errors: [],
      cards: db.cards,
      mailConfigured: false,
    };
  }

  const today = todayIsoLocal();
  const errors: string[] = [];
  let sent = 0;
  const nextCards: BoardCard[] = [];

  for (const card of db.cards) {
    if (!shouldSendColumnDueMail(card, today)) {
      nextCards.push(card);
      continue;
    }

    const column = BOARD_COLUMNS.find((item) => item.id === card.columnId);
    const recipients = emailsForColumn(card.columnId);
    const key = dueMailKey(card.columnId, card.dueDate);

    try {
      const sentMail = await sendServiceboardDueMail({
        to: recipients,
        title: card.title,
        columnLabel: column?.label ?? card.columnId,
        dueDate: card.dueDate!,
        priorityLabel: CARD_PRIORITY_LABELS[card.priority],
        statusLabel: CARD_STATUS_LABELS[card.status],
      });
      if (!sentMail) {
        nextCards.push(card);
        continue;
      }
      sent += 1;
      nextCards.push({
        ...card,
        dueMailSentKey: key,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      errors.push(
        error instanceof Error
          ? `Fälligkeit „${card.title}“: ${error.message}`
          : `Fälligkeit „${card.title}“ fehlgeschlagen`,
      );
      nextCards.push(card);
    }
  }

  const saved =
    sent > 0
      ? await writeServiceboardDb({ version: 1, cards: nextCards })
      : { version: 1 as const, cards: nextCards };

  return {
    sent,
    errors,
    cards: saved.cards,
    mailConfigured: true,
  };
}

export async function processServiceboardAssignmentMails(
  previous: BoardCard[],
  next: BoardCard[],
): Promise<{ sent: number; errors: string[] }> {
  if (!(await isMailConfigured())) {
    return { sent: 0, errors: [] };
  }

  const previousById = new Map(previous.map((card) => [card.id, card]));
  const errors: string[] = [];
  let sent = 0;

  for (const card of next) {
    const before = previousById.get(card.id);
    if (before && before.columnId === card.columnId) continue;

    const recipients = emailsForColumn(card.columnId);
    if (recipients.length === 0) continue;

    const column = BOARD_COLUMNS.find((item) => item.id === card.columnId);
    try {
      const sentMail = await sendServiceboardAssignMail({
        to: recipients,
        title: card.title,
        columnLabel: column?.label ?? card.columnId,
        dueDate: card.dueDate,
        priorityLabel: CARD_PRIORITY_LABELS[card.priority],
        statusLabel: CARD_STATUS_LABELS[card.status],
      });
      if (sentMail) sent += 1;
    } catch (error) {
      errors.push(
        error instanceof Error
          ? `Zuweisung „${card.title}“: ${error.message}`
          : `Zuweisung „${card.title}“ fehlgeschlagen`,
      );
    }
  }

  return { sent, errors };
}
