export const APP_IDS = [
  "finder",
  "auswertung",
  "sla",
  "meetings",
  "wissen",
  "admin",
] as const;

export type AppId = (typeof APP_IDS)[number];

export const APP_LABELS: Record<AppId, string> = {
  finder: "Techniker Finder (Schreiben)",
  auswertung: "Technikerauswertung",
  sla: "SLA Auswertung",
  meetings: "Meetings",
  wissen: "Wissensassistent",
  admin: "Benutzerverwaltung",
};

export type AppUser = {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  passwordSalt: string;
  apps: AppId[];
  canEdit: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PublicUser = {
  id: string;
  username: string;
  displayName: string;
  apps: AppId[];
  canEdit: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UsersDb = {
  version: 1;
  users: AppUser[];
};

export function toPublicUser(user: AppUser): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    apps: [...user.apps],
    canEdit: user.canEdit,
    active: user.active,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function createUserId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `user-${crypto.randomUUID()}`;
  }
  return `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeApps(apps: unknown): AppId[] {
  if (!Array.isArray(apps)) return [];
  const allowed = new Set<string>(APP_IDS);
  const unique = new Set<AppId>();
  for (const item of apps) {
    if (typeof item === "string" && allowed.has(item)) {
      unique.add(item as AppId);
    }
  }
  return [...unique];
}

export function pathToAppId(pathname: string): AppId | null {
  if (!pathname) return null;
  if (pathname.startsWith("/benutzer") || pathname.startsWith("/api/users")) {
    return "admin";
  }
  if (pathname.startsWith("/finder") || pathname.startsWith("/api/finder")) {
    return "finder";
  }
  if (
    pathname.startsWith("/gefahren") ||
    pathname.startsWith("/offen") ||
    pathname.startsWith("/touren") ||
    pathname.startsWith("/techniker-db") ||
    pathname.startsWith("/kpi") ||
    pathname.startsWith("/eingabe") ||
    pathname.startsWith("/auswertung") ||
    pathname.startsWith("/import")
  ) {
    return "auswertung";
  }
  if (pathname.startsWith("/sla") || pathname.startsWith("/api/sla")) {
    return "sla";
  }
  if (
    pathname.startsWith("/meetings") ||
    pathname.startsWith("/api/meetings") ||
    pathname.startsWith("/api/mail")
  ) {
    return "meetings";
  }
  if (pathname.startsWith("/wissen") || pathname.startsWith("/api/wissen")) {
    return "wissen";
  }
  return null;
}

/** Öffentlich ohne Login (Lesen). Schreiben bleibt geschützt. */
export function isPublicApp(app: AppId | null | undefined): boolean {
  return app === "finder";
}

export function isPublicPath(pathname: string | null | undefined): boolean {
  // Leerer/unbekannter Pfad beim Hydraten darf NICHT zur Login-Seite zwingen
  if (!pathname || pathname === "/") return true;
  if (pathname.startsWith("/finder")) return true;
  if (pathname.startsWith("/sync-local")) return true;
  return isPublicApp(pathToAppId(pathname));
}

/** Nur bekannte, nicht-öffentliche Apps erfordern Login. */
export function requiresAuth(pathname: string | null | undefined): boolean {
  if (!pathname || pathname === "/" || pathname === "/login") return false;
  if (pathname.startsWith("/finder")) return false;
  if (pathname.startsWith("/sync-local")) return false;
  const app = pathToAppId(pathname);
  return Boolean(app && !isPublicApp(app));
}

export function userHasApp(user: Pick<AppUser, "apps" | "active">, app: AppId): boolean {
  return user.active && user.apps.includes(app);
}

export function firstAllowedAppHref(apps: AppId[]): string {
  const order: { id: AppId; href: string }[] = [
    { id: "finder", href: "/finder" },
    { id: "auswertung", href: "/gefahren" },
    { id: "sla", href: "/sla" },
    { id: "meetings", href: "/meetings" },
    { id: "wissen", href: "/wissen" },
    { id: "admin", href: "/benutzer" },
  ];
  for (const item of order) {
    if (apps.includes(item.id)) return item.href;
  }
  return "/";
}
