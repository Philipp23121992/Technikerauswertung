import { formatDisplayDate } from "@/lib/tracker";
import { drivingPath, drivingTable, type NavLeg, type NavPoint } from "./osrm";
import {
  DEFAULT_SERVICE_MIN,
  WORK_START_MIN,
  todayIso,
  workdayEndMin,
  workdayLabel,
} from "./schedule";
import {
  homeEndLabel,
  homeEndPoint,
  homeStartLabel,
  isRoutableTicket,
  ticketOccupiesBoardDate,
  ticketReadiness,
  type DispositionBoardMode,
  type DispositionHome,
  type DispositionReadiness,
  type DispositionTicket,
} from "./types";

export const ROUTE_COLORS = [
  "#c62828",
  "#1565c0",
  "#2e7d32",
  "#6a1b9a",
  "#ef6c00",
  "#00838f",
  "#ad1457",
  "#4527a0",
  "#558b2f",
  "#00695c",
  "#d84315",
  "#283593",
];

export type RouteStop = {
  ticketId: string;
  order: number;
  ticketNo: string;
  customer: string;
  addressLabel: string;
  zieltermin: string | null;
  readiness: DispositionReadiness;
  kmFromPrev: number;
  driveMin: number;
  durationMin: number;
  arriveMin: number;
  departMin: number;
  reason: string;
};

export type TechnicianRoute = {
  technicianId: string;
  technicianName: string;
  homeLabel: string;
  endLabel: string;
  hasHome: boolean;
  hasEnd: boolean;
  totalKm: number;
  totalMin: number;
  returnKm: number;
  returnMin: number;
  workStartMin: number;
  workEndMin: number;
  overflow: boolean;
  geometry: Array<[number, number]>;
  stops: RouteStop[];
  held: Array<{
    ticketId: string;
    ticketNo: string;
    customer: string;
    addressLabel: string;
    zieltermin: string | null;
    readiness: DispositionReadiness;
    reason: string;
  }>;
  missingGeo: number;
  summary: string;
};

type Point = { lat: number; lon: number };

type Routable = {
  ticket: DispositionTicket;
  point: Point;
  readiness: DispositionReadiness;
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

function holdReason(readiness: DispositionReadiness): string {
  if (readiness === "kv") {
    return "Kostenvoranschlag offen – noch nicht einplanen.";
  }
  return "Ersatzteil bestellt / ohne Garantie, noch nicht eingetroffen.";
}

function stopReason(ticket: DispositionTicket, readiness: DispositionReadiness, date: string): string {
  const due =
    ticket.zieltermin && ticket.zieltermin <= date
      ? ticket.zieltermin === date
        ? "Zieltermin heute."
        : `Zieltermin ${formatDisplayDate(ticket.zieltermin)} (überfällig).`
      : ticket.zieltermin
        ? `Zieltermin ${formatDisplayDate(ticket.zieltermin)}.`
        : "Kein Zieltermin.";
  if (readiness === "lager") {
    return `${due} Ersatzteil aus Lager – früh in der Tour, ggf. zuerst Lager anfahren.`;
  }
  if (ticket.flags.ersatzteileEingetroffen) {
    return `${due} Teile angekommen – priorisiert.`;
  }
  return due;
}

function scoreTicket(ticket: DispositionTicket, readiness: DispositionReadiness, date: string): number {
  let score = 0;
  if (ticket.zieltermin && ticket.zieltermin < date) score += 40;
  else if (ticket.zieltermin === date) score += 30;
  if (ticket.flags.ersatzteileEingetroffen) score += 20;
  if (readiness === "lager") score += 15;
  return score;
}

export type RouteOccupyMode = DispositionBoardMode | "termine" | "tour";

function boardMode(mode: RouteOccupyMode): DispositionBoardMode {
  if (mode === "tour" || mode === "termine") return "plan";
  return mode;
}

function occupiesOnDate(ticket: DispositionTicket, date: string, mode: RouteOccupyMode): boolean {
  return ticketOccupiesBoardDate(ticket, date, boardMode(mode));
}

function plannedStartOnDate(
  ticket: DispositionTicket,
  date: string,
  mode: RouteOccupyMode,
): number | null {
  if (!occupiesOnDate(ticket, date, mode)) return null;
  const board = boardMode(mode);
  if (board === "moeglich") return ticket.tourStartMin;
  return ticket.plannedStartMin;
}

function splitTickets(
  mine: DispositionTicket[],
  date: string,
  mode: RouteOccupyMode = "termine",
): { held: TechnicianRoute["held"]; routable: Routable[]; missingGeo: number } {
  const held: TechnicianRoute["held"] = [];
  const routable: Routable[] = [];
  let missingGeo = 0;

  for (const ticket of mine) {
    const readiness = ticketReadiness(ticket.flags);
    const onDay = occupiesOnDate(ticket, date, mode);
    if (readiness === "warten" || readiness === "kv") {
      if (onDay) {
        held.push({
          ticketId: ticket.id,
          ticketNo: ticket.ticketNo,
          customer: ticket.customer,
          addressLabel: ticket.addressLabel,
          zieltermin: ticket.zieltermin,
          readiness,
          reason: holdReason(readiness),
        });
      }
      continue;
    }
    if (ticket.lat == null || ticket.lon == null) {
      if (onDay) {
        missingGeo += 1;
        held.push({
          ticketId: ticket.id,
          ticketNo: ticket.ticketNo,
          customer: ticket.customer,
          addressLabel: ticket.addressLabel,
          zieltermin: ticket.zieltermin,
          readiness,
          reason:
            ticket.addressLabel || ticket.street || ticket.plz
              ? "Zieladresse noch ohne Koordinaten."
              : "Keine Zieladresse/PLZ – nicht geografisch planbar.",
        });
      }
      continue;
    }
    if (!onDay) {
      continue;
    }
    routable.push({
      ticket,
      point: { lat: ticket.lat, lon: ticket.lon },
      readiness,
    });
  }

  return { held, routable, missingGeo };
}

function nearestNeighbor(
  start: Point,
  items: Routable[],
  date: string,
): Array<Routable & { kmFromPrev: number }> {
  const remaining = [...items];
  const ordered: Array<Routable & { kmFromPrev: number }> = [];
  let current = start;
  while (remaining.length) {
    remaining.sort((a, b) => {
      const scoreDiff = scoreTicket(b.ticket, b.readiness, date) - scoreTicket(a.ticket, a.readiness, date);
      if (Math.abs(scoreDiff) >= 10) return scoreDiff;
      return haversineKm(current, a.point) - haversineKm(current, b.point);
    });
    const next = remaining.shift();
    if (!next) break;
    const km = haversineKm(current, next.point);
    ordered.push({ ...next, kmFromPrev: Math.round(km * 10) / 10 });
    current = next.point;
  }
  return ordered;
}

function isPlannedOnDate(
  ticket: DispositionTicket,
  date: string,
  mode: RouteOccupyMode = "termine",
): boolean {
  return plannedStartOnDate(ticket, date, mode) != null;
}

function sortByPlan(items: Routable[], date: string, mode: RouteOccupyMode = "termine"): Routable[] {
  const planned = items.filter((item) => isPlannedOnDate(item.ticket, date, mode));
  const rest = items.filter((item) => !isPlannedOnDate(item.ticket, date, mode));
  planned.sort(
    (a, b) =>
      (plannedStartOnDate(a.ticket, date, mode) ?? 0) - (plannedStartOnDate(b.ticket, date, mode) ?? 0),
  );
  return [...planned, ...rest];
}

function nearestNeighborDriving(
  startIndex: number,
  ticketIndices: number[],
  items: Routable[],
  matrix: Array<Array<NavLeg | null>>,
  date: string,
): number[] {
  const remaining = [...ticketIndices];
  const order: number[] = [];
  let current = startIndex;
  while (remaining.length) {
    remaining.sort((a, b) => {
      const itemA = items[a - 1];
      const itemB = items[b - 1];
      const scoreDiff =
        scoreTicket(itemB.ticket, itemB.readiness, date) -
        scoreTicket(itemA.ticket, itemA.readiness, date);
      if (Math.abs(scoreDiff) >= 10) return scoreDiff;
      const da = matrix[current]?.[a]?.durationMin ?? 9999;
      const db = matrix[current]?.[b]?.durationMin ?? 9999;
      return da - db;
    });
    const next = remaining.shift();
    if (next == null) break;
    order.push(next);
    current = next;
  }
  return order;
}

function emptyRoute(
  technicianId: string,
  technicianName: string,
  home: DispositionHome | null,
  held: TechnicianRoute["held"],
  missingGeo: number,
  date = todayIso(),
): TechnicianRoute {
  const homeLabel = homeStartLabel(home);
  const endLabel = homeEndLabel(home);
  return {
    technicianId,
    technicianName,
    homeLabel,
    endLabel,
    hasHome: Boolean(home && home.lat != null && home.lon != null),
    hasEnd: Boolean(homeEndPoint(home)),
    totalKm: 0,
    totalMin: 0,
    returnKm: 0,
    returnMin: 0,
    workStartMin: WORK_START_MIN,
    workEndMin: workdayEndMin(date),
    overflow: false,
    geometry: [],
    stops: [],
    held,
    missingGeo,
    summary: held.length ? `${held.length} zurückgestellt` : "keine Stopps",
  };
}

export function buildTechnicianRoute(
  technicianId: string,
  technicianName: string,
  tickets: DispositionTicket[],
  home: DispositionHome | null,
  date = todayIso(),
  mode: RouteOccupyMode = "termine",
): TechnicianRoute {
  const mine = tickets.filter((item) => item.technicianId === technicianId && isRoutableTicket(item));
  const { held, routable, missingGeo } = splitTickets(mine, date, mode);
  const dayEnd = workdayEndMin(date);
  const hasHome = Boolean(home && home.lat != null && home.lon != null);
  const endPoint = homeEndPoint(home);
  if (!routable.length) {
    return emptyRoute(technicianId, technicianName, home, held, missingGeo, date);
  }

  const start: Point = hasHome
    ? { lat: home!.lat as number, lon: home!.lon as number }
    : routable[0].point;
  const end = endPoint ?? start;

  const plannedFirst = sortByPlan(routable, date, mode);
  const ordered =
    plannedFirst.some((item) => isPlannedOnDate(item.ticket, date, mode))
      ? plannedFirst.map((item, index) => ({
          ...item,
          kmFromPrev: Math.round(
            haversineKm(index === 0 ? start : plannedFirst[index - 1].point, item.point) * 10,
          ) / 10,
        }))
      : nearestNeighbor(start, routable, date);

  let clock = WORK_START_MIN;
  let current = start;
  const stops: RouteStop[] = [];
  const overflowHeld: TechnicianRoute["held"] = [];
  let overflow = false;

  for (const [index, item] of ordered.entries()) {
    const driveKm = Math.round(haversineKm(current, item.point) * 10) / 10;
    const driveMin = Math.max(1, Math.round((driveKm / 50) * 60));
    const durationMin = item.ticket.durationMin || DEFAULT_SERVICE_MIN;
    const plannedStart = plannedStartOnDate(item.ticket, date, mode);
    const userPlanned = plannedStart != null;
    const arriveMin = userPlanned ? plannedStart : clock + driveMin;
    const departMin = arriveMin + durationMin;
    const returnMin = hasHome ? Math.max(1, Math.round((haversineKm(item.point, end) / 50) * 60)) : 0;
    if (!userPlanned && departMin + returnMin > dayEnd) {
      overflow = true;
      overflowHeld.push({
        ticketId: item.ticket.id,
        ticketNo: item.ticket.ticketNo,
        customer: item.ticket.customer,
        addressLabel: item.ticket.addressLabel,
        zieltermin: item.ticket.zieltermin,
        readiness: item.readiness,
        reason: `Passt nicht mehr in den Arbeitstag (${workdayLabel(date)}) inkl. Rückfahrt zum Standort.`,
      });
      continue;
    }
    stops.push({
      ticketId: item.ticket.id,
      order: stops.length + 1,
      ticketNo: item.ticket.ticketNo,
      customer: item.ticket.customer,
      addressLabel: item.ticket.addressLabel,
      zieltermin: item.ticket.zieltermin,
      readiness: item.readiness,
      kmFromPrev: index === 0 || userPlanned ? driveKm : item.kmFromPrev,
      driveMin,
      durationMin,
      arriveMin,
      departMin,
      reason: stopReason(item.ticket, item.readiness, date),
    });
    clock = departMin;
    current = item.point;
  }

  const last = stops.length ? ordered.find((item) => item.ticket.id === stops[stops.length - 1].ticketId) : null;
  const returnKm = hasHome && last ? Math.round(haversineKm(last.point, end) * 10) / 10 : 0;
  const returnMin = hasHome && last ? Math.max(1, Math.round((returnKm / 50) * 60)) : 0;
  const totalKm = Math.round((stops.reduce((sum, stop) => sum + stop.kmFromPrev, 0) + returnKm) * 10) / 10;
  const totalMin = (stops[stops.length - 1]?.departMin ?? WORK_START_MIN) + returnMin - WORK_START_MIN;
  const homeLabel = homeStartLabel(home);
  const endLabel = homeEndLabel(home);
  const allHeld = [...held, ...overflowHeld];
  const summaryParts = [
    `${stops.length} Stopps`,
    `${totalKm} km`,
    hasHome ? `${totalMin} min inkl. Rückfahrt` : `${totalMin} min`,
    allHeld.length ? `${allHeld.length} zurückgestellt` : null,
    hasHome ? null : "kein Standort",
    `${workdayLabel(date)}`,
  ].filter(Boolean);

  return {
    technicianId,
    technicianName,
    homeLabel,
    endLabel,
    hasHome,
    hasEnd: Boolean(endPoint),
    totalKm,
    totalMin,
    returnKm,
    returnMin,
    workStartMin: WORK_START_MIN,
    workEndMin: dayEnd,
    overflow,
    geometry: [],
    stops,
    held: allHeld,
    missingGeo,
    summary: summaryParts.join(" · "),
  };
}

export async function planTechnicianDay(
  technicianId: string,
  technicianName: string,
  tickets: DispositionTicket[],
  home: DispositionHome | null,
  date = todayIso(),
  mode: RouteOccupyMode = "termine",
): Promise<TechnicianRoute> {
  const fallback = buildTechnicianRoute(technicianId, technicianName, tickets, home, date, mode);
  const mine = tickets.filter((item) => item.technicianId === technicianId && isRoutableTicket(item));
  const { held, routable, missingGeo } = splitTickets(mine, date, mode);
  if (!routable.length) return fallback;

  const hasHome = Boolean(home && home.lat != null && home.lon != null);
  const endPoint = homeEndPoint(home);
  const workEnd = workdayEndMin(date);
  const start: NavPoint = hasHome
    ? { lat: home!.lat as number, lon: home!.lon as number }
    : routable[0].point;
  const end: NavPoint = endPoint ?? start;
  const ticketPoints = routable.map((item) => item.point);
  const points: NavPoint[] = hasHome ? [start, ...ticketPoints, end] : ticketPoints;
  const matrix = points.length >= 2 ? await drivingTable(points) : null;

  let orderedItems: Routable[];
  const planned = sortByPlan(routable, date, mode);
  const hasPlan = planned.some((item) => isPlannedOnDate(item.ticket, date, mode));
  if (hasPlan) {
    orderedItems = planned;
  } else if (hasHome && matrix) {
    const ticketOrder = nearestNeighborDriving(
      0,
      routable.map((_, index) => index + 1),
      routable,
      matrix,
      date,
    );
    orderedItems = ticketOrder.map((pointIndex) => routable[pointIndex - 1]);
  } else {
    orderedItems = nearestNeighbor(start, routable, date);
  }

  const pathPoints: NavPoint[] = hasHome
    ? [start, ...orderedItems.map((item) => item.point), end]
    : orderedItems.map((item) => item.point);
  const path = pathPoints.length >= 2 ? await drivingPath(pathPoints) : null;
  const legs = path?.legs ?? [];

  let clock = WORK_START_MIN;
  const stops: RouteStop[] = [];
  const overflowHeld: TechnicianRoute["held"] = [];
  let overflow = false;
  let currentIndex = 0;

  for (const [index, item] of orderedItems.entries()) {
    const pointIndex = hasHome ? index + 1 : index;
    const prevPoint = pathPoints[Math.max(0, hasHome ? index : index - 1)] ?? start;
    const leg: NavLeg | null = legs[hasHome ? index : Math.max(0, index - 1)] ?? matrix?.[currentIndex]?.[pointIndex] ?? null;
    const driveMin =
      index === 0 && !hasHome
        ? 0
        : leg?.durationMin ?? Math.max(1, Math.round((haversineKm(prevPoint, item.point) / 50) * 60));
    const kmFromPrev =
      index === 0 && !hasHome
        ? 0
        : leg?.distanceKm ?? Math.round(haversineKm(prevPoint, item.point) * 10) / 10;
    const durationMin = item.ticket.durationMin || DEFAULT_SERVICE_MIN;
    const plannedStart = plannedStartOnDate(item.ticket, date, mode);
    const userPlanned = plannedStart != null;
    const arriveMin = userPlanned ? plannedStart : clock + driveMin;
    const departMin = arriveMin + durationMin;
    const returnLeg = hasHome ? matrix?.[pointIndex]?.[points.length - 1] : null;
    const returnMin = hasHome
      ? returnLeg?.durationMin ?? Math.max(1, Math.round((haversineKm(item.point, end) / 50) * 60))
      : 0;
    if (!userPlanned && departMin + returnMin > workEnd) {
      overflow = true;
      overflowHeld.push({
        ticketId: item.ticket.id,
        ticketNo: item.ticket.ticketNo,
        customer: item.ticket.customer,
        addressLabel: item.ticket.addressLabel,
        zieltermin: item.ticket.zieltermin,
        readiness: item.readiness,
        reason: hasHome
          ? `Passt nicht mehr in den Arbeitstag (${workdayLabel(date)}) inkl. Rückfahrt zum Standort.`
          : `Passt nicht mehr in den Arbeitstag (${workdayLabel(date)}).`,
      });
      continue;
    }
    stops.push({
      ticketId: item.ticket.id,
      order: stops.length + 1,
      ticketNo: item.ticket.ticketNo,
      customer: item.ticket.customer,
      addressLabel: item.ticket.addressLabel,
      zieltermin: item.ticket.zieltermin,
      readiness: item.readiness,
      kmFromPrev,
      driveMin,
      durationMin,
      arriveMin,
      departMin,
      reason: stopReason(item.ticket, item.readiness, date),
    });
    clock = departMin;
    currentIndex = pointIndex;
  }

  const keptItems = orderedItems.filter((item) => stops.some((stop) => stop.ticketId === item.ticket.id));
  const keptPath = hasHome
    ? [start, ...keptItems.map((item) => item.point), end]
    : keptItems.map((item) => item.point);
  const keptNav = keptPath.length >= 2 ? await drivingPath(keptPath) : path;
  const lastLeg = hasHome ? keptNav?.legs?.[keptNav.legs.length - 1] : null;
  const returnKm = lastLeg?.distanceKm ?? 0;
  const returnDriveMin = lastLeg?.durationMin ?? 0;
  const totalKm =
    keptNav?.totalKm ?? Math.round((stops.reduce((sum, stop) => sum + stop.kmFromPrev, 0) + returnKm) * 10) / 10;
  const finishMin = (stops[stops.length - 1]?.departMin ?? WORK_START_MIN) + returnDriveMin;
  const totalMin = finishMin - WORK_START_MIN;
  const allHeld = [...held, ...overflowHeld];
  const summaryParts = [
    `${stops.length} Stopps`,
    `${totalKm} km Fahrt`,
    hasHome ? `${totalMin} min inkl. Rückfahrt` : `${totalMin} min`,
    allHeld.length ? `${allHeld.length} zurückgestellt` : null,
    hasHome ? null : "kein Standort",
    workdayLabel(date),
  ].filter(Boolean);

  return {
    technicianId,
    technicianName,
    homeLabel: homeStartLabel(home),
    endLabel: homeEndLabel(home),
    hasHome,
    hasEnd: Boolean(endPoint),
    totalKm,
    totalMin,
    returnKm,
    returnMin: returnDriveMin,
    workStartMin: WORK_START_MIN,
    workEndMin: workEnd,
    overflow,
    geometry: keptNav?.geometry ?? path?.geometry ?? [],
    stops,
    held: allHeld,
    missingGeo,
    summary: summaryParts.join(" · "),
  };
}

function listedTechnicians(technicians: Array<{ id: string; name: string }>): Array<{ id: string; name: string }> {
  const ids = new Set<string>();
  const list: Array<{ id: string; name: string }> = [];
  for (const tech of technicians) {
    if (ids.has(tech.id)) continue;
    ids.add(tech.id);
    list.push(tech);
  }
  return list;
}

export function buildAllRoutes(
  tickets: DispositionTicket[],
  homes: DispositionHome[],
  technicians: Array<{ id: string; name: string }>,
  date = todayIso(),
): TechnicianRoute[] {
  const homeById = new Map(homes.map((item) => [item.technicianId, item]));
  return listedTechnicians(technicians)
    .map((tech) =>
      buildTechnicianRoute(tech.id, tech.name, tickets, homeById.get(tech.id) ?? null, date),
    )
    .filter((route) => route.stops.length > 0 || route.held.length > 0);
}

export async function planAllRoutes(
  tickets: DispositionTicket[],
  homes: DispositionHome[],
  technicians: Array<{ id: string; name: string }>,
  date = todayIso(),
): Promise<TechnicianRoute[]> {
  const homeById = new Map(homes.map((item) => [item.technicianId, item]));
  const routes: TechnicianRoute[] = [];
  for (const tech of listedTechnicians(technicians)) {
    const route = await planTechnicianDay(
      tech.id,
      tech.name,
      tickets,
      homeById.get(tech.id) ?? null,
      date,
    );
    if (route.stops.length > 0 || route.held.length > 0) routes.push(route);
  }
  return routes;
}
