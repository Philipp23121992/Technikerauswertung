import type { AppId } from "@/lib/auth/types";

export type NavIconType =
  | "map"
  | "truck"
  | "sla"
  | "meeting"
  | "wissen"
  | "users"
  | "verwaltung"
  | "technikerverwaltung"
  | "disposition"
  | "urlaube"
  | "serviceboard"
  | "hprechnungen"
  | "partnerrechnungen"
  | "kostenvoranschlaege"
  | "mail"
  | "kunden"
  | "serviceleitung"
  | "philipp"
  | "releases"
  | "gear"
  | "chart"
  | "clock"
  | "import"
  | "assign"
  | "list"
  | "calendar"
  | "dashboard"
  | "prio"
  | "pin"
  | "task"
  | "travel"
  | "folder"
  | "inbox"
  | "file"
  | "bot"
  | "garantiefaelle"
  | "phone"
  | "lexmark"
  | "schema";

export type NavTab = {
  href: string;
  label: string;
  shortLabel: string;
  icon: NavIconType;
  match?: (path: string, search: string) => boolean;
};

export type NavItem = {
  href: string;
  match: (path: string) => boolean;
  label: string;
  shortLabel?: string;
  description: string;
  icon: NavIconType;
  appId: AppId;
  tabs?: NavTab[];
};

export type NavGroup = {
  id: string;
  label: string;
  shortLabel: string;
  icon: NavIconType;
  items: NavItem[];
};

export function queryView(search: string, fallback: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get("view") || fallback;
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "kunden",
    label: "Tools Kunden",
    shortLabel: "Kunden",
    icon: "kunden",
    items: [
      {
        href: "/sla",
        match: (path) => path.startsWith("/sla"),
        label: "SLA Auswertung",
        shortLabel: "SLA",
        description: "Kunden, SLA & Import",
        icon: "sla",
        appId: "sla",
        tabs: [
          { href: "/sla/kunden", label: "Kunden & SLA", shortLabel: "Kunden", icon: "kunden" },
          {
            href: "/sla",
            label: "Auswertung",
            shortLabel: "Auswertung",
            icon: "chart",
            match: (path) => path === "/sla",
          },
          { href: "/sla/bearbeitungszeit", label: "Bearbeitungszeit", shortLabel: "Zeit", icon: "clock" },
          { href: "/sla/techniker", label: "Techniker", shortLabel: "Techniker", icon: "users" },
          { href: "/sla/import", label: "CSV Import", shortLabel: "Import", icon: "import" },
          { href: "/sla/zuordnung", label: "Zuordnung", shortLabel: "Zuordnung", icon: "assign" },
        ],
      },
    ],
  },
  {
    id: "techniker",
    label: "Tools Techniker",
    shortLabel: "Techniker",
    icon: "truck",
    items: [
      {
        href: "/gefahren",
        match: (path) =>
          path.startsWith("/gefahren") ||
          path.startsWith("/offen") ||
          path.startsWith("/touren") ||
          path.startsWith("/techniker-db") ||
          path.startsWith("/kpi") ||
          path.startsWith("/eingabe") ||
          path.startsWith("/auswertung") ||
          path.startsWith("/import") ||
          path.startsWith("/aelter-als-3-tage"),
        label: "Technikerauswertung",
        shortLabel: "Auswertung",
        description: "Tickets, Touren & KPI",
        icon: "truck",
        appId: "auswertung",
        tabs: [
          {
            href: "/gefahren",
            label: "Gefahrene Tickets",
            shortLabel: "Gefahren",
            icon: "truck",
            match: (path) =>
              path === "/gefahren" ||
              path === "/eingabe" ||
              path === "/auswertung" ||
              path === "/import" ||
              path.startsWith("/gefahren/"),
          },
          { href: "/offen", label: "Offene Tickets", shortLabel: "Offen", icon: "list" },
          { href: "/touren", label: "Geplante Touren", shortLabel: "Touren", icon: "calendar" },
          { href: "/techniker-db", label: "Techniker DB", shortLabel: "DB", icon: "technikerverwaltung" },
          { href: "/kpi", label: "KPI Philipp", shortLabel: "KPI", icon: "chart" },
          {
            href: "/aelter-als-3-tage",
            label: "Älter als 3 Tage",
            shortLabel: ">3 Tage",
            icon: "clock",
          },
        ],
      },
      {
        href: "/disposition",
        match: (path) => path.startsWith("/disposition"),
        label: "Disposition",
        shortLabel: "Dispo",
        description: "Auslastung, Kanban & Tourenplanung",
        icon: "disposition",
        appId: "disposition",
        tabs: [
          {
            href: "/disposition",
            label: "Dashboard",
            shortLabel: "Dashboard",
            icon: "dashboard",
            match: (path, search) =>
              path.startsWith("/disposition") && queryView(search, "dashboard") === "dashboard",
          },
          {
            href: "/disposition?view=tickets",
            label: "Techniker Tickets",
            shortLabel: "Techniker Tickets",
            icon: "list",
            match: (path, search) => {
              if (!path.startsWith("/disposition")) return false;
              const current = queryView(search, "dashboard");
              return (
                current === "tickets" ||
                current === "kanban" ||
                current === "tour" ||
                current === "plan" ||
                current === "nachfrage" ||
                current === "moeglich" ||
                current === "ist"
              );
            },
          },
          {
            href: "/disposition?view=prio",
            label: "Priorisierung Tickets",
            shortLabel: "Prio",
            icon: "prio",
            match: (path, search) =>
              path.startsWith("/disposition") && queryView(search, "dashboard") === "prio",
          },
        ],
      },
      {
        href: "/technikerverwaltung",
        match: (path) => path.startsWith("/technikerverwaltung"),
        label: "Technikerverwaltung",
        shortLabel: "Techniker",
        description: "Stammdaten & Übersicht",
        icon: "technikerverwaltung",
        appId: "technikerverwaltung",
      },
      {
        href: "/urlaube/techniker",
        match: (path) => path.startsWith("/urlaube/techniker"),
        label: "Urlaube Techniker",
        shortLabel: "Urlaub",
        description: "Anträge & Kalender",
        icon: "urlaube",
        appId: "urlaube",
      },
    ],
  },
  {
    id: "serviceleitung",
    label: "Tools Serviceleitung",
    shortLabel: "Serviceleitung",
    icon: "serviceleitung",
    items: [
      {
        href: "/finder",
        match: (path) => path.startsWith("/finder"),
        label: "Techniker Finder",
        shortLabel: "Finder",
        description: "PLZ-Suche & Standorte",
        icon: "map",
        appId: "finder",
        tabs: [
          {
            href: "/finder",
            label: "PLZ-Suche",
            shortLabel: "Suche",
            icon: "map",
            match: (path) => path === "/finder",
          },
          { href: "/finder/standorte", label: "Standorte", shortLabel: "Standorte", icon: "pin" },
          { href: "/finder/techniker", label: "Techniker-DB", shortLabel: "Techniker", icon: "users" },
          { href: "/finder/partner", label: "Partner-DB", shortLabel: "Partner", icon: "partnerrechnungen" },
        ],
      },
      {
        href: "/meetings",
        match: (path) => path.startsWith("/meetings"),
        label: "Meetings",
        shortLabel: "Meetings",
        description: "Techniker & Ressourcen",
        icon: "meeting",
        appId: "meetings",
        tabs: [
          {
            href: "/meetings",
            label: "Techniker Meeting",
            shortLabel: "Techniker",
            icon: "meeting",
            match: (path) => path === "/meetings",
          },
          { href: "/meetings/ressourcen", label: "Ressourcenmeeting", shortLabel: "Ressourcen", icon: "calendar" },
          { href: "/meetings/techniker-db", label: "Techniker DB", shortLabel: "DB", icon: "technikerverwaltung" },
        ],
      },
      {
        href: "/serviceboard",
        match: (path) => path.startsWith("/serviceboard"),
        label: "Serviceboard",
        shortLabel: "Board",
        description: "Kanban Serviceleitung",
        icon: "serviceboard",
        appId: "serviceboard",
      },
      {
        href: "/garantiefaelle",
        match: (path) => path.startsWith("/garantiefaelle"),
        label: "Garantiefälle",
        shortLabel: "Garantie",
        description: "Fälle, Auswertung & Preise",
        icon: "garantiefaelle",
        appId: "garantiefaelle",
        tabs: [
          {
            href: "/garantiefaelle",
            label: "Übersicht",
            shortLabel: "Übersicht",
            icon: "dashboard",
            match: (path, search) =>
              path.startsWith("/garantiefaelle") && queryView(search, "uebersicht") === "uebersicht",
          },
          {
            href: "/garantiefaelle?view=faelle",
            label: "Fälle",
            shortLabel: "Fälle",
            icon: "list",
            match: (path, search) =>
              path.startsWith("/garantiefaelle") && queryView(search, "uebersicht") === "faelle",
          },
          {
            href: "/garantiefaelle?view=auswertung",
            label: "Auswertung",
            shortLabel: "Auswertung",
            icon: "chart",
            match: (path, search) =>
              path.startsWith("/garantiefaelle") && queryView(search, "uebersicht") === "auswertung",
          },
          {
            href: "/garantiefaelle?view=import",
            label: "Import",
            shortLabel: "Import",
            icon: "import",
            match: (path, search) =>
              path.startsWith("/garantiefaelle") && queryView(search, "uebersicht") === "import",
          },
          {
            href: "/garantiefaelle?view=preise",
            label: "Herstellerpreise",
            shortLabel: "Preise",
            icon: "hprechnungen",
            match: (path, search) =>
              path.startsWith("/garantiefaelle") && queryView(search, "uebersicht") === "preise",
          },
        ],
      },
      {
        href: "/hp-rechnungen",
        match: (path) => path.startsWith("/hp-rechnungen"),
        label: "HP Rechnungen",
        shortLabel: "HP",
        description: "Rechnungen, Gutschriften & Import",
        icon: "hprechnungen",
        appId: "hprechnungen",
      },
      {
        href: "/partner-rechnungen",
        match: (path) => path.startsWith("/partner-rechnungen"),
        label: "Partner Rechnung",
        shortLabel: "Partner",
        description: "Rechnungen, Gutschriften & Import",
        icon: "partnerrechnungen",
        appId: "partnerrechnungen",
        tabs: [
          {
            href: "/partner-rechnungen",
            label: "Rechnungen",
            shortLabel: "Liste",
            icon: "list",
            match: (path, search) =>
              path.startsWith("/partner-rechnungen") && queryView(search, "liste") === "liste",
          },
          {
            href: "/partner-rechnungen?view=auswertung",
            label: "Auswertung",
            shortLabel: "Auswertung",
            icon: "chart",
            match: (path, search) =>
              path.startsWith("/partner-rechnungen") && queryView(search, "liste") === "auswertung",
          },
        ],
      },
      {
        href: "/kostenvoranschlaege",
        match: (path) => path.startsWith("/kostenvoranschlaege"),
        label: "Kostenvoranschläge",
        shortLabel: "KV",
        description: "KV-Liste, Status & Import",
        icon: "kostenvoranschlaege",
        appId: "kostenvoranschlaege",
        tabs: [
          {
            href: "/kostenvoranschlaege",
            label: "Kostenvoranschläge",
            shortLabel: "Liste",
            icon: "list",
            match: (path, search) =>
              path.startsWith("/kostenvoranschlaege") && queryView(search, "liste") === "liste",
          },
          {
            href: "/kostenvoranschlaege?view=zustaendige",
            label: "Zuständige",
            shortLabel: "Zuständige",
            icon: "users",
            match: (path, search) =>
              path.startsWith("/kostenvoranschlaege") && queryView(search, "liste") === "zustaendige",
          },
        ],
      },
      {
        href: "/urlaube/serviceleitung",
        match: (path) => path.startsWith("/urlaube/serviceleitung"),
        label: "Urlaube Serviceleitung",
        shortLabel: "Urlaub SL",
        description: "Anträge & Kalender",
        icon: "urlaube",
        appId: "urlaube",
      },
    ],
  },
  {
    id: "philipp",
    label: "Tools Philipp",
    shortLabel: "Philipp",
    icon: "philipp",
    items: [
      {
        href: "/verwaltung/schema",
        match: (path) => path.startsWith("/verwaltung/schema"),
        label: "Schema",
        shortLabel: "Schema",
        description: "Mindmaps & Flussdiagramme als Projekt",
        icon: "schema",
        appId: "verwaltung",
      },
      {
        href: "/verwaltung/aufgaben",
        match: (path) =>
          path.startsWith("/verwaltung") && !path.startsWith("/verwaltung/schema"),
        label: "Verwaltung Philipp",
        shortLabel: "Verwaltung",
        description: "Aufgaben, Reisen, Projekte & Telefonbuch",
        icon: "verwaltung",
        appId: "verwaltung",
        tabs: [
          { href: "/verwaltung/aufgaben", label: "Aufgaben", shortLabel: "Aufgaben", icon: "task" },
          { href: "/verwaltung/dienstreisen", label: "Dienstreisen", shortLabel: "Reisen", icon: "travel" },
          { href: "/verwaltung/projekte", label: "Projekte", shortLabel: "Projekte", icon: "folder" },
          {
            href: "/verwaltung/telefonnummern",
            label: "Telefonnummern",
            shortLabel: "Telefon",
            icon: "phone",
          },
        ],
      },
      {
        href: "/lexmark",
        match: (path) => path.startsWith("/lexmark"),
        label: "Lexmark Knowledge",
        shortLabel: "Lexmark",
        description: "Manuals, Fehlercodes & FRUs",
        icon: "lexmark",
        appId: "lexmark",
        tabs: [
          {
            href: "/lexmark",
            label: "Analyse",
            shortLabel: "Analyse",
            icon: "import",
            match: (path, search) =>
              path.startsWith("/lexmark") && queryView(search, "analyse") === "analyse",
          },
          {
            href: "/lexmark?view=modelle",
            label: "Modelle",
            shortLabel: "Modelle",
            icon: "list",
            match: (path, search) =>
              path.startsWith("/lexmark") && queryView(search, "analyse") === "modelle",
          },
          {
            href: "/lexmark?view=codes",
            label: "Fehlercodes",
            shortLabel: "Codes",
            icon: "task",
            match: (path, search) =>
              path.startsWith("/lexmark") && queryView(search, "analyse") === "codes",
          },
          {
            href: "/lexmark?view=teile",
            label: "Ersatzteile",
            shortLabel: "FRUs",
            icon: "file",
            match: (path, search) =>
              path.startsWith("/lexmark") && queryView(search, "analyse") === "teile",
          },
          {
            href: "/lexmark?view=beziehungen",
            label: "Beziehungen",
            shortLabel: "Ketten",
            icon: "assign",
            match: (path, search) =>
              path.startsWith("/lexmark") && queryView(search, "analyse") === "beziehungen",
          },
          {
            href: "/lexmark?view=review",
            label: "Review",
            shortLabel: "Review",
            icon: "clock",
            match: (path, search) =>
              path.startsWith("/lexmark") && queryView(search, "analyse") === "review",
          },
        ],
      },
      {
        href: "/mailverwaltung",
        match: (path) => path.startsWith("/mailverwaltung"),
        label: "Mailverwaltung",
        shortLabel: "Mail",
        description: "Outlook, Absender & KI",
        icon: "mail",
        appId: "mailverwaltung",
        tabs: [
          {
            href: "/mailverwaltung",
            label: "Posteingang",
            shortLabel: "Post",
            icon: "inbox",
            match: (path) => path === "/mailverwaltung",
          },
          { href: "/mailverwaltung/dateien", label: "Wichtige Dateien", shortLabel: "Dateien", icon: "file" },
          { href: "/mailverwaltung/protokoll", label: "Protokoll", shortLabel: "Protokoll", icon: "list" },
          { href: "/mailverwaltung/einstellungen", label: "Einstellungen", shortLabel: "Setup", icon: "gear" },
        ],
      },
    ],
  },
  {
    id: "inarbeit",
    label: "in Arbeit",
    shortLabel: "in Arbeit",
    icon: "wissen",
    items: [
      {
        href: "/wissen",
        match: (path) => path.startsWith("/wissen"),
        label: "Wissensdatenbank",
        shortLabel: "Wissen",
        description: "Alttickets, Manuale & Chat",
        icon: "wissen",
        appId: "wissen",
        tabs: [
          {
            href: "/wissen",
            label: "Wissensdatenbank",
            shortLabel: "Manuale",
            icon: "wissen",
            match: (path) => path === "/wissen",
          },
          { href: "/wissen/tickets", label: "Tickets", shortLabel: "Tickets", icon: "list" },
          { href: "/wissen/chatbot", label: "Chatbot", shortLabel: "Chatbot", icon: "bot" },
        ],
      },
    ],
  },
  {
    id: "einstellung",
    label: "Einstellungen",
    shortLabel: "Einstellungen",
    icon: "gear",
    items: [
      {
        href: "/benutzer",
        match: (path) => path === "/benutzer",
        label: "Benutzer",
        shortLabel: "Benutzer",
        description: "Konten & Freigaben",
        icon: "users",
        appId: "admin",
      },
      {
        href: "/benutzer/releases",
        match: (path) => path.startsWith("/benutzer/releases"),
        label: "Releases",
        shortLabel: "Releases",
        description: "Vorschau & Sprint-Freigabe",
        icon: "releases",
        appId: "admin",
      },
      {
        href: "/einstellungen/smtp",
        match: (path) =>
          path.startsWith("/einstellungen/smtp") || path.startsWith("/meetings/smtp"),
        label: "E-Mail / SMTP",
        shortLabel: "SMTP",
        description: "Versand für alle Fälligkeiten",
        icon: "mail",
        appId: "admin",
      },
    ],
  },
];

export const HEADER_GROUPS = NAV_GROUPS.filter((group) => group.id !== "einstellung");
export const SETTINGS_GROUP = NAV_GROUPS.find((group) => group.id === "einstellung")!;

export function groupAllowed(
  group: NavGroup,
  hasApp: (app: AppId) => boolean,
): boolean {
  return group.items.some((item) => hasApp(item.appId));
}

export function firstAllowedHref(
  group: NavGroup,
  hasApp: (app: AppId) => boolean,
): string | null {
  return group.items.find((item) => hasApp(item.appId))?.href ?? null;
}

export function groupForPath(path: string): NavGroup | undefined {
  return NAV_GROUPS.find((group) => group.items.some((item) => item.match(path)));
}

export function itemForPath(path: string): NavItem | undefined {
  for (const group of NAV_GROUPS) {
    const item = group.items.find((entry) => entry.match(path));
    if (item) return item;
  }
  return undefined;
}

export function isTabActive(tab: NavTab, path: string, search: string): boolean {
  if (tab.match) return tab.match(path, search);
  const [tabPath] = tab.href.split("?");
  if (path === tabPath) return true;
  return path.startsWith(`${tabPath}/`);
}
