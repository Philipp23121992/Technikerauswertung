import { promises as fs } from "fs";
import path from "path";
import { createId } from "@/lib/id";
import type { QuoteAttachment, QuoteFileKind } from "./types";

export const KOSTENVORANSCHLAEGE_FILES_DIR = path.join(
  process.cwd(),
  "data",
  "kostenvoranschlaege-files",
);
export const MAX_QUOTE_FILE_BYTES = 25 * 1024 * 1024;

const BLOCKED_EXTENSIONS = new Set([
  "exe",
  "bat",
  "cmd",
  "com",
  "msi",
  "dll",
  "scr",
  "ps1",
  "vbs",
  "js",
  "wsf",
  "reg",
]);

export function sanitizeQuoteId(quoteId: string): string {
  const safe = quoteId.replace(/[^a-zA-Z0-9._-]/g, "");
  if (!safe || safe !== quoteId) {
    throw new Error("Ungültige Kostenvoranschlag-ID.");
  }
  return safe;
}

export function fileExtension(name: string): string {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index + 1).toLowerCase() : "";
}

export function sanitizeOriginalName(name: string): string {
  const base = name.replace(/[/\\?%*:|"<>]/g, "_").replace(/\s+/g, " ").trim();
  return (base || "datei").slice(0, 180);
}

export function storedFileName(attachmentId: string, originalName: string): string {
  const ext = fileExtension(originalName).replace(/[^a-z0-9]/g, "");
  return ext ? `${attachmentId}.${ext}` : attachmentId;
}

export function quoteFilesDir(quoteId: string): string {
  return path.join(KOSTENVORANSCHLAEGE_FILES_DIR, sanitizeQuoteId(quoteId));
}

export function assertAllowedUpload(file: File): void {
  if (file.size <= 0) {
    throw new Error("Leere Datei.");
  }
  if (file.size > MAX_QUOTE_FILE_BYTES) {
    throw new Error("Datei ist größer als 25 MB.");
  }
  const ext = fileExtension(file.name);
  if (BLOCKED_EXTENSIONS.has(ext)) {
    throw new Error("Dieser Dateityp ist nicht erlaubt.");
  }
}

export async function saveQuoteFile(
  quoteId: string,
  file: File,
  kind: QuoteFileKind,
  uploadedBy: string,
): Promise<QuoteAttachment> {
  assertAllowedUpload(file);
  const id = createId("kvfile");
  const name = sanitizeOriginalName(file.name);
  const storedName = storedFileName(id, name);
  const dir = quoteFilesDir(quoteId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, storedName), Buffer.from(await file.arrayBuffer()));
  return {
    id,
    kind,
    name,
    storedName,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    uploadedAt: new Date().toISOString(),
    uploadedBy: uploadedBy.trim(),
  };
}

export async function readQuoteFileBuffer(
  quoteId: string,
  storedName: string,
): Promise<Buffer> {
  const safeStored = path.basename(storedName);
  if (!safeStored || safeStored !== storedName) {
    throw new Error("Ungültiger Dateiname.");
  }
  return fs.readFile(path.join(quoteFilesDir(quoteId), safeStored));
}

export async function deleteQuoteFile(
  quoteId: string,
  storedName: string,
): Promise<void> {
  const safeStored = path.basename(storedName);
  if (!safeStored || safeStored !== storedName) return;
  await fs.unlink(path.join(quoteFilesDir(quoteId), safeStored)).catch(() => undefined);
}

export async function cleanupOrphanedQuoteFiles(quoteIds: string[]): Promise<void> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(KOSTENVORANSCHLAEGE_FILES_DIR);
  } catch {
    return;
  }
  const keep = new Set(quoteIds);
  await Promise.all(
    entries
      .filter((entry) => !keep.has(entry))
      .map((entry) =>
        fs.rm(path.join(KOSTENVORANSCHLAEGE_FILES_DIR, entry), {
          recursive: true,
          force: true,
        }),
      ),
  );
}
