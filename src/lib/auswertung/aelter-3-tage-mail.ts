import { promises as fs } from "fs";
import path from "path";
import { writeJsonAtomic } from "@/lib/atomic-write";
import { isMailConfigured, sendPlainTextMail, SMTP_SETUP_HINT } from "@/lib/mail";
import {
  loadSlaCustomers,
  readAelter3TageDb,
  withRefreshedAges,
} from "@/lib/auswertung/aelter-3-tage-db";
import { isActiveAelter3Ticket, type Aelter3TageStoredTicket } from "@/lib/auswertung/aelter-3-tage-types";
import { DEFAULT_AGE_THRESHOLD_DAYS } from "@/lib/auswertung/tickets-aelter-3-tage";
import { formatDisplayDate } from "@/lib/tracker";
import { matchTechnicianByName, personNameKeys } from "@/lib/ticket-import";
import { readTechnikerverwaltungDb } from "@/lib/technikerverwaltung/db";
import type { TeamMember } from "@/lib/technikerverwaltung/types";
import {
  AELTER_3_MAIL_TABS,
  AELTER_3_MAIL_TAB_LABELS,
  DEFAULT_AELTER_3_MAIL_TEMPLATES,
  isAelter3MailTab,
  type Aelter3TageMailTab,
  type Aelter3TageMailTemplate,
  type Aelter3TageMailTemplatesDb,
} from "./aelter-3-tage-mail-types";

export {
  AELTER_3_MAIL_TABS,
  AELTER_3_MAIL_TAB_LABELS,
  isAelter3MailTab,
  type Aelter3TageMailTab,
  type Aelter3TageMailTemplate,
  type Aelter3TageMailTemplatesDb,
};

const DATA_PATH = path.join(process.cwd(), "data", "aelter-3-tage-mail-templates.json");

function mergeTemplates(stored: Aelter3TageMailTemplate[]): Aelter3TageMailTemplate[] {
  const byTab = new Map(stored.map((item) => [item.tab, item]));
  return AELTER_3_MAIL_TABS.map((tab) => {
    const raw = byTab.get(tab);
    const fallback = DEFAULT_AELTER_3_MAIL_TEMPLATES[tab];
    return {
      tab,
      subject: raw?.subject?.trim() ? raw.subject : fallback.subject,
      body: raw?.body?.trim() ? raw.body : fallback.body,
    };
  });
}

export async function readAelter3TageMailTemplates(): Promise<Aelter3TageMailTemplatesDb> {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<Aelter3TageMailTemplatesDb>;
    const templates = mergeTemplates(
      Array.isArray(parsed.templates)
        ? parsed.templates.filter(
            (item): item is Aelter3TageMailTemplate =>
              Boolean(item && isAelter3MailTab(String(item.tab))),
          )
        : [],
    );
    return { version: 1, templates };
  } catch {
    return {
      version: 1,
      templates: mergeTemplates([]),
    };
  }
}

export async function writeAelter3TageMailTemplates(
  templates: Aelter3TageMailTemplate[],
): Promise<Aelter3TageMailTemplatesDb> {
  const next: Aelter3TageMailTemplatesDb = {
    version: 1,
    templates: mergeTemplates(templates),
  };
  await writeJsonAtomic(DATA_PATH, next);
  return next;
}

function matchesMailTab(row: Aelter3TageStoredTicket, tab: Aelter3TageMailTab): boolean {
  switch (tab) {
    case "zielOverdue":
      return row.zielterminOverdue;
    case "ersatzteile":
      return row.ersatzteileAngekommen;
    case "termineFehlen":
      return !row.hasZieltermin && !row.wunschtermin;
    default:
      return false;
  }
}

function buildTeamMemberLookup(members: TeamMember[]): Map<string, TeamMember> {
  const map = new Map<string, TeamMember>();
  for (const member of members) {
    if (!member.active) continue;
    for (const key of personNameKeys(member.name)) {
      if (!map.has(key)) map.set(key, member);
    }
  }
  return map;
}

export function formatAelter3TicketLine(row: Aelter3TageStoredTicket): string {
  const ziel = row.hasZieltermin && row.zieltermin ? formatDisplayDate(row.zieltermin) : "—";
  const wunsch = row.wunschtermin ? formatDisplayDate(row.wunschtermin) : "—";
  const ticket = row.ticketNo || "(ohne Nr.)";
  const customer = row.customer || "—";
  return `${ticket} · ${customer} · ${row.ageWorkdays} AT · Ziel: ${ziel} · Wunsch: ${wunsch}`;
}

export function applyAelter3MailTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{{${key}}}`).join(value);
  }
  return out;
}

type TechnicianGroup = {
  technicianName: string;
  tickets: Aelter3TageStoredTicket[];
};

function groupByTechnician(rows: Aelter3TageStoredTicket[]): TechnicianGroup[] {
  const map = new Map<string, Aelter3TageStoredTicket[]>();
  for (const row of rows) {
    const name = row.technician.trim() || "(ohne Bearbeiter)";
    const list = map.get(name) ?? [];
    list.push(row);
    map.set(name, list);
  }
  return [...map.entries()]
    .map(([technicianName, tickets]) => ({
      technicianName,
      tickets: tickets.sort((a, b) => a.ticketNo.localeCompare(b.ticketNo, "de")),
    }))
    .sort((a, b) => a.technicianName.localeCompare(b.technicianName, "de"));
}

export async function loadFilteredAelter3Tickets(
  referenceDate: string,
  onlyOlder: boolean,
  tab: Aelter3TageMailTab,
): Promise<Aelter3TageStoredTicket[]> {
  const db = await readAelter3TageDb();
  const customers = await loadSlaCustomers();
  const refreshed = withRefreshedAges(
    db,
    referenceDate,
    DEFAULT_AGE_THRESHOLD_DAYS,
    customers,
  ).tickets;
  let rows = refreshed.filter((row) => isActiveAelter3Ticket(row));
  rows = onlyOlder ? rows.filter((row) => row.olderThanThreshold) : rows;
  rows = rows.filter((row) => matchesMailTab(row, tab));
  return rows;
}

export type Aelter3MailRecipientPreview = {
  technicianName: string;
  email: string;
  ticketCount: number;
  subject: string;
  textPreview: string;
  memberId: string;
};

export type Aelter3MailMissingRecipient = {
  technicianName: string;
  ticketCount: number;
  reason: "not_in_technikerverwaltung" | "no_email";
  memberId: string | null;
  message: string;
};

export type Aelter3MailPlanResult = {
  tab: Aelter3TageMailTab;
  tabLabel: string;
  referenceDate: string;
  ticketCount: number;
  recipients: Aelter3MailRecipientPreview[];
  missing: Aelter3MailMissingRecipient[];
};

function missingMessage(
  technicianName: string,
  reason: Aelter3MailMissingRecipient["reason"],
  member: TeamMember | null,
): string {
  if (reason === "not_in_technikerverwaltung") {
    return `Bearbeiter „${technicianName}“ ist in der Technikerverwaltung nicht hinterlegt. Bitte dort anlegen und E-Mail eintragen.`;
  }
  const who = member?.name ?? technicianName;
  return `Für „${who}“ fehlt die E-Mail-Adresse in der Technikerverwaltung. Bitte unter Technikerverwaltung nachtragen.`;
}

export async function planAelter3TechnicianMails(input: {
  tab: Aelter3TageMailTab;
  referenceDate: string;
  onlyOlder: boolean;
  subject?: string;
  body?: string;
}): Promise<Aelter3MailPlanResult> {
  const templatesDb = await readAelter3TageMailTemplates();
  const saved = templatesDb.templates.find((item) => item.tab === input.tab)!;
  const subjectTemplate = input.subject?.trim() || saved.subject;
  const bodyTemplate = input.body?.trim() || saved.body;

  const rows = await loadFilteredAelter3Tickets(input.referenceDate, input.onlyOlder, input.tab);
  const tv = await readTechnikerverwaltungDb();
  const lookup = buildTeamMemberLookup(tv.members);
  const groups = groupByTechnician(rows);

  const recipients: Aelter3MailRecipientPreview[] = [];
  const missing: Aelter3MailMissingRecipient[] = [];

  for (const group of groups) {
    if (group.technicianName === "(ohne Bearbeiter)") {
      missing.push({
        technicianName: group.technicianName,
        ticketCount: group.tickets.length,
        reason: "not_in_technikerverwaltung",
        memberId: null,
        message:
          "Es gibt Tickets ohne Bearbeiter. Bitte im System zuweisen oder aus der Liste entfernen.",
      });
      continue;
    }

    const member = matchTechnicianByName(group.technicianName, lookup);
    const ticketList = group.tickets.map(formatAelter3TicketLine).join("\n");
    const ticketCount = String(group.tickets.length);
    const vars = {
      technicianName: member?.name ?? group.technicianName,
      ticketList,
      ticketCount,
      tabLabel: AELTER_3_MAIL_TAB_LABELS[input.tab],
      referenceDate: formatDisplayDate(input.referenceDate),
    };

    if (!member) {
      missing.push({
        technicianName: group.technicianName,
        ticketCount: group.tickets.length,
        reason: "not_in_technikerverwaltung",
        memberId: null,
        message: missingMessage(group.technicianName, "not_in_technikerverwaltung", null),
      });
      continue;
    }

    const email = member.email.trim();
    if (!email.includes("@")) {
      missing.push({
        technicianName: group.technicianName,
        ticketCount: group.tickets.length,
        reason: "no_email",
        memberId: member.id,
        message: missingMessage(group.technicianName, "no_email", member),
      });
      continue;
    }

    recipients.push({
      technicianName: member.name,
      email,
      ticketCount: group.tickets.length,
      memberId: member.id,
      subject: applyAelter3MailTemplate(subjectTemplate, vars),
      textPreview: applyAelter3MailTemplate(bodyTemplate, vars),
    });
  }

  return {
    tab: input.tab,
    tabLabel: AELTER_3_MAIL_TAB_LABELS[input.tab],
    referenceDate: input.referenceDate,
    ticketCount: rows.length,
    recipients,
    missing,
  };
}

function filterRecipients(
  plan: Aelter3MailPlanResult,
  memberIds?: string[],
): Aelter3MailRecipientPreview[] {
  if (!memberIds?.length) return plan.recipients;
  const allowed = new Set(memberIds);
  return plan.recipients.filter((item) => allowed.has(item.memberId));
}

export async function sendAelter3TechnicianMails(input: {
  tab: Aelter3TageMailTab;
  referenceDate: string;
  onlyOlder: boolean;
  subject?: string;
  body?: string;
  memberIds?: string[];
  cc?: string;
}): Promise<{ sent: number; plan: Aelter3MailPlanResult }> {
  const configured = await isMailConfigured();
  if (!configured) {
    throw new Error(SMTP_SETUP_HINT);
  }

  const plan = await planAelter3TechnicianMails(input);
  if (plan.ticketCount === 0) {
    throw new Error("Keine Tickets in dieser Ansicht – nichts zu versenden.");
  }

  const targets = filterRecipients(plan, input.memberIds);
  if (input.memberIds?.length && targets.length === 0) {
    throw new Error("Keine der ausgewählten Techniker haben eine gültige E-Mail.");
  }
  if (!input.memberIds?.length) {
    if (plan.missing.length > 0) {
      throw new Error(plan.missing.map((item) => item.message).join("\n"));
    }
    if (plan.recipients.length === 0) {
      throw new Error("Keine Empfänger mit gültiger E-Mail gefunden.");
    }
  }
  const toSend = input.memberIds?.length ? targets : plan.recipients;
  if (toSend.length === 0) {
    throw new Error("Bitte mindestens einen Techniker auswählen.");
  }

  const cc = input.cc?.trim() || undefined;
  for (const recipient of toSend) {
    await sendPlainTextMail({
      to: recipient.email,
      cc,
      subject: recipient.subject,
      text: recipient.textPreview,
    });
  }

  return { sent: toSend.length, plan };
}
