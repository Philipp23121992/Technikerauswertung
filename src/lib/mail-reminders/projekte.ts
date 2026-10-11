import { isMailConfigured, sendProjekteDueMail } from "@/lib/mail";
import { readProjekteDb, writeProjekteDb } from "@/lib/projekte/db";
import {
  PROJECT_PRIORITY_LABELS,
  PROJECT_STATUS_LABELS,
  type Project,
} from "@/lib/projekte/types";
import { todayIso } from "@/lib/meetings/types";
import { loadAddressBook, lookupEmails } from "./addresses";

export type ProjekteReminderResult = {
  sent: number;
  skipped: number;
  errors: string[];
  mailConfigured: boolean;
};

export async function processProjekteReminders(): Promise<ProjekteReminderResult> {
  const mailConfigured = await isMailConfigured();
  const db = await readProjekteDb();
  if (!mailConfigured) {
    return { sent: 0, skipped: 0, errors: [], mailConfigured: false };
  }

  const book = await loadAddressBook();
  const today = todayIso();
  const now = new Date().toISOString();
  const errors: string[] = [];
  let sent = 0;
  let skipped = 0;
  const next: Project[] = [];

  for (const project of db.projects) {
    if (
      project.archived ||
      project.status === "abgeschlossen" ||
      !project.dueDate ||
      project.dueDate > today ||
      project.dueMailSentAt
    ) {
      next.push(project);
      continue;
    }

    const recipients = lookupEmails(book, {
      ids: project.technicianIds,
      names: project.ownerName ? [project.ownerName] : [],
    });

    if (recipients.length === 0) {
      skipped += 1;
      next.push(project);
      continue;
    }

    const dueLabel = project.dueDate.split("-").reverse().join(".");
    try {
      const sentMail = await sendProjekteDueMail({
        to: recipients,
        title: project.title,
        dueDate: dueLabel,
        status: PROJECT_STATUS_LABELS[project.status],
        priority: PROJECT_PRIORITY_LABELS[project.priority],
        ownerName: project.ownerName,
      });
      if (!sentMail) {
        next.push(project);
        continue;
      }
      sent += 1;
      next.push({ ...project, dueMailSentAt: now, updatedAt: now });
    } catch (error) {
      errors.push(
        error instanceof Error
          ? `Projekt „${project.title}“: ${error.message}`
          : `Projekt „${project.title}“ fehlgeschlagen`,
      );
      next.push(project);
    }
  }

  if (sent > 0) {
    await writeProjekteDb({ version: 1, projects: next });
  }

  return { sent, skipped, errors, mailConfigured: true };
}
