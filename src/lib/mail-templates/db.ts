import { promises as fs } from "fs";
import path from "path";
import { writeJsonAtomic } from "@/lib/atomic-write";
import { DEFAULT_MAIL_TEMPLATES } from "./defaults";
import {
  MAIL_TEMPLATE_IDS,
  type MailTemplate,
  type MailTemplateId,
  type MailTemplatesDb,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
export const MAIL_TEMPLATES_PATH = path.join(DATA_DIR, "mail-templates.json");

function isTemplateId(value: unknown): value is MailTemplateId {
  return typeof value === "string" && (MAIL_TEMPLATE_IDS as readonly string[]).includes(value);
}

function normalizeTemplate(raw: Partial<MailTemplate>): MailTemplate | null {
  if (!isTemplateId(raw.id)) return null;
  const fallback = DEFAULT_MAIL_TEMPLATES[raw.id];
  return {
    id: raw.id,
    enabled: raw.enabled !== false,
    subject:
      typeof raw.subject === "string" && raw.subject.trim()
        ? raw.subject
        : fallback.subject,
    body: typeof raw.body === "string" && raw.body.trim() ? raw.body : fallback.body,
  };
}

export function createDefaultMailTemplatesDb(): MailTemplatesDb {
  return {
    version: 1,
    templates: MAIL_TEMPLATE_IDS.map((id) => ({ ...DEFAULT_MAIL_TEMPLATES[id] })),
  };
}

export function mergeMailTemplates(stored: MailTemplate[]): MailTemplate[] {
  const byId = new Map(
    stored
      .map((item) => normalizeTemplate(item))
      .filter((item): item is MailTemplate => Boolean(item))
      .map((item) => [item.id, item]),
  );
  return MAIL_TEMPLATE_IDS.map((id) => byId.get(id) ?? { ...DEFAULT_MAIL_TEMPLATES[id] });
}

export async function readMailTemplatesDb(): Promise<MailTemplatesDb> {
  try {
    const raw = await fs.readFile(MAIL_TEMPLATES_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<MailTemplatesDb>;
    const templates = mergeMailTemplates(Array.isArray(parsed.templates) ? parsed.templates : []);
    return { version: 1, templates };
  } catch {
    return createDefaultMailTemplatesDb();
  }
}

export async function writeMailTemplatesDb(db: MailTemplatesDb): Promise<MailTemplatesDb> {
  const next: MailTemplatesDb = {
    version: 1,
    templates: mergeMailTemplates(db.templates),
  };
  await writeJsonAtomic(MAIL_TEMPLATES_PATH, next);
  return next;
}

export async function getMailTemplate(id: MailTemplateId): Promise<MailTemplate> {
  const db = await readMailTemplatesDb();
  return db.templates.find((item) => item.id === id) ?? { ...DEFAULT_MAIL_TEMPLATES[id] };
}
