export const AELTER_3_MAIL_TABS = ["zielOverdue", "ersatzteile", "termineFehlen"] as const;
export type Aelter3TageMailTab = (typeof AELTER_3_MAIL_TABS)[number];

export const AELTER_3_MAIL_TAB_LABELS: Record<Aelter3TageMailTab, string> = {
  zielOverdue: "Zieltermin überfällig",
  ersatzteile: "Ersatzteile angekommen",
  termineFehlen: "Wunsch- und Zieltermin fehlt",
};

export function isAelter3MailTab(value: string): value is Aelter3TageMailTab {
  return (AELTER_3_MAIL_TABS as readonly string[]).includes(value);
}

export type Aelter3TageMailTemplate = {
  tab: Aelter3TageMailTab;
  subject: string;
  body: string;
};

export type Aelter3TageMailTemplatesDb = {
  version: 1;
  templates: Aelter3TageMailTemplate[];
};

export const DEFAULT_AELTER_3_MAIL_TEMPLATES: Record<
  Aelter3TageMailTab,
  Omit<Aelter3TageMailTemplate, "tab">
> = {
  zielOverdue: {
    subject: "Tickets mit überfälligem Zieltermin ({{ticketCount}})",
    body: [
      "Hallo {{technicianName}},",
      "",
      "folgende offene Tickets haben einen überschrittenen Zieltermin (Stichtag {{referenceDate}}):",
      "",
      "{{ticketList}}",
      "",
      "Bitte Zieltermine prüfen und aktualisieren.",
      "",
      "Viele Grüße",
      "Serviceleitung",
    ].join("\n"),
  },
  ersatzteile: {
    subject: "Ersatzteile angekommen – Tickets ({{ticketCount}})",
    body: [
      "Hallo {{technicianName}},",
      "",
      "für folgende Tickets sind Ersatzteile angekommen:",
      "",
      "{{ticketList}}",
      "",
      "Bitte Terminierung / Bearbeitung veranlassen.",
      "",
      "Viele Grüße",
      "Serviceleitung",
    ].join("\n"),
  },
  termineFehlen: {
    subject: "Fehlende Wunsch- und Zieltermine ({{ticketCount}})",
    body: [
      "Hallo {{technicianName}},",
      "",
      "bei folgenden Tickets fehlen Wunsch- und Zieltermin:",
      "",
      "{{ticketList}}",
      "",
      "Bitte Termine im System pflegen.",
      "",
      "Viele Grüße",
      "Serviceleitung",
    ].join("\n"),
  },
};
