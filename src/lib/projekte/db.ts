import { promises as fs } from "fs";
import path from "path";
import { writeJsonAtomic } from "@/lib/atomic-write";
import { cleanupOrphanedProjectFiles } from "./files";
import {
  createEmptyProjekteDb,
  normalizeProject,
  type Project,
  type ProjekteDb,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
export const PROJEKTE_DB_PATH = path.join(DATA_DIR, "projekte-db.json");

export async function readProjekteDb(): Promise<ProjekteDb> {
  try {
    const raw = await fs.readFile(PROJEKTE_DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<ProjekteDb>;
    if (parsed?.version !== 1 || !Array.isArray(parsed.projects)) {
      return createEmptyProjekteDb();
    }
    const projects = parsed.projects
      .map((item, index) => normalizeProject(item as Partial<Project>, index))
      .filter((item): item is Project => Boolean(item));
    return { version: 1, projects };
  } catch {
    return createEmptyProjekteDb();
  }
}

export async function writeProjekteDb(db: ProjekteDb): Promise<ProjekteDb> {
  const projects = db.projects
    .map((item, index) => normalizeProject(item, index))
    .filter((item): item is Project => Boolean(item));
  const next: ProjekteDb = { version: 1, projects };
  await writeJsonAtomic(PROJEKTE_DB_PATH, next);
  await cleanupOrphanedProjectFiles(projects.map((project) => project.id));
  return next;
}
