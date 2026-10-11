import { isMailConfigured, sendTaskReminderMail } from "@/lib/mail";
import { readAufgabenDb, writeAufgabenDb } from "./db";
import {
  shouldSendDueMail,
  shouldSendRhythmMail,
  todayIso,
  type Task,
} from "./types";

export type ReminderProcessResult = {
  sent: number;
  dueSent: number;
  rhythmSent: number;
  errors: string[];
  tasks: Task[];
  mailConfigured: boolean;
};

let inFlight: Promise<ReminderProcessResult> | null = null;

export async function processAufgabenReminders(): Promise<ReminderProcessResult> {
  if (inFlight) return inFlight;
  inFlight = runProcess().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runProcess(): Promise<ReminderProcessResult> {
  const mailConfigured = await isMailConfigured();
  const db = await readAufgabenDb();
  const today = todayIso();
  const errors: string[] = [];
  let dueSent = 0;
  let rhythmSent = 0;
  const now = new Date().toISOString();

  if (!mailConfigured) {
    return {
      sent: 0,
      dueSent: 0,
      rhythmSent: 0,
      errors: [],
      tasks: db.tasks,
      mailConfigured: false,
    };
  }

  const nextTasks: Task[] = [];

  for (const task of db.tasks) {
    let current = task;

    if (shouldSendDueMail(current, today)) {
      try {
        const sentMail = await sendTaskReminderMail({
          to: current.notifyEmail,
          title: current.title,
          description: current.description,
          dueDate: current.dueDate!,
          kind: "due",
        });
        if (sentMail) {
          current = { ...current, dueMailSentAt: now, updatedAt: now };
          dueSent += 1;
        }
      } catch (error) {
        errors.push(
          error instanceof Error
            ? `Fälligkeit „${current.title}“: ${error.message}`
            : `Fälligkeit „${current.title}“ fehlgeschlagen`,
        );
      }
    }

    if (shouldSendRhythmMail(current, today)) {
      try {
        const sentMail = await sendTaskReminderMail({
          to: current.notifyEmail,
          title: current.title,
          description: current.description,
          dueDate: current.dueDate,
          kind: "rhythm",
        });
        if (sentMail) {
          current = { ...current, lastReminderSentAt: now, updatedAt: now };
          rhythmSent += 1;
        }
      } catch (error) {
        errors.push(
          error instanceof Error
            ? `Erinnerung „${current.title}“: ${error.message}`
            : `Erinnerung „${current.title}“ fehlgeschlagen`,
        );
      }
    }

    nextTasks.push(current);
  }

  const saved =
    dueSent > 0 || rhythmSent > 0
      ? await writeAufgabenDb({ version: 1, tasks: nextTasks })
      : { version: 1 as const, tasks: nextTasks };

  return {
    sent: dueSent + rhythmSent,
    dueSent,
    rhythmSent,
    errors,
    tasks: saved.tasks,
    mailConfigured: true,
  };
}
