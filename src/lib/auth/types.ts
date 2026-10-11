export const APP_IDS = [
  "finder",
  "auswertung",
  "disposition",
  "sla",
  "meetings",
  "wissen",
  "verwaltung",
  "technikerverwaltung",
  "urlaube",
  "serviceboard",
  "garantiefaelle",
  "hprechnungen",
  "partnerrechnungen",
  "kostenvoranschlaege",
  "mailverwaltung",
  "lexmark",
  "admin",
] as const;

export type AppId = (typeof APP_IDS)[number];

export const APP_LABELS: Record<AppId, string> = {
  finder: "Techniker Finder",
  auswertung: "Technikerauswertung",
  disposition: "Disposition",
  sla: "SLA Auswertung",
  meetings: "Meetings",
  wissen: "Wissensassistent",
  verwaltung: "Verwaltung Philipp",
  technikerverwaltung: "Technikerverwaltung",
  urlaube: "Urlaube",
  serviceboard: "Serviceboard",
  garantiefaelle: "Garantiefälle",
  hprechnungen: "HP Rechnungen",
  partnerrechnungen: "Partner Rechnung",
  kostenvoranschlaege: "Kostenvoranschläge",
  mailverwaltung: "Mailverwaltung",
  lexmark: "Lexmark Knowledge",
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
  if (
    pathname.startsWith("/benutzer") ||
    pathname.startsWith("/einstellungen") ||
    pathname.startsWith("/api/users") ||
    pathname.startsWith("/api/releases") ||
    pathname.startsWith("/api/mail/smtp") ||
    pathname.startsWith("/api/mail/templates")
  ) {
    return "admin";
  }
  if (pathname.startsWith("/finder") || pathname.startsWith("/api/finder")) {
    return "finder";
  }
  if (
    pathname.startsWith("/disposition") ||
    pathname.startsWith("/api/disposition")
  ) {
    return "disposition";
  }
  if (
    pathname.startsWith("/gefahren") ||
    pathname.startsWith("/offen") ||
    pathname.startsWith("/touren") ||
    pathname.startsWith("/techniker-db") ||
    pathname.startsWith("/kpi") ||
    pathname.startsWith("/eingabe") ||
    pathname.startsWith("/auswertung") ||
    pathname.startsWith("/import") ||
    pathname.startsWith("/aelter-als-3-tage") ||
    pathname.startsWith("/api/auswertung")
  ) {
    return "auswertung";
  }
  if (pathname.startsWith("/sla") || pathname.startsWith("/api/sla")) {
    return "sla";
  }
  if (
    pathname.startsWith("/meetings") ||
    pathname.startsWith("/api/meetings")
  ) {
    return "meetings";
  }
  if (pathname.startsWith("/wissen") || pathname.startsWith("/api/wissen")) {
    return "wissen";
  }
  if (
    pathname.startsWith("/verwaltung") ||
    pathname.startsWith("/api/aufgaben") ||
    pathname.startsWith("/api/dienstreisen") ||
    pathname.startsWith("/api/projekte") ||
    pathname.startsWith("/api/telefonnummern")
  ) {
    return "verwaltung";
  }
  if (
    pathname.startsWith("/technikerverwaltung") ||
    pathname.startsWith("/api/technikerverwaltung")
  ) {
    return "technikerverwaltung";
  }
  if (pathname.startsWith("/urlaube") || pathname.startsWith("/api/urlaube")) {
    return "urlaube";
  }
  if (
    pathname.startsWith("/serviceboard") ||
    pathname.startsWith("/api/serviceboard")
  ) {
    return "serviceboard";
  }
  if (
    pathname.startsWith("/garantiefaelle") ||
    pathname.startsWith("/api/garantiefaelle")
  ) {
    return "garantiefaelle";
  }
  if (
    pathname.startsWith("/hp-rechnungen") ||
    pathname.startsWith("/api/hp-rechnungen")
  ) {
    return "hprechnungen";
  }
  if (
    pathname.startsWith("/partner-rechnungen") ||
    pathname.startsWith("/api/partner-rechnungen")
  ) {
    return "partnerrechnungen";
  }
  if (
    pathname.startsWith("/kostenvoranschlaege") ||
    pathname.startsWith("/api/kostenvoranschlaege")
  ) {
    return "kostenvoranschlaege";
  }
  if (
    pathname.startsWith("/mailverwaltung") ||
    pathname.startsWith("/api/mailverwaltung")
  ) {
    return "mailverwaltung";
  }
  if (pathname.startsWith("/lexmark") || pathname.startsWith("/api/lexmark")) {
    return "lexmark";
  }
  return null;
}

/** Keine App ist ohne Login öffentlich. */
export function isPublicApp(_app: AppId | null | undefined): boolean {
  return false;
}

export function isPublicPath(pathname: string | null | undefined): boolean {
  // Leerer/unbekannter Pfad beim Hydraten darf NICHT zur Login-Seite zwingen
  if (!pathname || pathname === "/") return true;
  if (pathname.startsWith("/sync-local")) return true;
  return isPublicApp(pathToAppId(pathname));
}

/** Nur bekannte, nicht-öffentliche Apps erfordern Login. */
export function requiresAuth(pathname: string | null | undefined): boolean {
  if (!pathname || pathname === "/" || pathname === "/login") return false;
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
    { id: "sla", href: "/sla" },
    { id: "meetings", href: "/meetings" },
    { id: "auswertung", href: "/gefahren" },
    { id: "disposition", href: "/disposition" },
    { id: "verwaltung", href: "/verwaltung/aufgaben" },
    { id: "technikerverwaltung", href: "/technikerverwaltung" },
    { id: "urlaube", href: "/urlaube/techniker" },
    { id: "serviceboard", href: "/serviceboard" },
    { id: "garantiefaelle", href: "/garantiefaelle" },
    { id: "hprechnungen", href: "/hp-rechnungen" },
    { id: "partnerrechnungen", href: "/partner-rechnungen" },
    { id: "kostenvoranschlaege", href: "/kostenvoranschlaege" },
    { id: "mailverwaltung", href: "/mailverwaltung" },
    { id: "lexmark", href: "/lexmark" },
    { id: "wissen", href: "/wissen" },
    { id: "admin", href: "/benutzer" },
  ];
  for (const item of order) {
    if (apps.includes(item.id)) return item.href;
  }
  return "/";
}
