import { getMailTemplate } from "./db";
import type { MailTemplateId } from "./types";

export function applyMailTemplate(
  text: string,
  vars: Record<string, string>,
): string {
  const rendered = text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const value = vars[key];
    return value == null ? "" : value;
  });
  return rendered
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function renderMailTemplate(
  id: MailTemplateId,
  vars: Record<string, string>,
): Promise<{ subject: string; text: string } | null> {
  const template = await getMailTemplate(id);
  if (!template.enabled) return null;
  const subject = applyMailTemplate(template.subject, vars) || template.subject;
  const text = applyMailTemplate(template.body, vars);
  return { subject, text };
}
