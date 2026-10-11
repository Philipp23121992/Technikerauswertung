import { findBestColumn, findTechnicianColumn } from "@/lib/analyze";
import {
  matchTechnicianByName,
  normalizePersonName,
  parseFlexibleDate,
  personNameKeys,
  type ImportPersonSummary,
} from "@/lib/ticket-import";
import { ROLE_OPTIONS, type Technician, type TechnicianRole } from "@/lib/tracker-types";
import type { ImportedDataset } from "@/lib/types";
import {
  UNASSIGNED_TECH_ID,
  UNASSIGNED_TECH_NAME,
  isCustomTicket,
  normalizeTicket,
  ticketScheduleStart,
  type DispositionTicket,
  type DispositionTicketDraft,
} from "./types";
import { classifyWorkKind, type TicketWorkKind } from "./priority";

const ZIELTERMIN_ALIASES = [
  "zieltermin",
  "targetdate",
  "target_date",
  "duedate",
  "due_date",
];

const TERMIN_ALIASES = [
  "wunschtermin",
  "wunschdatum",
  "desireddate",
  "requesteddate",
  "preferreddate",
  "termin",
  "einsatzdatum",
  "einsatztermin",
  "naechstertermin",
  "naechsterzieltermin",
  "geplantertermin",
  "geplantestart",
  "geplantezeit",
  "scheduledstart",
  "appointment",
  "vereinbartertermin",
  "fixtermin",
  "onsitetermin",
  "startdatum",
  "datumvon",
];

const GENERIC_DATE_ALIASES = ["datum", "date", "tag"];

const CREATED_ALIASES = [
  "erstelltam",
  "erstellt",
  "erstellungsdatum",
  "anlagedatum",
  "angelegtam",
  "openedat",
  "opened",
  "createdat",
  "createdon",
  "created",
  "syscreatedon",
  "opendate",
  "openeddate",
];

const TICKET_ALIASES = [
  "ticketnummer",
  "ticketnr",
  "ticketno",
  "ticket",
  "vorgangsnummer",
  "vorgang",
  "auftrag",
  "casenumber",
  "incident",
];

const CUSTOMER_ALIASES = [
  "kundenname",
  "kunde",
  "firma",
  "customer",
  "unternehmen",
  "endkunde",
  "account",
  "company",
  "organisation",
  "organization",
  "accountname",
  "kundenbezeichnung",
];

const STREET_ALIASES = [
  "strasse",
  "straße",
  "str.",
  "street",
  "kundestrasse",
  "einsatzstrasse",
];

const PLZ_ALIASES = ["plz", "postleitzahl", "zip", "postalcode", "postcode"];

const CITY_ALIASES = ["ort", "stadt", "city", "wohnort", "einsatzortstadt", "kundeort"];

const ADDRESS_ALIASES = [
  "zieladresse",
  "einsatzadresse",
  "kundeadresse",
  "anschrift",
  "adresse",
  "einsatzort",
  "location",
  "address",
];

const SUMMARY_ALIASES = [
  "zusammenfassung",
  "summary",
  "kurzbeschreibung",
  "kurztext",
  "ticketsummary",
  "schlagworte",
];

const SERVICE_ALIASES = [
  "service",
  "services",
  "dienstleistung",
  "servicetyp",
  "serviceart",
  "produkt",
  "product",
];

const NOTE_ALIASES = [
  "abwicklungsnotiz",
  "abwicklungshinweis",
  "abwicklung",
  "resolutionnote",
  "worknotes",
  "work_notes",
];

const PLATE_ALIASES = [
  "kennzeichen",
  "kfzkennzeichen",
  "amtlicheskennzeichen",
  "nummernschild",
  "licenseplate",
  "numberplate",
];

export type DispositionImportResult = {
  drafts: DispositionTicketDraft[];
  matchedRows: number;
  skippedRows: number;
  unmatchedSkippedRows: number;
  withAddress: number;
  withoutAddress: number;
  techColumn: string;
  dateColumn: string | null;
  terminColumn: string | null;
  createdColumn: string | null;
  serviceColumn: string | null;
  summaryColumn: string | null;
  ticketColumn: string | null;
  customerColumn: string | null;
  streetColumn: string | null;
  plzColumn: string | null;
  cityColumn: string | null;
  addressColumn: string | null;
  noteColumn: string | null;
  kennzeichenColumn: string | null;
  totalRows: number;
  dateFrom: string | null;
  dateTo: string | null;
  matchedPeople: ImportPersonSummary[];
  unmatchedPeople: ImportPersonSummary[];
  workKindCounts: Record<TicketWorkKind, number>;
  byTechnicianTotals: {
    technicianId: string;
    technicianName: string;
    roleLabel: string;
    tickets: number;
  }[];
};

function roleLabel(role: TechnicianRole): string {
  return ROLE_OPTIONS.find((item) => item.id === role)?.label ?? role;
}

function extractPlz(value: string): string {
  const match = value.match(/\b(\d{5})\b/);
  return match?.[1] ?? "";
}

function splitAddress(value: string): { street: string; plz: string; city: string } {
  const trimmed = value.replace(/\s+/g, " ").trim();
  const plz = extractPlz(trimmed);
  if (!plz) return { street: trimmed, plz: "", city: "" };
  const [before, after] = trimmed.split(plz);
  return {
    street: (before || "").replace(/[,\s]+$/g, "").trim(),
    plz,
    city: (after || "").replace(/^[,\s]+/g, "").trim(),
  };
}

function fingerprint(draft: Omit<DispositionTicketDraft, "fingerprint">): string {
  return [
    normalizePersonName(draft.ticketNo || `${draft.customer}|${draft.addressLabel}`),
    draft.plz,
    normalizePersonName(draft.street),
    draft.zieltermin ?? draft.termin ?? "",
  ].join("|");
}

export function technicianNameLookup<T extends { id: string; name: string }>(
  technicians: T[],
): Map<string, T> {
  const lookup = new Map<string, T>();
  for (const tech of technicians) {
    for (const key of personNameKeys(tech.name)) {
      if (!lookup.has(key)) lookup.set(key, tech);
    }
  }
  return lookup;
}

function hasKanbanPlan(ticket: DispositionTicket): boolean {
  return ticket.plannedStartMin != null || Boolean(ticket.spanEnd);
}

/** CSV-Felder aktualisieren, Dispo-Planung (Notiz, Art, Flags, Uhrzeit) behalten. */
export function mergeImportedTicket(
  prev: DispositionTicket,
  draft: DispositionTicketDraft,
  nextTechId: string,
  nextTechName: string,
  now: string,
  fileName: string,
): DispositionTicket | null {
  const technicianChanged = prev.technicianId !== nextTechId;
  const nextZieltermin =
    draft.zieltermin || (hasKanbanPlan(prev) ? prev.zieltermin : null);
  const nextStart = nextZieltermin || draft.termin || null;
  const dateChanged = ticketScheduleStart(prev) !== nextStart;
  const addressChanged =
    prev.street !== draft.street || prev.plz !== draft.plz || prev.city !== draft.city;
  return normalizeTicket({
    ...prev,
    ...draft,
    id: prev.id,
    kind: prev.kind,
    technicianId: nextTechId,
    technicianName: nextTechName,
    zieltermin: nextZieltermin,
    termin: draft.termin,
    flags: prev.flags,
    plannerNote: prev.plannerNote,
    workKindManual: prev.workKindManual,
    updates: prev.updates,
    plannedStartMin: technicianChanged || dateChanged ? null : prev.plannedStartMin,
    durationMin: prev.durationMin,
    spanEnd: dateChanged ? null : prev.spanEnd,
    tourDate: technicianChanged || addressChanged ? null : prev.tourDate,
    tourStartMin: technicianChanged || addressChanged ? null : prev.tourStartMin,
    lat: addressChanged ? null : prev.lat,
    lon: addressChanged ? null : prev.lon,
    status: "offen",
    closedAt: null,
    importedAt: now,
    sourceFile: fileName,
  });
}

/** Unzugeordnete Import-Tickets einem Fieldservice-/Onsidetechniker zuordnen. */
export function rematchUnassignedTickets(
  tickets: DispositionTicket[],
  technicians: { id: string; name: string }[],
): DispositionTicket[] {
  if (!technicians.length) return tickets;
  const lookup = technicianNameLookup(technicians);
  return tickets.map((ticket) => {
    if (isCustomTicket(ticket) || ticket.technicianId !== UNASSIGNED_TECH_ID) return ticket;
    const matched = matchTechnicianByName(ticket.technicianName, lookup);
    if (!matched) return ticket;
    return (
      normalizeTicket({
        ...ticket,
        technicianId: matched.id,
        technicianName: matched.name,
      }) ?? ticket
    );
  });
}

export function buildDispositionImport(
  dataset: ImportedDataset,
  technicians: Technician[],
): DispositionImportResult {
  const techCol = findTechnicianColumn(dataset.headers);
  if (!techCol) {
    throw new Error("CSV braucht eine Spalte für Bearbeiter/Techniker.");
  }

  const dateCol =
    findBestColumn(dataset.headers, ZIELTERMIN_ALIASES) ||
    (findBestColumn(dataset.headers, TERMIN_ALIASES)
      ? null
      : findBestColumn(dataset.headers, GENERIC_DATE_ALIASES));
  const terminCol = findBestColumn(dataset.headers, TERMIN_ALIASES, dateCol);
  const createdCol = findBestColumn(dataset.headers, CREATED_ALIASES, dateCol || terminCol);
  const ticketCol = findBestColumn(dataset.headers, TICKET_ALIASES);
  const customerCol = findBestColumn(dataset.headers, CUSTOMER_ALIASES);
  const streetCol = findBestColumn(dataset.headers, STREET_ALIASES);
  const plzCol = findBestColumn(dataset.headers, PLZ_ALIASES);
  const cityCol = findBestColumn(dataset.headers, CITY_ALIASES);
  const addressCol = findBestColumn(dataset.headers, ADDRESS_ALIASES);
  const noteCol = findBestColumn(dataset.headers, NOTE_ALIASES);
  const kennzeichenCol = findBestColumn(dataset.headers, PLATE_ALIASES);
  const serviceCol = findBestColumn(dataset.headers, SERVICE_ALIASES, techCol);
  const summaryCol = findBestColumn(
    dataset.headers,
    SUMMARY_ALIASES,
    noteCol || kennzeichenCol || serviceCol,
  );

  const lookup = technicianNameLookup(technicians);

  const drafts: DispositionTicketDraft[] = [];
  const personStats = new Map<
    string,
    { csvName: string; tickets: number; technician: Technician | null }
  >();

  let matchedRows = 0;
  let skippedRows = 0;
  let unmatchedSkippedRows = 0;
  let withAddress = 0;
  let withoutAddress = 0;
  let dateFrom: string | null = null;
  let dateTo: string | null = null;

  for (const row of dataset.rows) {
    const techName = (row[techCol] ?? "").trim();
    const zieltermin = dateCol ? parseFlexibleDate(row[dateCol] ?? "") : null;
    const termin = terminCol ? parseFlexibleDate(row[terminCol] ?? "") : null;
    const erstelltAm = createdCol ? parseFlexibleDate(row[createdCol] ?? "") : null;
    const boardDate = zieltermin || termin;
    const ticketNo = ticketCol ? (row[ticketCol] ?? "").trim() : "";
    const combined = addressCol ? (row[addressCol] ?? "").trim() : "";
    const parsedCombined = combined ? splitAddress(combined) : { street: "", plz: "", city: "" };
    const street = (streetCol ? (row[streetCol] ?? "").trim() : "") || parsedCombined.street;
    const plz =
      extractPlz(plzCol ? (row[plzCol] ?? "") : "") || parsedCombined.plz || extractPlz(combined);
    const city = (cityCol ? (row[cityCol] ?? "").trim() : "") || parsedCombined.city;
    const addressLabel = [street, plz, city].filter(Boolean).join(", ") || combined;
    const customer =
      (customerCol ? (row[customerCol] ?? "").trim() : "") ||
      (!streetCol && parsedCombined.street ? parsedCombined.street : "");
    const note = noteCol ? (row[noteCol] ?? "").trim() : "";
    const kennzeichen = kennzeichenCol ? (row[kennzeichenCol] ?? "").trim() : "";
    const service = serviceCol ? (row[serviceCol] ?? "").trim() : "";
    const summary = summaryCol ? (row[summaryCol] ?? "").trim() : "";
    const hasIdentity = Boolean(ticketNo || customer || addressLabel || boardDate);

    if (!hasIdentity) {
      skippedRows += 1;
      continue;
    }

    const matched = techName ? matchTechnicianByName(techName, lookup) : null;
    if (!matched) {
      unmatchedSkippedRows += 1;
      const csvName = techName || UNASSIGNED_TECH_NAME;
      const personKey = `unmatched:${normalizePersonName(csvName)}`;
      const existing = personStats.get(personKey);
      if (existing) existing.tickets += 1;
      else personStats.set(personKey, { csvName, tickets: 1, technician: null });
    } else {
      matchedRows += 1;
      const existing = personStats.get(matched.id);
      if (existing) existing.tickets += 1;
      else personStats.set(matched.id, { csvName: matched.name, tickets: 1, technician: matched });
    }

    if (addressLabel) withAddress += 1;
    else withoutAddress += 1;
    if (boardDate) {
      if (!dateFrom || boardDate < dateFrom) dateFrom = boardDate;
      if (!dateTo || boardDate > dateTo) dateTo = boardDate;
    }

    const base = {
      technicianId: matched?.id ?? UNASSIGNED_TECH_ID,
      technicianName: matched?.name ?? (techName || UNASSIGNED_TECH_NAME),
      ticketNo,
      customer,
      service,
      summary,
      street,
      plz,
      city,
      addressLabel,
      zieltermin,
      termin,
      erstelltAm,
      note,
      kennzeichen,
    };
    drafts.push({ ...base, fingerprint: fingerprint(base) });
  }

  const matchedPeople: ImportPersonSummary[] = [];
  const unmatchedPeople: ImportPersonSummary[] = [];
  const totals: DispositionImportResult["byTechnicianTotals"] = [];

  for (const entry of personStats.values()) {
    if (entry.technician) {
      matchedPeople.push({
        csvName: entry.csvName,
        tickets: entry.tickets,
        technicianId: entry.technician.id,
        technicianName: entry.technician.name,
        role: entry.technician.role,
        roleLabel: roleLabel(entry.technician.role),
        matched: true,
      });
      totals.push({
        technicianId: entry.technician.id,
        technicianName: entry.technician.name,
        roleLabel: roleLabel(entry.technician.role),
        tickets: entry.tickets,
      });
    } else {
      unmatchedPeople.push({
        csvName: entry.csvName,
        tickets: entry.tickets,
        technicianId: null,
        technicianName: "Partner",
        role: "partner-bucket",
        roleLabel: "Partner",
        matched: false,
      });
    }
  }

  matchedPeople.sort(
    (a, b) => b.tickets - a.tickets || a.technicianName.localeCompare(b.technicianName, "de"),
  );
  unmatchedPeople.sort((a, b) => b.tickets - a.tickets || a.csvName.localeCompare(b.csvName, "de"));
  totals.sort(
    (a, b) => b.tickets - a.tickets || a.technicianName.localeCompare(b.technicianName, "de"),
  );

  const workKindCounts: Record<TicketWorkKind, number> = { stoerung: 0, umbau: 0, none: 0 };
  for (const draft of drafts) {
    workKindCounts[classifyWorkKind(draft)] += 1;
  }

  return {
    drafts,
    matchedRows,
    skippedRows,
    unmatchedSkippedRows,
    withAddress,
    withoutAddress,
    techColumn: techCol,
    dateColumn: dateCol,
    terminColumn: terminCol,
    createdColumn: createdCol,
    serviceColumn: serviceCol,
    summaryColumn: summaryCol,
    ticketColumn: ticketCol,
    customerColumn: customerCol,
    streetColumn: streetCol,
    plzColumn: plzCol,
    cityColumn: cityCol,
    addressColumn: addressCol,
    noteColumn: noteCol,
    kennzeichenColumn: kennzeichenCol,
    totalRows: dataset.rows.length,
    dateFrom,
    dateTo,
    matchedPeople,
    unmatchedPeople,
    workKindCounts,
    byTechnicianTotals: totals,
  };
}
