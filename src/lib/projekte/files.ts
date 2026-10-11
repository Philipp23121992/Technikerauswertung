import { promises as fs } from "fs";
import path from "path";
import { createId } from "@/lib/id";
import type { ProjectAttachment } from "./types";

export const PROJEKTE_FILES_DIR = path.join(process.cwd(), "data", "projekte-files");
export const MAX_PROJECT_FILE_BYTES = 25 * 1024 * 1024;

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

export function sanitizeProjectId(projectId: string): string {
  const safe = projectId.replace(/[^a-zA-Z0-9._-]/g, "");
  if (!safe || safe !== projectId) {
    throw new Error("Ungültige Projekt-ID.");
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

export function projectFilesDir(projectId: string): string {
  return path.join(PROJEKTE_FILES_DIR, sanitizeProjectId(projectId));
}

export function assertAllowedUpload(file: File): void {
  if (file.size <= 0) {
    throw new Error("Leere Datei.");
  }
  if (file.size > MAX_PROJECT_FILE_BYTES) {
    throw new Error("Datei ist größer als 25 MB.");
  }
  const ext = fileExtension(file.name);
  if (BLOCKED_EXTENSIONS.has(ext)) {
    throw new Error("Dieser Dateityp ist nicht erlaubt.");
  }
}

export async function saveProjectFile(
  projectId: string,
  file: File,
  uploadedBy: string,
): Promise<ProjectAttachment> {
  assertAllowedUpload(file);
  const id = createId("pfile");
  const name = sanitizeOriginalName(file.name);
  const storedName = storedFileName(id, name);
  const dir = projectFilesDir(projectId);
  await fs.mkdir(dir, { recursive: true });
  const dest = path.join(dir, storedName);
  await fs.writeFile(dest, Buffer.from(await file.arrayBuffer()));
  return {
    id,
    name,
    storedName,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    uploadedAt: new Date().toISOString(),
    uploadedBy: uploadedBy.trim(),
  };
}

export async function readProjectFileBuffer(
  projectId: string,
  storedName: string,
): Promise<Buffer> {
  const safeStored = path.basename(storedName);
  if (!safeStored || safeStored !== storedName) {
    throw new Error("Ungültiger Dateiname.");
  }
  return fs.readFile(path.join(projectFilesDir(projectId), safeStored));
}

export async function deleteProjectFile(projectId: string, storedName: string): Promise<void> {
  const safeStored = path.basename(storedName);
  if (!safeStored || safeStored !== storedName) return;
  await fs.unlink(path.join(projectFilesDir(projectId), safeStored)).catch(() => undefined);
}

export async function deleteProjectFilesDir(projectId: string): Promise<void> {
  try {
    await fs.rm(projectFilesDir(projectId), { recursive: true, force: true });
  } catch {
    // ignore missing folders
  }
}

export async function cleanupOrphanedProjectFiles(projectIds: string[]): Promise<void> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(PROJEKTE_FILES_DIR);
  } catch {
    return;
  }
  const keep = new Set(projectIds);
  await Promise.all(
    entries
      .filter((entry) => !keep.has(entry))
      .map((entry) =>
        fs.rm(path.join(PROJEKTE_FILES_DIR, entry), { recursive: true, force: true }),
      ),
  );
}
