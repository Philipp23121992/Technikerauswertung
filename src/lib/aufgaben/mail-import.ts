import { simpleParser, type ParsedMail } from "mailparser";
import MsgReader from "@kenjiuno/msgreader";
import { parseFlexibleDate } from "@/lib/ticket-import";
import type { TaskPriority } from "./types";
import { MAIL_IMPORT_MAX_BYTES, isMailFileName, type MailTaskDraft } from "./mail-drop";

export {
  MAIL_IMPORT_MAX_BYTES,
  MAIL_IMPORT_MAX_FILES,
  isMailDragTypes,
  isMailFileName,
  type MailTaskDraft,
} from "./mail-drop";

const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0];

function decodeBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

function isOleCompound(bytes: Uint8Array): boolean {
  return OLE_MAGIC.every((value, index) => bytes[index] === value);
}

function looksLikeMime(text: string): boolean {
  const head = text.slice(0, 1200);
  return /^(from|return-path|received|mime-version|subject|to|message-id|date|x-priority|importance)\s*:/im.test(
    head,
  );
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function cleanMailSubject(subject: string): string {
  return subject.replace(/^\s*((re|aw|fw|fwd|wg|sv|antw)\s*:\s*)+/gi, "").trim();
}

function clip(value: string, max: number): string {
  const text = value.replace(/\s+\n/g, "\n").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
}

function formatAddress(
  value:
    | { text?: string; value?: Array<{ name?: string; address?: string }> }
    | Array<{ text?: string; value?: Array<{ name?: string; address?: string }> }>
    | undefined,
): string {
  if (!value) return "";
  if (Array.isArray(value)) {
    return value.map((item) => formatAddress(item)).filter(Boolean).join(", ");
  }
  if (value.text?.trim()) return value.text.trim();
  const parts = (value.value ?? [])
    .map((item) => {
      const email = item.address?.trim() ?? "";
      const name = item.name?.trim() ?? "";
      if (name && email) return `${name} <${email}>`;
      return name || email;
    })
    .filter(Boolean);
  return parts.join(", ");
}

function formatDate(value: Date | string | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return typeof value === "string" ? value : "";
  }
  return date.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function guessPriority(subject: string, headers: string, body: string): TaskPriority {
  const blob = `${subject}\n${headers}\n${body}`.toLowerCase();
  if (
    /\bx-priority\s*:\s*1\b/i.test(headers) ||
    /\bpriority\s*:\s*urgent\b/i.test(headers) ||
    /\b(sehr dringend|asap|sofort|kritisch)\b/i.test(blob)
  ) {
    return "sehr-hoch";
  }
  if (
    /\b(x-priority\s*:\s*2|importance\s*:\s*high|priority\s*:\s*high)\b/i.test(headers) ||
    /\b(dringend|urgent|wichtig)\b/i.test(blob)
  ) {
    return "hoch";
  }
  if (/\b(x-priority\s*:\s*[45]|importance\s*:\s*low|priority\s*:\s*low)\b/i.test(headers)) {
    return "niedrig";
  }
  return "mittel";
}

function guessDueDate(text: string): string | null {
  const match = text.match(
    /\b(?:fällig(?:keitsdatum)?|deadline|bis(?: zum)?)\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{2,4}|\d{4}-\d{2}-\d{2})/i,
  );
  if (!match?.[1]) return null;
  return parseFlexibleDate(match[1]);
}

function fallbackTitle(sourceName: string, body: string): string {
  const fromFile = sourceName.replace(/\.(eml|msg|oft)$/i, "").replace(/[_]+/g, " ").trim();
  if (fromFile && !/^unbenannt|untitled|new mail|neue nachricht$/i.test(fromFile)) {
    return clip(fromFile, 180);
  }
  const first = body.split(/\n/).map((line) => line.trim()).find((line) => line.length > 3);
  return clip(first || "Aufgabe aus E-Mail", 180);
}

function buildDescription(input: {
  from: string;
  to: string;
  date: string;
  attachments: string[];
  body: string;
}): string {
  const lines = [
    input.from ? `Von: ${input.from}` : "",
    input.to ? `An: ${input.to}` : "",
    input.date ? `Datum: ${input.date}` : "",
    input.attachments.length ? `Anhänge: ${input.attachments.join(", ")}` : "",
  ].filter(Boolean);
  const header = lines.join("\n");
  const body = clip(input.body || "(kein Text in der Mail)", 8000);
  return header ? `${header}\n\n${body}` : body;
}

function toDraft(input: {
  subject: string;
  from: string;
  to: string;
  date: string;
  body: string;
  attachments: string[];
  headers: string;
  sourceName: string;
}): MailTaskDraft {
  const body = input.body.trim();
  const title = cleanMailSubject(input.subject) || fallbackTitle(input.sourceName, body);
  return {
    title: clip(title, 180) || "Aufgabe aus E-Mail",
    description: buildDescription({
      from: input.from,
      to: input.to,
      date: input.date,
      attachments: input.attachments,
      body,
    }),
    priority: guessPriority(title, input.headers, body),
    dueDate: guessDueDate(`${title}\n${body}`),
    sourceName: input.sourceName,
  };
}

function headerValue(parsed: ParsedMail, key: string): string {
  const raw = parsed.headers.get(key);
  if (raw == null) return "";
  if (typeof raw === "string" || typeof raw === "number") return String(raw);
  if (Array.isArray(raw)) return raw.map(String).join(", ");
  if (raw instanceof Date) return raw.toISOString();
  return String(raw);
}

function parsedToDraft(parsed: ParsedMail, sourceName: string): MailTaskDraft {
  const html = typeof parsed.html === "string" ? parsed.html : "";
  const body = (parsed.text || htmlToText(html)).replace(/\s+\n/g, "\n").trim();
  const attachments = (parsed.attachments ?? [])
    .map((item) => item.filename?.trim())
    .filter((name): name is string => Boolean(name));
  const headerBlob = [
    headerValue(parsed, "x-priority") ? `X-Priority: ${headerValue(parsed, "x-priority")}` : "",
    headerValue(parsed, "importance") ? `Importance: ${headerValue(parsed, "importance")}` : "",
    parsed.priority ? `Priority: ${parsed.priority}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return toDraft({
    subject: parsed.subject?.trim() || "",
    from: formatAddress(parsed.from),
    to: formatAddress(parsed.to),
    date: formatDate(parsed.date),
    body,
    attachments,
    headers: headerBlob,
    sourceName,
  });
}

async function parseMime(bytes: Uint8Array, sourceName: string): Promise<MailTaskDraft> {
  const parsed = await simpleParser(Buffer.from(bytes));
  const draft = parsedToDraft(parsed, sourceName);
  const rawHeaders = decodeBytes(bytes).split(/\r?\n\r?\n/, 1)[0] ?? "";
  if (!rawHeaders) return draft;
  return {
    ...draft,
    priority: guessPriority(draft.title, `${draft.description}\n${rawHeaders}`, draft.description),
  };
}

function parseMsg(bytes: Uint8Array, sourceName: string): MailTaskDraft {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const reader = new MsgReader(copy);
  const data = reader.getFileData();
  if (data.error) {
    throw new Error(`Outlook-Datei konnte nicht gelesen werden: ${data.error}`);
  }
  const html =
    (typeof data.bodyHtml === "string" && data.bodyHtml) ||
    (data.html instanceof Uint8Array ? decodeBytes(data.html) : "");
  const body = (data.body || htmlToText(html)).trim();
  const attachments = (data.attachments ?? [])
    .map((item) => item.fileName || item.fileNameShort || item.name || "")
    .map((name) => name.trim())
    .filter(Boolean);
  const to = (data.recipients ?? [])
    .filter((item) => item.recipType === "to" || !item.recipType)
    .map((item) => {
      const email = (item.email || item.senderSmtpAddress || "").trim();
      const name = (item.name || "").trim();
      if (name && email && name !== email) return `${name} <${email}>`;
      return name || email;
    })
    .filter(Boolean)
    .join(", ");
  const fromName = data.senderName?.trim() || "";
  const fromEmail = (data.senderSmtpAddress || data.senderEmail || "").trim();
  const from =
    fromName && fromEmail && fromName !== fromEmail ? `${fromName} <${fromEmail}>` : fromName || fromEmail;
  return toDraft({
    subject: data.subject?.trim() || "",
    from,
    to,
    date: formatDate(
      data.clientSubmitTime || data.messageDeliveryTime || data.creationTime || data.headers?.match(/^date:\s*(.+)$/im)?.[1],
    ),
    body,
    attachments,
    headers: data.headers ?? "",
    sourceName,
  });
}

export function parseMailTextToTaskDraft(input: {
  text?: string;
  html?: string;
  fileName?: string;
}): MailTaskDraft {
  const html = input.html?.trim() ?? "";
  const text = (input.text?.trim() || htmlToText(html)).trim();
  if (!text && !html) {
    throw new Error("Die abgelegte Mail enthält keinen lesbaren Text.");
  }
  const sourceName = input.fileName?.trim() || "Outlook";
  if (looksLikeMime(text)) {
    const parsedHead = text.match(/^subject:\s*(.+)$/im)?.[1]?.trim() ?? "";
    const bodyMatch = text.split(/\r?\n\r?\n/).slice(1).join("\n\n").trim();
    const from = text.match(/^from:\s*(.+)$/im)?.[1]?.trim() ?? "";
    const to = text.match(/^to:\s*(.+)$/im)?.[1]?.trim() ?? "";
    const date = text.match(/^date:\s*(.+)$/im)?.[1]?.trim() ?? "";
    return toDraft({
      subject: parsedHead,
      from,
      to,
      date: formatDate(date),
      body: bodyMatch || htmlToText(html) || text,
      attachments: [],
      headers: text.slice(0, 1500),
      sourceName,
    });
  }
  return toDraft({
    subject: "",
    from: "",
    to: "",
    date: "",
    body: text,
    attachments: [],
    headers: "",
    sourceName,
  });
}

export async function parseMailBytesToTaskDraft(
  bytes: Uint8Array,
  fileName = "mail.eml",
): Promise<MailTaskDraft> {
  if (!bytes.length) {
    throw new Error("Die Mail-Datei ist leer.");
  }
  if (bytes.length > MAIL_IMPORT_MAX_BYTES) {
    throw new Error("Die Mail-Datei ist größer als 8 MB.");
  }
  if (isOleCompound(bytes)) {
    return parseMsg(bytes, fileName);
  }
  const text = decodeBytes(bytes);
  if (looksLikeMime(text) || isMailFileName(fileName, "")) {
    try {
      return await parseMime(bytes, fileName);
    } catch {
      return parseMailTextToTaskDraft({ text, fileName });
    }
  }
  if (text.trim()) {
    return parseMailTextToTaskDraft({ text, fileName });
  }
  throw new Error("Das ist keine erkennbare E-Mail-Datei (.eml oder .msg).");
}
