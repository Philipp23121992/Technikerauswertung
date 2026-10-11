import {
  formatEuro,
  warrantyProfit,
  type WarrantyCase,
} from "./types";

export type PeriodKind = "week" | "month" | "year";

export type PeriodSummary = {
  key: string;
  label: string;
  count: number;
  income: number;
  expense: number;
  profit: number;
  avgProfit: number;
};

export type EntitySummary = {
  name: string;
  count: number;
  income: number;
  expense: number;
  profit: number;
  avgProfit: number;
};

export type WarrantyAnalytics = {
  totalCount: number;
  totalIncome: number;
  totalExpense: number;
  totalProfit: number;
  avgProfit: number;
  periods: PeriodSummary[];
  byPartner: EntitySummary[];
  byManufacturer: EntitySummary[];
};

function periodKey(date: string, kind: PeriodKind): string {
  const [year, month] = date.split("-");
  if (kind === "year") return year;
  if (kind === "month") return `${year}-${month}`;
  const d = new Date(`${date}T12:00:00`);
  const oneJan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - oneJan.getTime()) / 86400000 + oneJan.getDay() + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function periodLabel(key: string, kind: PeriodKind): string {
  if (kind === "year") return key;
  if (kind === "month") {
    const [year, month] = key.split("-");
    const date = new Date(Number(year), Number(month) - 1, 1);
    return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(date);
  }
  return `KW ${key.split("-W")[1] ?? key} / ${key.split("-W")[0] ?? ""}`;
}

function summarizeCases(cases: WarrantyCase[]): Omit<WarrantyAnalytics, "periods" | "byPartner" | "byManufacturer"> {
  const totalIncome = cases.reduce((sum, item) => sum + item.manufacturerAmount, 0);
  const totalExpense = cases.reduce((sum, item) => sum + item.partnerAmount, 0);
  const totalProfit = cases.reduce((sum, item) => sum + warrantyProfit(item), 0);
  return {
    totalCount: cases.length,
    totalIncome,
    totalExpense,
    totalProfit,
    avgProfit: cases.length > 0 ? totalProfit / cases.length : 0,
  };
}

function groupByPeriod(cases: WarrantyCase[], kind: PeriodKind): PeriodSummary[] {
  const map = new Map<string, WarrantyCase[]>();
  for (const item of cases) {
    const key = periodKey(item.caseDate, kind);
    const bucket = map.get(key) ?? [];
    bucket.push(item);
    map.set(key, bucket);
  }

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, bucket]) => {
      const income = bucket.reduce((sum, item) => sum + item.manufacturerAmount, 0);
      const expense = bucket.reduce((sum, item) => sum + item.partnerAmount, 0);
      const profit = bucket.reduce((sum, item) => sum + warrantyProfit(item), 0);
      return {
        key,
        label: periodLabel(key, kind),
        count: bucket.length,
        income,
        expense,
        profit,
        avgProfit: bucket.length > 0 ? profit / bucket.length : 0,
      };
    });
}

function groupByField(
  cases: WarrantyCase[],
  field: "partner" | "manufacturer",
): EntitySummary[] {
  const map = new Map<string, WarrantyCase[]>();
  for (const item of cases) {
    const name = item[field].trim();
    const bucket = map.get(name) ?? [];
    bucket.push(item);
    map.set(name, bucket);
  }

  return [...map.entries()]
    .map(([name, bucket]) => {
      const income = bucket.reduce((sum, item) => sum + item.manufacturerAmount, 0);
      const expense = bucket.reduce((sum, item) => sum + item.partnerAmount, 0);
      const profit = bucket.reduce((sum, item) => sum + warrantyProfit(item), 0);
      return {
        name,
        count: bucket.length,
        income,
        expense,
        profit,
        avgProfit: bucket.length > 0 ? profit / bucket.length : 0,
      };
    })
    .sort((a, b) => b.profit - a.profit);
}

export function buildWarrantyAnalytics(
  cases: WarrantyCase[],
  periodKind: PeriodKind = "month",
): WarrantyAnalytics {
  const base = summarizeCases(cases);
  return {
    ...base,
    periods: groupByPeriod(cases, periodKind),
    byPartner: groupByField(cases, "partner"),
    byManufacturer: groupByField(cases, "manufacturer"),
  };
}

export function filterCasesByRange(
  cases: WarrantyCase[],
  from?: string,
  to?: string,
): WarrantyCase[] {
  return cases.filter((item) => {
    if (from && item.caseDate < from) return false;
    if (to && item.caseDate > to) return false;
    return true;
  });
}

export function exportCasesCsv(cases: WarrantyCase[]): string {
  const header = [
    "Datum",
    "Hersteller",
    "Partner",
    "Kategorie",
    "Referenz",
    "Einnahmen",
    "Ausgaben",
    "Gewinn",
    "Notiz",
  ];
  const rows = cases.map((item) => [
    item.caseDate,
    item.manufacturer,
    item.partner,
    item.category,
    item.reference,
    String(item.manufacturerAmount),
    String(item.partnerAmount),
    String(warrantyProfit(item)),
    item.notes,
  ]);
  return [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"))
    .join("\n");
}

export function formatAnalyticsHeadline(analytics: WarrantyAnalytics): string {
  return `${analytics.totalCount} Garantiefälle · Gewinn ${formatEuro(analytics.totalProfit)}`;
}
