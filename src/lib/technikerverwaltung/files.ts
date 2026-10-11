import { promises as fs } from "fs";
import path from "path";
import { createId } from "@/lib/id";
import type { MemberFileKind, TeamMemberFile } from "./types";

export const TECHNIKERVERWALTUNG_FILES_DIR = path.join(
  process.cwd(),
  "data",
  "technikerverwaltung-files",
);
export const MAX_MEMBER_FILE_BYTES = 25 * 1024 * 1024;

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

export function sanitizeMemberId(memberId: string): string {
  const safe = memberId.replace(/[^a-zA-Z0-9._-]/g, "");
  if (!safe || safe !== memberId) {
    throw new Error("Ungültige Mitarbeiter-ID.");
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

export function memberFilesDir(memberId: string): string {
  return path.join(TECHNIKERVERWALTUNG_FILES_DIR, sanitizeMemberId(memberId));
}

export function assertAllowedUpload(file: File): void {
  if (file.size <= 0) {
    throw new Error("Leere Datei.");
  }
  if (file.size > MAX_MEMBER_FILE_BYTES) {
    throw new Error("Datei ist größer als 25 MB.");
  }
  const ext = fileExtension(file.name);
  if (BLOCKED_EXTENSIONS.has(ext)) {
    throw new Error("Dieser Dateityp ist nicht erlaubt.");
  }
}

export async function saveMemberFile(
  memberId: string,
  file: File,
  kind: MemberFileKind,
  uploadedBy: string,
): Promise<TeamMemberFile> {
  assertAllowedUpload(file);
  const id = createId("tmfile");
  const name = sanitizeOriginalName(file.name);
  const storedName = storedFileName(id, name);
  const dir = memberFilesDir(memberId);
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

export async function readMemberFileBuffer(
  memberId: string,
  storedName: string,
): Promise<Buffer> {
  const safeStored = path.basename(storedName);
  if (!safeStored || safeStored !== storedName) {
    throw new Error("Ungültiger Dateiname.");
  }
  return fs.readFile(path.join(memberFilesDir(memberId), safeStored));
}

export async function deleteMemberFile(memberId: string, storedName: string): Promise<void> {
  const safeStored = path.basename(storedName);
  if (!safeStored || safeStored !== storedName) return;
  await fs.unlink(path.join(memberFilesDir(memberId), safeStored)).catch(() => undefined);
}

export async function cleanupOrphanedMemberFiles(memberIds: string[]): Promise<void> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(TECHNIKERVERWALTUNG_FILES_DIR);
  } catch {
    return;
  }
  const keep = new Set(memberIds);
  await Promise.all(
    entries
      .filter((entry) => !keep.has(entry))
      .map((entry) =>
        fs.rm(path.join(TECHNIKERVERWALTUNG_FILES_DIR, entry), { recursive: true, force: true }),
      ),
  );
}
