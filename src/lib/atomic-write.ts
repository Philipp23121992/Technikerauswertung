import { promises as fs } from "fs";
import path from "path";

/** Atomisches JSON-Schreiben mit Windows-Fallback (rename über existierende Datei). */
export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const payload = JSON.stringify(value, null, 2);
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, payload, "utf8");
  try {
    await fs.rename(tmp, filePath);
  } catch {
    await fs.writeFile(filePath, payload, "utf8");
    await fs.unlink(tmp).catch(() => undefined);
  }
}
