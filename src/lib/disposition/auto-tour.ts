import {
  DEFAULT_SERVICE_MIN,
  TICKETS_PER_DAY,
  WORK_START_MIN,
  isWorkday,
  nextWorkday,
  snapMin,
  workdayEndMin,
} from "./schedule";
import {
  homeEndPoint,
  isRoutableTicket,
  ticketHasPartsArrived,
  ticketReadiness,
  type DispositionHome,
  type DispositionTicket,
} from "./types";

export type AutoTourOptions = {
  fromDate: string;
  technicianId?: string;
  rebuild?: boolean;
  blockedDates?: Map<string, Set<string>>;
  /** Nur Tickets mit Kennzeichen „Ersatzteile angekommen“. */
  onlyPartsArrived?: boolean;
  /** Vorschau: vorhandene Tourdaten ignorieren, Tag leer starten. */
  preview?: boolean;
};

const DRIVE_KMH = 50;
const AUTO_TOUR_DAYS = 10;
/** Tickets einer möglichen Tagestour sollen in derselben Region bleiben. */
const POSSIBLE_CLUSTER_KM = 80;

type Point = { lat: number; lon: number };

export type AutoTourAssignment = {
  id: string;
  tourDate: string;
  tourStartMin: number;
};

type Candidate = {
  ticket: DispositionTicket;
  point: Point;
};

function haversineKm(a: Point, b: Point): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function driveMinBetween(a: Point, b: Point): number {
  const km = haversineKm(a, b);
  return Math.max(8, Math.round((km / DRIVE_KMH) * 60));
}

export function isAutoTourCandidate(ticket: DispositionTicket): boolean {
  if (!isRoutableTicket(ticket)) return false;
  if (ticket.lat == null || ticket.lon == null) return false;
  const readiness = ticketReadiness(ticket.flags);
  if (readiness === "warten" || readiness === "kv") return false;
  return true;
}

export function isPossibleTourTicket(ticket: DispositionTicket): boolean {
  return isAutoTourCandidate(ticket) && ticketHasPartsArrived(ticket);
}

function candidateScore(ticket: DispositionTicket): number {
  let score = 0;
  if (ticket.flags.ersatzteileEingetroffen) score += 40;
  if (ticket.flags.ersatzteilAusLager) score += 20;
  if (ticket.zieltermin) score += 8;
  return score;
}

function nearestNeighbor(start: Point, items: Candidate[]): Candidate[] {
  const remaining = [...items];
  const ordered: Candidate[] = [];
  let current = start;
  while (remaining.length) {
    remaining.sort((a, b) => {
      const scoreDiff = candidateScore(b.ticket) - candidateScore(a.ticket);
      if (Math.abs(scoreDiff) >= 15) return scoreDiff;
      return haversineKm(current, a.point) - haversineKm(current, b.point);
    });
    const next = remaining.shift();
    if (!next) break;
    ordered.push(next);
    current = next.point;
  }
  return ordered;
}

function homePoint(home: DispositionHome | null | undefined): Point | null {
  if (!home || home.lat == null || home.lon == null) return null;
  return { lat: home.lat, lon: home.lon };
}

function workdayOnOrAfter(iso: string): string {
  return isWorkday(iso) ? iso : nextWorkday(iso);
}

function firstOpenWorkday(iso: string, blocked: Set<string>): string {
  let date = workdayOnOrAfter(iso);
  let guard = 0;
  while (blocked.has(date) && guard < 30) {
    date = nextWorkday(date);
    guard += 1;
  }
  return date;
}

type Occupied = { clock: number; point: Point; count: number };

function occupiedState(
  tickets: DispositionTicket[],
  technicianId: string,
  date: string,
  fallback: Point,
  ignoreIds: Set<string>,
  already: AutoTourAssignment[],
): Occupied {
  const existing = tickets
    .filter(
      (item) =>
        item.technicianId === technicianId &&
        item.tourDate === date &&
        item.tourStartMin != null &&
        !ignoreIds.has(item.id),
    )
    .map((item) => ({
      start: item.tourStartMin as number,
      duration: item.durationMin || DEFAULT_SERVICE_MIN,
      point:
        item.lat != null && item.lon != null ? { lat: item.lat, lon: item.lon } : fallback,
    }));
  const assigned = already
    .filter((item) => item.tourDate === date)
    .map((item) => {
      const ticket = tickets.find((row) => row.id === item.id);
      return {
        start: item.tourStartMin,
        duration: ticket?.durationMin || DEFAULT_SERVICE_MIN,
        point:
          ticket?.lat != null && ticket?.lon != null
            ? { lat: ticket.lat, lon: ticket.lon }
            : fallback,
      };
    });
  const all = [...existing, ...assigned].sort((a, b) => a.start - b.start);
  if (!all.length) return { clock: WORK_START_MIN, point: fallback, count: 0 };
  const last = all[all.length - 1];
  return {
    clock: last.start + last.duration,
    point: last.point,
    count: all.length,
  };
}

function packOntoDay(
  date: string,
  incoming: Candidate[],
  occupied: Occupied,
  enforceDayEnd: boolean,
  maxTickets: number | null,
): AutoTourAssignment[] {
  const dayEnd = workdayEndMin(date);
  const ordered = nearestNeighbor(occupied.point, incoming);
  const placed: AutoTourAssignment[] = [];
  let clock = occupied.clock;
  let current = occupied.point;
  let count = occupied.count;
  for (const item of ordered) {
    if (maxTickets != null && count >= maxTickets) break;
    const travel = driveMinBetween(current, item.point);
    const duration = item.ticket.durationMin || DEFAULT_SERVICE_MIN;
    const arrive = snapMin(clock + travel);
    if (enforceDayEnd && arrive + duration > dayEnd) continue;
    placed.push({
      id: item.ticket.id,
      tourDate: date,
      tourStartMin: arrive,
    });
    count += 1;
    clock = arrive + duration;
    current = item.point;
  }
  return placed;
}

export function planAutoTours(
  tickets: DispositionTicket[],
  homes: DispositionHome[],
  options: AutoTourOptions = {
    fromDate: new Date().toISOString().slice(0, 10),
  },
): AutoTourAssignment[] {
  const fillFrom = isWorkday(options.fromDate) ? options.fromDate : nextWorkday(options.fromDate);
  const homeByTech = new Map(homes.map((item) => [item.technicianId, item]));
  const withZiel = new Map<string, Candidate[]>();
  const withoutZiel = new Map<string, Candidate[]>();
  const movingIds = new Set<string>();

  for (const ticket of tickets) {
    if (options.technicianId && ticket.technicianId !== options.technicianId) continue;
    if (!isAutoTourCandidate(ticket)) continue;
    if (options.onlyPartsArrived && !ticketHasPartsArrived(ticket)) continue;
    const point = { lat: ticket.lat as number, lon: ticket.lon as number };
    const candidate = { ticket, point };
    if (ticket.zieltermin) {
      const list = withZiel.get(ticket.technicianId) ?? [];
      list.push(candidate);
      withZiel.set(ticket.technicianId, list);
      movingIds.add(ticket.id);
      continue;
    }
    if (!options.rebuild && !options.preview && ticket.tourDate) continue;
    const list = withoutZiel.get(ticket.technicianId) ?? [];
    list.push(candidate);
    withoutZiel.set(ticket.technicianId, list);
    movingIds.add(ticket.id);
  }

  const technicianIds = new Set([...withZiel.keys(), ...withoutZiel.keys()]);
  const assignments: AutoTourAssignment[] = [];

  for (const technicianId of technicianIds) {
    const home = homePoint(homeByTech.get(technicianId) ?? null);
    const blocked = options.blockedDates?.get(technicianId) ?? new Set<string>();
    const zielItems = withZiel.get(technicianId) ?? [];
    const byDate = new Map<string, Candidate[]>();
    for (const item of zielItems) {
      const day = firstOpenWorkday(item.ticket.zieltermin as string, blocked);
      const list = byDate.get(day) ?? [];
      list.push(item);
      byDate.set(day, list);
    }

    const dates = [...byDate.keys()].sort((a, b) => a.localeCompare(b));
    const ignoreIds = options.preview ? new Set(tickets.map((ticket) => ticket.id)) : movingIds;
    for (const date of dates) {
      const start = home ?? byDate.get(date)?.[0]?.point;
      if (!start) continue;
      const occupied = occupiedState(tickets, technicianId, date, start, ignoreIds, assignments);
      assignments.push(
        ...packOntoDay(date, byDate.get(date) ?? [], occupied, false, null),
      );
    }

    let remaining = [...(withoutZiel.get(technicianId) ?? [])];
    if (!remaining.length) continue;
    let date = fillFrom;
    let packedDays = 0;
    let guard = 0;
    while (remaining.length && packedDays < AUTO_TOUR_DAYS && guard < 40) {
      guard += 1;
      if (blocked.has(date)) {
        date = nextWorkday(date);
        continue;
      }
      const start = home ?? remaining[0].point;
      const occupied = occupiedState(
        tickets,
        technicianId,
        date,
        start,
        options.preview ? new Set(tickets.map((ticket) => ticket.id)) : movingIds,
        assignments,
      );
      const placed = packOntoDay(date, remaining, occupied, true, TICKETS_PER_DAY);
      const used = new Set(placed.map((item) => item.id));
      assignments.push(...placed);
      remaining = remaining.filter((item) => !used.has(item.ticket.id));
      packedDays += 1;
      date = nextWorkday(date);
    }
  }

  return assignments;
}

function urgencyOnDate(ticket: DispositionTicket, date: string): number {
  if (ticket.zieltermin && ticket.zieltermin <= date) return 2;
  if (ticket.termin && ticket.termin <= date) return 1;
  return 0;
}

function pathKm(start: Point, items: Candidate[], end: Point): number {
  let current = start;
  let total = 0;
  for (const item of items) {
    total += haversineKm(current, item.point);
    current = item.point;
  }
  return total + haversineKm(current, end);
}

function twoOptOrder(start: Point, items: Candidate[], end: Point): Candidate[] {
  if (items.length <= 2) return items;
  let best = items;
  let bestLen = pathKm(start, best, end);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i += 1) {
      for (let j = i + 1; j < best.length; j += 1) {
        const next = best.slice(0, i).concat(best.slice(i, j + 1).reverse(), best.slice(j + 1));
        const len = pathKm(start, next, end);
        if (len + 0.05 < bestLen) {
          best = next;
          bestLen = len;
          improved = true;
        }
      }
    }
  }
  return best;
}

function stopFits(
  clock: number,
  from: Point,
  item: Candidate,
  end: Point,
  dayEnd: number,
  includeReturn: boolean,
): { arrive: number; done: number } | null {
  const duration = item.ticket.durationMin || DEFAULT_SERVICE_MIN;
  const arrive = snapMin(clock + driveMinBetween(from, item.point));
  const done = arrive + duration;
  if (done > dayEnd) return null;
  if (includeReturn && done + driveMinBetween(item.point, end) > dayEnd) return null;
  return { arrive, done };
}

function pickPossibleSeed(
  start: Point,
  end: Point,
  remaining: Candidate[],
  date: string,
  includeReturn: boolean,
): Candidate | null {
  const dayEnd = workdayEndMin(date);
  const ranked = [...remaining].sort((a, b) => {
    const urg = urgencyOnDate(b.ticket, date) - urgencyOnDate(a.ticket, date);
    if (urg) return urg;
    return haversineKm(start, a.point) - haversineKm(start, b.point);
  });
  for (const item of ranked) {
    if (stopFits(WORK_START_MIN, start, item, end, dayEnd, includeReturn)) return item;
  }
  return null;
}

function assignmentsForOrder(
  date: string,
  start: Point,
  end: Point,
  items: Candidate[],
  includeReturn: boolean,
): { placed: AutoTourAssignment[]; leftover: Candidate[] } {
  const dayEnd = workdayEndMin(date);
  const placed: AutoTourAssignment[] = [];
  const leftover: Candidate[] = [];
  let clock = WORK_START_MIN;
  let current = start;
  let overflow = false;
  for (const item of items) {
    if (overflow || placed.length >= TICKETS_PER_DAY) {
      leftover.push(item);
      continue;
    }
    const fit = stopFits(clock, current, item, end, dayEnd, includeReturn);
    if (!fit) {
      overflow = true;
      leftover.push(item);
      continue;
    }
    placed.push({ id: item.ticket.id, tourDate: date, tourStartMin: fit.arrive });
    clock = fit.done;
    current = item.point;
  }
  return { placed, leftover };
}

function packPossibleDay(
  date: string,
  start: Point,
  end: Point,
  remaining: Candidate[],
  includeReturn: boolean,
): { placed: AutoTourAssignment[]; leftover: Candidate[] } {
  const seed = pickPossibleSeed(start, end, remaining, date, includeReturn);
  if (!seed) return { placed: [], leftover: remaining };

  const cluster: Candidate[] = [];
  const outside: Candidate[] = [];
  for (const item of remaining) {
    if (item.ticket.id === seed.ticket.id || haversineKm(seed.point, item.point) <= POSSIBLE_CLUSTER_KM) {
      cluster.push(item);
    } else {
      outside.push(item);
    }
  }

  const dayEnd = workdayEndMin(date);
  const picked: Candidate[] = [seed];
  let pool = cluster.filter((item) => item.ticket.id !== seed.ticket.id);
  let clock = stopFits(WORK_START_MIN, start, seed, end, dayEnd, includeReturn)?.done ?? WORK_START_MIN;
  let current = seed.point;

  while (picked.length < TICKETS_PER_DAY && pool.length) {
    const feasible = pool
      .map((item) => ({ item, fit: stopFits(clock, current, item, end, dayEnd, includeReturn) }))
      .filter((row) => row.fit);
    if (!feasible.length) break;
    feasible.sort((a, b) => {
      const da = haversineKm(current, a.item.point);
      const db = haversineKm(current, b.item.point);
      if (Math.abs(da - db) >= 15) return da - db;
      return urgencyOnDate(b.item.ticket, date) - urgencyOnDate(a.item.ticket, date) || da - db;
    });
    const next = feasible[0].item;
    const fit = feasible[0].fit;
    if (!fit) break;
    picked.push(next);
    pool = pool.filter((item) => item.ticket.id !== next.ticket.id);
    clock = fit.done;
    current = next.point;
  }

  const ordered = twoOptOrder(start, picked, end);
  const assigned = assignmentsForOrder(date, start, end, ordered, includeReturn);
  return {
    placed: assigned.placed,
    leftover: [...assigned.leftover, ...pool, ...outside],
  };
}

/** Vorschau: sinnvolle Tagestour nur aus Tickets mit Kennzeichen „Ersatzteile angekommen“. */
export function planPossibleTours(
  tickets: DispositionTicket[],
  homes: DispositionHome[],
  options: AutoTourOptions,
): AutoTourAssignment[] {
  const fillFrom = isWorkday(options.fromDate) ? options.fromDate : nextWorkday(options.fromDate);
  const homeByTech = new Map(homes.map((item) => [item.technicianId, item]));
  const byTech = new Map<string, Candidate[]>();

  for (const ticket of tickets) {
    if (options.technicianId && ticket.technicianId !== options.technicianId) continue;
    if (!isPossibleTourTicket(ticket)) continue;
    const list = byTech.get(ticket.technicianId) ?? [];
    list.push({ ticket, point: { lat: ticket.lat as number, lon: ticket.lon as number } });
    byTech.set(ticket.technicianId, list);
  }

  const assignments: AutoTourAssignment[] = [];
  for (const [technicianId, candidates] of byTech) {
    const home = homeByTech.get(technicianId) ?? null;
    const start = homePoint(home) ?? candidates[0]?.point;
    if (!start) continue;
    const end = homeEndPoint(home) ?? start;
    const includeReturn = Boolean(homePoint(home));
    const blocked = options.blockedDates?.get(technicianId) ?? new Set<string>();
    let remaining = [...candidates];
    let date = fillFrom;
    let packedDays = 0;
    let guard = 0;
    while (remaining.length && packedDays < AUTO_TOUR_DAYS && guard < 40) {
      guard += 1;
      if (blocked.has(date)) {
        date = nextWorkday(date);
        continue;
      }
      const packed = packPossibleDay(date, start, end, remaining, includeReturn);
      assignments.push(...packed.placed);
      remaining = packed.leftover;
      packedDays += 1;
      date = nextWorkday(date);
    }
  }
  return assignments;
}

