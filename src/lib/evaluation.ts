import { daysInMonth, isMonthInEvaluationRange, isWeekend, toDateInputValue } from "./tracker";
import { PARTNER_TECH_ID } from "./ticket-import";
import type { DayStatus, Technician } from "./tracker-types";
import { ROLE_OPTIONS } from "./tracker-types";

export type EvalRangeMode = "current" | "previous";

export type TechEvaluation = {
  id: string;
  name: string;
  firstName: string;
  role: Technician["role"];
  roleLabel: string;
  tickets: number;
  evaluatedDays: number;
  average: number;
  active: boolean;
};

export type MonthEvaluation = {
  year: number;
  monthIndex: number;
  monthLabel: string;
  workdaysInMonth: number;
  totalTickets: number;
  activeTechnicians: number;
  fieldserviceCount: number;
  overallAverage: number;
  topPerformer: TechEvaluation | null;
  technicians: TechEvaluation[];
};

function roleLabel(role: Technician["role"]): string {
  return ROLE_OPTIONS.find((item) => item.id === role)?.label ?? role;
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

export function shiftMonth(year: number, monthIndex: number, delta: number): {
  year: number;
  monthIndex: number;
} {
  const date = new Date(year, monthIndex + delta, 1);
  return { year: date.getFullYear(), monthIndex: date.getMonth() };
}

export function resolveEvalMonth(
  selectedDate: string,
  mode: EvalRangeMode,
): { year: number; monthIndex: number } {
  const [year, month] = selectedDate.split("-").map(Number);
  const current = { year, monthIndex: (month ?? 1) - 1 };
  if (mode === "previous") return shiftMonth(current.year, current.monthIndex, -1);
  return current;
}

/** Werktag zählt nur, wenn Tickets erfasst wurden und kein anderer Status gesetzt ist. */
export function isEvaluatedTicketDay(
  status: DayStatus,
  ticketCount: number | null,
): boolean {
  return status === "tickets" && ticketCount !== null && ticketCount > 0;
}

export function buildMonthEvaluation(
  technicians: Technician[],
  year: number,
  monthIndex: number,
  getCount: (technicianId: string, date: string) => number | null,
  getStatus: (technicianId: string, date: string) => DayStatus,
): MonthEvaluation {
  const monthDays = daysInMonth(year, monthIndex);
  const workdays = monthDays.filter((day) => !isWeekend(day));
  const monthLabel = new Intl.DateTimeFormat("de-DE", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, monthIndex, 1));

  const fieldservice = technicians.filter(
    (tech) => tech.role === "fieldservice" && tech.id !== PARTNER_TECH_ID,
  );

  const rows: TechEvaluation[] = fieldservice.map((tech) => {
    let tickets = 0;
    let evaluatedDays = 0;

    for (const day of workdays) {
      const date = toDateInputValue(day);
      const status = getStatus(tech.id, date);
      const count = getCount(tech.id, date);
      if (!isEvaluatedTicketDay(status, count) || count === null) continue;
      tickets += count;
      evaluatedDays += 1;
    }

    const average = evaluatedDays > 0 ? tickets / evaluatedDays : 0;

    return {
      id: tech.id,
      name: tech.name,
      firstName: firstName(tech.name),
      role: tech.role,
      roleLabel: roleLabel(tech.role),
      tickets,
      evaluatedDays,
      average,
      active: evaluatedDays > 0,
    };
  });

  rows.sort((a, b) => b.average - a.average || b.tickets - a.tickets || a.name.localeCompare(b.name, "de"));

  const fieldserviceCount = rows.length;
  // Gesamt-Ø = Summe der Techniker-Ø (Tickets ÷ Arbeitstage) / Anzahl Fieldservice
  const overallAverage =
    fieldserviceCount > 0
      ? rows.reduce((sum, row) => sum + row.average, 0) / fieldserviceCount
      : 0;

  const activeRows = rows.filter((row) => row.active);
  const topPerformer = activeRows[0] ?? null;

  return {
    year,
    monthIndex,
    monthLabel,
    workdaysInMonth: workdays.length,
    totalTickets: rows.reduce((sum, row) => sum + row.tickets, 0),
    activeTechnicians: activeRows.length,
    fieldserviceCount,
    overallAverage,
    topPerformer,
    technicians: rows,
  };
}

export function formatAverage(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0.00";
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export type OpenDayTotal = {
  date: string;
  day: number;
  weekdayShort: string;
  total: number;
  hasData: boolean;
  isWeekend: boolean;
};

export type OpenTicketsDailyEvaluation = {
  year: number;
  monthIndex: number;
  monthLabel: string;
  days: OpenDayTotal[];
  maxTotal: number;
  daysWithData: number;
  peakDay: OpenDayTotal | null;
  averageOpen: number;
};

/** Summe offener Tickets je Kalendertag (alle Techniker). */
export function buildOpenTicketsDailyEvaluation(
  technicians: Technician[],
  year: number,
  monthIndex: number,
  getOpenCount: (technicianId: string, date: string) => number | null,
): OpenTicketsDailyEvaluation {
  const monthDays = daysInMonth(year, monthIndex);
  const monthLabel = new Intl.DateTimeFormat("de-DE", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, monthIndex, 1));
  const weekdayFmt = new Intl.DateTimeFormat("de-DE", { weekday: "short" });

  const days: OpenDayTotal[] = monthDays.map((day) => {
    const date = toDateInputValue(day);
    let total = 0;
    let hasData = false;
    for (const tech of technicians) {
      const count = getOpenCount(tech.id, date);
      if (count === null) continue;
      hasData = true;
      total += count;
    }
    return {
      date,
      day: day.getDate(),
      weekdayShort: weekdayFmt.format(day).replace(/\.$/, ""),
      total,
      hasData,
      isWeekend: isWeekend(day),
    };
  });

  const withData = days.filter((item) => item.hasData);
  const maxTotal = Math.max(0, ...days.map((item) => item.total));
  const peakDay =
    withData.length > 0
      ? withData.reduce((best, item) => (item.total > best.total ? item : best))
      : null;
  const averageOpen =
    withData.length > 0
      ? withData.reduce((sum, item) => sum + item.total, 0) / withData.length
      : 0;

  return {
    year,
    monthIndex,
    monthLabel,
    days,
    maxTotal,
    daysWithData: withData.length,
    peakDay,
    averageOpen,
  };
}

export type PhilippMonthKpi = {
  year: number;
  monthIndex: number;
  monthLabel: string;
  monthShort: string;
  overallAverage: number;
  activeTechnicians: number;
  totalTickets: number;
  fieldserviceCount: number;
  hasData: boolean;
  inRange: boolean;
};

export type PhilippQuarterKpi = {
  id: string;
  label: string;
  quarter: 1 | 2 | 3 | 4;
  average: number;
  monthsWithData: number;
  hasData: boolean;
  monthLabels: string[];
  monthAverages: PhilippMonthKpi[];
};

export type PhilippKpi = {
  year: number;
  fieldserviceCount: number;
  months: PhilippMonthKpi[];
  monthsWithData: number;
  yearAverage: number;
  bestMonth: PhilippMonthKpi | null;
  quarters: PhilippQuarterKpi[];
};

const MONTH_SHORT_DE = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
] as const;

/** Monats-Gesamt-Ø Fieldservice + Quartalsmittel der Monats-Ø. */
export function buildPhilippKpi(
  technicians: Technician[],
  year: number,
  getCount: (technicianId: string, date: string) => number | null,
  getStatus: (technicianId: string, date: string) => DayStatus,
): PhilippKpi {
  const months: PhilippMonthKpi[] = [];

  for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
    const inRange = isMonthInEvaluationRange(year, monthIndex);
    if (!inRange) {
      months.push({
        year,
        monthIndex,
        monthLabel: new Intl.DateTimeFormat("de-DE", {
          month: "long",
          year: "numeric",
        }).format(new Date(year, monthIndex, 1)),
        monthShort: MONTH_SHORT_DE[monthIndex],
        overallAverage: 0,
        activeTechnicians: 0,
        totalTickets: 0,
        fieldserviceCount: 0,
        hasData: false,
        inRange: false,
      });
      continue;
    }

    const evaluation = buildMonthEvaluation(
      technicians,
      year,
      monthIndex,
      getCount,
      getStatus,
    );

    months.push({
      year,
      monthIndex,
      monthLabel: evaluation.monthLabel,
      monthShort: MONTH_SHORT_DE[monthIndex],
      overallAverage: evaluation.overallAverage,
      activeTechnicians: evaluation.activeTechnicians,
      totalTickets: evaluation.totalTickets,
      fieldserviceCount: evaluation.fieldserviceCount,
      hasData: evaluation.activeTechnicians > 0,
      inRange: true,
    });
  }

  const monthsWithData = months.filter((item) => item.hasData);
  const yearAverage =
    monthsWithData.length > 0
      ? monthsWithData.reduce((sum, item) => sum + item.overallAverage, 0) /
        monthsWithData.length
      : 0;
  const bestMonth =
    monthsWithData.length > 0
      ? monthsWithData.reduce((best, item) =>
          item.overallAverage > best.overallAverage ? item : best,
        )
      : null;

  const quarters: PhilippQuarterKpi[] = ([1, 2, 3, 4] as const).map((quarter) => {
    const start = (quarter - 1) * 3;
    const quarterMonths = months.slice(start, start + 3).filter((item) => item.inRange);
    const withData = quarterMonths.filter((item) => item.hasData);
    const average =
      withData.length > 0
        ? withData.reduce((sum, item) => sum + item.overallAverage, 0) / withData.length
        : 0;

    return {
      id: `Q${quarter}-${year}`,
      label: `Q${quarter} ${year}`,
      quarter,
      average,
      monthsWithData: withData.length,
      hasData: withData.length > 0,
      monthLabels: withData.map((item) => item.monthShort),
      monthAverages: withData,
    };
  });

  const fieldserviceCount =
    months.find((item) => item.inRange)?.fieldserviceCount ??
    technicians.filter((tech) => tech.role === "fieldservice" && tech.id !== PARTNER_TECH_ID)
      .length;

  return {
    year,
    fieldserviceCount,
    months,
    monthsWithData: monthsWithData.length,
    yearAverage,
    bestMonth,
    quarters,
  };
}
