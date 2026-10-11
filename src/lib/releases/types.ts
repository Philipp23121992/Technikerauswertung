import type { AppId, AppUser, PublicUser } from "@/lib/auth/types";

export type ReleaseFlagStatus = "preview" | "released";

export type ReleaseFlagDef = {
  id: string;
  title: string;
  description: string;
  appId: AppId | null;
  defaultStatus: ReleaseFlagStatus;
};

export type ReleaseFlagRecord = {
  id: string;
  title: string;
  description: string;
  appId: AppId | null;
  status: ReleaseFlagStatus;
  source: "catalog" | "custom";
  sprint: string | null;
  previewUserIds: string[];
  createdAt: string;
  updatedAt: string;
  releasedAt: string | null;
};

export type ReleasesDb = {
  version: 1;
  sprint: string;
  flags: ReleaseFlagRecord[];
};

export type PublicReleaseFlag = ReleaseFlagRecord & {
  enabled: boolean;
};

export function createEmptyReleasesDb(): ReleasesDb {
  return { version: 1, sprint: "", flags: [] };
}

export function isAdminUser(user: Pick<AppUser | PublicUser, "apps" | "active"> | null | undefined): boolean {
  return Boolean(user?.active && user.apps.includes("admin"));
}

export function flagEnabledForUser(
  flag: Pick<ReleaseFlagRecord, "status" | "previewUserIds">,
  user: Pick<AppUser | PublicUser, "id" | "apps" | "active"> | null | undefined,
): boolean {
  if (!user?.active) return false;
  if (flag.status === "released") return true;
  if (isAdminUser(user)) return true;
  return flag.previewUserIds.includes(user.id);
}

export function normalizeFlagId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}
