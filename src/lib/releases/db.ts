import { promises as fs } from "fs";
import path from "path";
import { writeJsonAtomic } from "@/lib/atomic-write";
import { APP_IDS, type AppId } from "@/lib/auth/types";
import { RELEASE_CATALOG } from "./catalog";
import {
  createEmptyReleasesDb,
  normalizeFlagId,
  type ReleaseFlagRecord,
  type ReleaseFlagStatus,
  type ReleasesDb,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
export const RELEASES_DB_PATH = path.join(DATA_DIR, "release-flags.json");

function asStatus(value: unknown, fallback: ReleaseFlagStatus): ReleaseFlagStatus {
  return value === "released" || value === "preview" ? value : fallback;
}

function asAppId(value: unknown): AppId | null {
  return typeof value === "string" && (APP_IDS as readonly string[]).includes(value)
    ? (value as AppId)
    : null;
}

function normalizeRecord(raw: Partial<ReleaseFlagRecord>, fallback: ReleaseFlagRecord): ReleaseFlagRecord {
  const previewUserIds = Array.isArray(raw.previewUserIds)
    ? raw.previewUserIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
    : fallback.previewUserIds;
  return {
    id: fallback.id,
    title:
      typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : fallback.title,
    description:
      typeof raw.description === "string" ? raw.description.trim() : fallback.description,
    appId: raw.appId === undefined ? fallback.appId : asAppId(raw.appId),
    status: asStatus(raw.status, fallback.status),
    source: fallback.source,
    sprint:
      typeof raw.sprint === "string" && raw.sprint.trim() ? raw.sprint.trim() : fallback.sprint,
    previewUserIds,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : fallback.createdAt,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : fallback.updatedAt,
    releasedAt:
      raw.releasedAt === null
        ? null
        : typeof raw.releasedAt === "string"
          ? raw.releasedAt
          : fallback.releasedAt,
  };
}

function catalogRecord(def: (typeof RELEASE_CATALOG)[number], now: string): ReleaseFlagRecord {
  return {
    id: def.id,
    title: def.title,
    description: def.description,
    appId: def.appId,
    status: def.defaultStatus,
    source: "catalog",
    sprint: null,
    previewUserIds: [],
    createdAt: now,
    updatedAt: now,
    releasedAt: def.defaultStatus === "released" ? now : null,
  };
}

export function mergeReleasesDb(raw: Partial<ReleasesDb> | null | undefined): ReleasesDb {
  const now = new Date().toISOString();
  const stored = Array.isArray(raw?.flags) ? raw.flags : [];
  const byId = new Map<string, Partial<ReleaseFlagRecord>>();
  for (const item of stored) {
    const id = normalizeFlagId(typeof item?.id === "string" ? item.id : "");
    if (id) byId.set(id, item);
  }

  const flags: ReleaseFlagRecord[] = [];
  const seen = new Set<string>();
  for (const def of RELEASE_CATALOG) {
    const id = normalizeFlagId(def.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const base = catalogRecord(def, now);
    const prev = byId.get(id);
    flags.push(
      prev
        ? {
            ...normalizeRecord(prev, base),
            title: def.title,
            description: def.description,
            appId: def.appId,
            source: "catalog",
          }
        : base,
    );
  }

  for (const [id, item] of byId) {
    if (seen.has(id)) continue;
    seen.add(id);
    flags.push(
      normalizeRecord(item, {
        id,
        title: id,
        description: "",
        appId: null,
        status: "preview",
        source: "custom",
        sprint: null,
        previewUserIds: [],
        createdAt: now,
        updatedAt: now,
        releasedAt: null,
      }),
    );
  }

  return {
    version: 1,
    sprint: typeof raw?.sprint === "string" ? raw.sprint.trim() : "",
    flags,
  };
}

export async function readReleasesDb(): Promise<ReleasesDb> {
  try {
    const raw = await fs.readFile(RELEASES_DB_PATH, "utf8");
    return mergeReleasesDb(JSON.parse(raw) as Partial<ReleasesDb>);
  } catch {
    return mergeReleasesDb(createEmptyReleasesDb());
  }
}

export async function writeReleasesDb(db: ReleasesDb): Promise<ReleasesDb> {
  const next = mergeReleasesDb(db);
  await writeJsonAtomic(RELEASES_DB_PATH, next);
  return next;
}
