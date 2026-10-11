import type { TaskPriority } from "./types";

export const MAIL_IMPORT_MAX_BYTES = 8 * 1024 * 1024;
export const MAIL_IMPORT_MAX_FILES = 8;

export type MailTaskDraft = {
  title: string;
  description: string;
  priority: TaskPriority;
  dueDate: string | null;
  sourceName: string;
};

const MAIL_NAME_RE = /\.(eml|msg|oft)$/i;
const MAIL_MIME_RE =
  /message\/rfc822|application\/vnd\.ms-outlook|application\/msoutlook|application\/vnd\.ms-office/i;

export function isMailFileName(name: string, mime = ""): boolean {
  const fileName = name.trim();
  if (MAIL_NAME_RE.test(fileName)) return true;
  if (MAIL_MIME_RE.test(mime)) return true;
  return false;
}

export function isMailDragTypes(types: readonly string[]): boolean {
  const set = new Set(types.map((type) => type.toLowerCase()));
  if (set.has("files") || set.has("application/x-moz-file")) return true;
  if ([...set].some((type) => MAIL_MIME_RE.test(type))) return true;
  return set.has("text/html") && set.has("text/plain");
}
