export type TechnicianRole =
  | "fieldservice"
  | "onsite"
  | "partner"
  | "ausser_wertung";

export type Technician = {
  id: string;
  name: string;
  role: TechnicianRole;
  /** Für optionale Zusatzinfos; Auswertung nutzt die E-Mail nicht. */
  email?: string;
};

export type DayStatus =
  | "tickets"
  | "urlaub"
  | "urlaub_halb"
  | "ueberstunden"
  | "ueberstunden_halb"
  | "krank"
  | "projekt"
  | "schulungen"
  | "vertretung"
  | "siebel"
  | "lager";

/** Key format: `${technicianId}|${YYYY-MM-DD}` */
export type TicketMap = Record<string, number>;
export type StatusMap = Record<string, DayStatus>;
export type NoteMap = Record<string, string>;

export type TrackerState = {
  year: number;
  technicians: Technician[];
  tickets: TicketMap;
  statuses: StatusMap;
  notes: NoteMap;
  /** Unabhängige Erfassung: Offene Tickets Gesamt */
  openTickets: TicketMap;
  openStatuses: StatusMap;
  openNotes: NoteMap;
  /** Unabhängige Erfassung: Geplante Touren Fieldservice */
  tourTickets: TicketMap;
};

export type EntryTab = "eingabe" | "monat" | "auswertung";

export const ROLE_OPTIONS: { id: TechnicianRole; label: string }[] = [
  { id: "fieldservice", label: "Fieldservicetechniker" },
  { id: "onsite", label: "Onsidetechniker" },
  { id: "partner", label: "Partner" },
  { id: "ausser_wertung", label: "Außer Wertung" },
];

export const STATUS_OPTIONS: {
  id: DayStatus;
  label: string;
  color: string;
  short: string;
}[] = [
  { id: "tickets", label: "Tickets eingeben", color: "#dc2626", short: "T" },
  { id: "urlaub", label: "Urlaub", color: "#166534", short: "U" },
  { id: "urlaub_halb", label: "Urlaub 1/2 Tag", color: "#86efac", short: "U½" },
  { id: "ueberstunden", label: "Überstunden", color: "#38bdf8", short: "Ü" },
  { id: "ueberstunden_halb", label: "Überstunden 1/2 Tag", color: "#1d4ed8", short: "Ü½" },
  { id: "krank", label: "Krank", color: "#7c3aed", short: "K" },
  { id: "projekt", label: "Projekt", color: "#ec4899", short: "P" },
  { id: "schulungen", label: "Schulungen", color: "#84cc16", short: "S" },
  { id: "vertretung", label: "Vertretung", color: "#4338ca", short: "V" },
  { id: "siebel", label: "Siebel", color: "#92400e", short: "Si" },
  { id: "lager", label: "Lager", color: "#ea580c", short: "L" },
];

export function statusNeedsNote(status: DayStatus): boolean {
  return status === "projekt" || status === "vertretung";
}

export function ticketKey(technicianId: string, date: string): string {
  return `${technicianId}|${date}`;
}

export const DEFAULT_TECHNICIANS: Technician[] = [
  { id: "t1", name: "Leonard Apel", role: "fieldservice" },
  { id: "t2", name: "Philip Arndt", role: "fieldservice" },
  { id: "t3", name: "Yoldas Ates", role: "fieldservice" },
  { id: "t4", name: "Stephan Fecke", role: "fieldservice" },
  { id: "t5", name: "Marc Gruneberg", role: "fieldservice" },
  { id: "t6", name: "Christian Jenke", role: "fieldservice" },
  { id: "t7", name: "Anja Kleindl", role: "fieldservice" },
  { id: "t8", name: "Burak Köseler", role: "fieldservice" },
  { id: "t9", name: "Vladimir Munteanu", role: "fieldservice" },
  { id: "t10", name: "Daniele Schweiger", role: "fieldservice" },
  { id: "t11", name: "Daniel Tancan", role: "fieldservice" },
  { id: "t12", name: "Waldemar Wairich", role: "fieldservice" },
  { id: "t13", name: "Chris Zimmermann", role: "fieldservice" },
  { id: "o1", name: "Volodymyr Habchak", role: "onsite" },
  { id: "o2", name: "medbo, Service", role: "onsite" },
  { id: "o3", name: "Patrick Kluger", role: "onsite" },
  { id: "o4", name: "Stefan Schmid", role: "onsite" },
  { id: "o5", name: "Michael Tauchen", role: "onsite" },
  { id: "o6", name: "Alexander Sogaro", role: "onsite" },
  { id: "o7", name: "Gregor Erdmann", role: "onsite" },
];

export const MONTH_LABELS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
] as const;
