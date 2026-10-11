import { personNameKeys } from "@/lib/ticket-import";
import { vacationKindLabel, type VacationKind, type VacationRequest } from "@/lib/urlaube/types";
import {
  DEFAULT_SERVICE_MIN,
  TICKETS_PER_DAY,
  dayLoadTone,
  nextWorkday,
  ticketSlotCap,
  ticketSlotPercent,
  todayIso,
  type DayLoadTone,
} from "./schedule";
import {
  ticketOccupiesActualDate,
  ticketOccupiesDemandDate,
  ticketOccupiesPlanDate,
  type DispositionTicket,
} from "./types";

export type DayBlock = {
  kind: VacationKind | "vertretung";
  label: string;
  note: string;
  fillsCapacity: boolean;
};

export type LoadSlice = {
  ticketCount: number;
  usedMin: number;
  unplannedCount: number;
  percent: number;
  tone: DayLoadTone;
};

export type DayLoad = {
  day: string;
  capMin: number;
  capTickets: number;
  percent: number;
  tone: DayLoadTone;
  blocked: boolean;
  showActual: boolean;
  blockLabel: string;
  overlayLabel: string;
  demand: LoadSlice;
  plan: LoadSlice;
  actual: LoadSlice;
  possible: LoadSlice;
  usedMin: number;
  ticketCount: number;
  title: string;
};

export type WeekLoad = {
  technicianId: string;
  technicianName: string;
  days: DayLoad[];
  capMin: number;
  capTickets: number;
  percent: number;
  tone: DayLoadTone;
  demand: LoadSlice;
  plan: LoadSlice;
  actual: LoadSlice;
  possible: LoadSlice;
  usedMin: number;
  ticketCount: number;
  title: string;
};

function namesMatch(a: string, b: string): boolean {
  const keys = new Set(personNameKeys(b));
  return personNameKeys(a).some((key) => keys.has(key));
}

export function vacationFillsCapacity(kind: VacationKind | "vertretung"): boolean {
  return kind !== "abwesend" && kind !== "vertretung";
}

export function overlayLabelForKind(kind: VacationKind | "vertretung"): string {
  if (kind === "abwesend" || kind === "vertretung") return "Vertretung";
  return vacationKindLabel(kind);
}

export function collectBlockedDates(
  technicians: { id: string; name: string }[],
  vacations: VacationRequest[],
  fromDate: string,
  extraBlocks?: (technicianId: string, day: string) => DayBlock[],
  daysAhead = 40,
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const tech of technicians) {
    const blocked = new Set<string>();
    let date = fromDate;
    for (let i = 0; i < daysAhead; i += 1) {
      const blocks = [
        ...technicianBlocksForDay(vacations, tech.name, date),
        ...(extraBlocks?.(tech.id, date) ?? []),
      ];
      if (blocks.some((item) => item.fillsCapacity)) blocked.add(date);
      date = nextWorkday(date);
    }
    map.set(tech.id, blocked);
  }
  return map;
}

export function technicianBlocksForDay(
  requests: VacationRequest[],
  techName: string,
  day: string,
): DayBlock[] {
  const blocks: DayBlock[] = [];
  for (const item of requests) {
    if (
      item.scope !== "techniker" ||
      item.dateFrom > day ||
      item.dateTo < day ||
      !namesMatch(item.applicantName, techName)
    ) {
      continue;
    }
    const block: DayBlock = {
      kind: item.kind,
      label: overlayLabelForKind(item.kind),
      note: item.note,
      fillsCapacity: vacationFillsCapacity(item.kind),
    };
    if (blocks.some((existing) => existing.label === block.label && existing.fillsCapacity === block.fillsCapacity)) {
      continue;
    }
    blocks.push(block);
  }
  return blocks;
}

export function usedMinutesOf(tickets: DispositionTicket[]): number {
  return tickets.reduce((sum, ticket) => sum + (ticket.durationMin || DEFAULT_SERVICE_MIN), 0);
}

function ticketsLabel(count: number): string {
  return `${count} ${count === 1 ? "Ticket" : "Tickets"}`;
}

function loadSlice(
  tickets: DispositionTicket[],
  occupy: (ticket: DispositionTicket, day: string) => boolean,
  day: string,
  days = 1,
  blocked = false,
): LoadSlice {
  const list = tickets.filter((ticket) => occupy(ticket, day));
  const ticketCount = list.length;
  const percent = blocked ? 100 : ticketSlotPercent(ticketCount, days);
  return {
    ticketCount,
    usedMin: usedMinutesOf(list),
    unplannedCount: list.filter((ticket) => !ticket.tourDate).length,
    percent,
    tone: dayLoadTone(percent, blocked),
  };
}

function possibleSlice(
  tickets: DispositionTicket[],
  day: string,
  possibleById?: Map<string, string>,
  days = 1,
): LoadSlice {
  if (!possibleById?.size) {
    return {
      ticketCount: 0,
      usedMin: 0,
      unplannedCount: 0,
      percent: 0,
      tone: "empty",
    };
  }
  const list = tickets.filter((ticket) => possibleById.get(ticket.id) === day);
  const ticketCount = list.length;
  const percent = ticketSlotPercent(ticketCount, days);
  return {
    ticketCount,
    usedMin: usedMinutesOf(list),
    unplannedCount: 0,
    percent,
    tone: dayLoadTone(percent),
  };
}

function slotTitle(kind: string, slice: LoadSlice, capTickets: number, blocked?: string): string {
  if (blocked) return `${kind} gesperrt · ${blocked}`;
  return `${kind} ${slice.percent} % · ${ticketsLabel(slice.ticketCount)} von ${capTickets}`;
}

export function technicianDayLoad(
  tickets: DispositionTicket[],
  day: string,
  blocked: DayBlock[] = [],
  today = todayIso(),
  possibleById?: Map<string, string>,
): DayLoad {
  const capTickets = TICKETS_PER_DAY;
  const capacityBlocks = blocked.filter((item) => item.fillsCapacity);
  const overlays = blocked.filter((item) => !item.fillsCapacity);
  const isBlocked = capacityBlocks.length > 0;
  const demand = loadSlice(tickets, ticketOccupiesDemandDate, day);
  const plan = loadSlice(tickets, ticketOccupiesPlanDate, day, 1, isBlocked);
  const actual = loadSlice(tickets, ticketOccupiesActualDate, day);
  const possible = possibleSlice(tickets, day, possibleById);
  const blockLabel = capacityBlocks.map((item) => item.label).join(" · ");
  const overlayLabel = overlays.map((item) => item.label).join(" · ");
  const showActual = day < today;
  const parts = [
    slotTitle("Plan", plan, capTickets, isBlocked ? blockLabel : undefined),
    slotTitle("Nachfrage", demand, capTickets),
    slotTitle("Mögliche Tour", possible, capTickets),
  ];
  if (showActual) parts.push(slotTitle("Ist", actual, capTickets));
  if (overlayLabel) parts.push(overlayLabel);
  return {
    day,
    capMin: 0,
    capTickets,
    percent: plan.percent,
    tone: plan.tone,
    blocked: isBlocked,
    showActual,
    blockLabel,
    overlayLabel,
    demand,
    plan,
    actual,
    possible,
    usedMin: plan.usedMin,
    ticketCount: plan.ticketCount,
    title: parts.join(" · "),
  };
}

export function technicianWeekLoad(
  technicianId: string,
  technicianName: string,
  tickets: DispositionTicket[],
  days: string[],
  vacations: VacationRequest[],
  extraBlocks?: (day: string) => DayBlock[],
  today = todayIso(),
  possibleById?: Map<string, string>,
): WeekLoad {
  const mine = tickets.filter((ticket) => ticket.technicianId === technicianId);
  const dayLoads = days.map((day) => {
    const existing = technicianBlocksForDay(vacations, technicianName, day);
    const extra = extraBlocks?.(day) ?? [];
    const blocks = [...existing];
    for (const item of extra) {
      if (blocks.some((block) => block.label === item.label && block.fillsCapacity === block.fillsCapacity)) {
        continue;
      }
      blocks.push(item);
    }
    return technicianDayLoad(mine, day, blocks, today, possibleById);
  });
  const capTickets = ticketSlotCap(dayLoads.length);
  const demandCount = dayLoads.reduce((sum, item) => sum + item.demand.ticketCount, 0);
  const demand: LoadSlice = {
    ticketCount: demandCount,
    usedMin: dayLoads.reduce((sum, item) => sum + item.demand.usedMin, 0),
    unplannedCount: mine.filter(
      (ticket) => days.some((day) => ticketOccupiesDemandDate(ticket, day)) && !ticket.tourDate,
    ).length,
    percent: ticketSlotPercent(demandCount, dayLoads.length),
    tone: dayLoadTone(ticketSlotPercent(demandCount, dayLoads.length)),
  };
  const planCount = dayLoads.reduce(
    (sum, item) => sum + (item.blocked ? TICKETS_PER_DAY : item.plan.ticketCount),
    0,
  );
  const planTickets = dayLoads.reduce((sum, item) => sum + item.plan.ticketCount, 0);
  const planPercent = ticketSlotPercent(planCount, dayLoads.length);
  const plan: LoadSlice = {
    ticketCount: planTickets,
    usedMin: dayLoads.reduce((sum, item) => sum + item.plan.usedMin, 0),
    unplannedCount: 0,
    percent: planPercent,
    tone: dayLoadTone(planPercent, dayLoads.every((item) => item.blocked)),
  };
  const pastDays = dayLoads.filter((item) => item.showActual);
  const actualCount = pastDays.reduce((sum, item) => sum + item.actual.ticketCount, 0);
  const actualPercent = ticketSlotPercent(actualCount, Math.max(pastDays.length, 1));
  const actual: LoadSlice = {
    ticketCount: dayLoads.reduce((sum, item) => sum + item.actual.ticketCount, 0),
    usedMin: dayLoads.reduce((sum, item) => sum + item.actual.usedMin, 0),
    unplannedCount: 0,
    percent: pastDays.length ? actualPercent : 0,
    tone: pastDays.length ? dayLoadTone(actualPercent) : "empty",
  };
  const possibleCount = dayLoads.reduce((sum, item) => sum + item.possible.ticketCount, 0);
  const possiblePercent = ticketSlotPercent(possibleCount, dayLoads.length);
  const possible: LoadSlice = {
    ticketCount: possibleCount,
    usedMin: dayLoads.reduce((sum, item) => sum + item.possible.usedMin, 0),
    unplannedCount: mine.filter((ticket) => {
      const assigned = possibleById?.get(ticket.id);
      return Boolean(assigned) && !days.includes(assigned as string);
    }).length,
    percent: possiblePercent,
    tone: dayLoadTone(possiblePercent),
  };
  return {
    technicianId,
    technicianName,
    days: dayLoads,
    capMin: 0,
    capTickets,
    percent: plan.percent,
    tone: plan.tone,
    demand,
    plan,
    actual,
    possible,
    usedMin: plan.usedMin,
    ticketCount: planTickets,
    title: [
      slotTitle("Plan", plan, capTickets),
      slotTitle("Nachfrage", demand, capTickets),
      slotTitle("Mögliche Tour", possible, capTickets),
      pastDays.length ? slotTitle("Ist", actual, ticketSlotCap(pastDays.length)) : null,
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

export function weekLoadAsDay(row: WeekLoad): DayLoad {
  const showActual = row.days.some((item) => item.showActual);
  return {
    day: "week",
    capMin: row.capMin,
    capTickets: row.capTickets,
    percent: row.percent,
    tone: row.tone,
    blocked: row.days.length > 0 && row.days.every((item) => item.blocked),
    showActual,
    blockLabel: row.days.every((item) => item.blocked) ? row.days[0]?.blockLabel || "Gesperrt" : "",
    overlayLabel: "",
    demand: row.demand,
    plan: row.plan,
    actual: row.actual,
    possible: row.possible,
    usedMin: row.usedMin,
    ticketCount: row.ticketCount,
    title: row.title,
  };
}
