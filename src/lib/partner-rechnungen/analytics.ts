import type { PartnerInvoice } from "./types";

const MONTH_NAMES = [
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
];

export function isYearMonth(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}$/.test(value);
}

export function monthFromDate(
  isoDate: string | null | undefined,
  fallbackIso?: string | null,
): string {
  if (isoDate && /^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate.slice(0, 7);
  if (fallbackIso && /^\d{4}-\d{2}-\d{2}/.test(fallbackIso)) return fallbackIso.slice(0, 7);
  if (isYearMonth(fallbackIso)) return fallbackIso;
  return new Date().toISOString().slice(0, 7);
}

export function normalizeBillingMonth(
  value: unknown,
  invoiceDate: string | null,
  createdAt?: string,
): string {
  if (isYearMonth(value)) return value;
  return monthFromDate(invoiceDate, createdAt ?? null);
}

export function formatMonthDe(yearMonth: string): string {
  if (!isYearMonth(yearMonth)) return yearMonth || "—";
  const [year, month] = yearMonth.split("-");
  const name = MONTH_NAMES[Number(month) - 1];
  return name ? `${name} ${year}` : yearMonth;
}

export function parseInvoiceAmount(value: string): number {
  const raw = value.trim().replace(/\s/g, "").replace(/€/g, "");
  if (!raw) return 0;
  const normalized =
    raw.includes(",") && (raw.includes(".") || /,\d{1,2}$/.test(raw))
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

export function formatEuro(amount: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

export type InvoiceEvalGroupBy = "vendor" | "assignee";

export type InvoiceEvalRow = {
  who: string;
  month: string;
  count: number;
  amount: number;
};

export function buildInvoiceEvaluation(
  invoices: PartnerInvoice[],
  opts: {
    groupBy: InvoiceEvalGroupBy;
    month?: string;
    year?: string;
  },
): {
  rows: InvoiceEvalRow[];
  months: string[];
  years: string[];
  totalCount: number;
  totalAmount: number;
} {
  const months = [...new Set(invoices.map((item) => item.billingMonth).filter(Boolean))].sort(
    (a, b) => b.localeCompare(a),
  );
  const years = [...new Set(months.map((item) => item.slice(0, 4)))].sort((a, b) =>
    b.localeCompare(a),
  );

  const filtered = invoices.filter((invoice) => {
    if (opts.month && opts.month !== "alle" && invoice.billingMonth !== opts.month) {
      return false;
    }
    if (opts.year && opts.year !== "alle" && invoice.billingMonth.slice(0, 4) !== opts.year) {
      return false;
    }
    return true;
  });

  const buckets = new Map<string, InvoiceEvalRow>();
  for (const invoice of filtered) {
    const who =
      (opts.groupBy === "assignee" ? invoice.assignee : invoice.vendor).trim() ||
      (opts.groupBy === "assignee" ? "Ohne Bearbeiter" : "Ohne Lieferant");
    const month = invoice.billingMonth || "ohne Monat";
    const key = `${who}||${month}`;
    const current = buckets.get(key) ?? { who, month, count: 0, amount: 0 };
    current.count += 1;
    current.amount += parseInvoiceAmount(invoice.amount);
    buckets.set(key, current);
  }

  const rows = [...buckets.values()].sort((a, b) => {
    const monthCmp = b.month.localeCompare(a.month);
    if (monthCmp !== 0) return monthCmp;
    return a.who.localeCompare(b.who, "de");
  });

  return {
    rows,
    months,
    years,
    totalCount: filtered.length,
    totalAmount: rows.reduce((sum, row) => sum + row.amount, 0),
  };
}
