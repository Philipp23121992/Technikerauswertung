import { endOfDay, endOfMonth, endOfYear, getYear, startOfDay, startOfMonth, startOfYear } from 'date-fns'
import { parseFlexibleDate } from './dates'

export type PeriodMode = 'month' | 'quarter' | 'half' | 'year'

export interface PeriodFilter {
  year: number
  mode: PeriodMode
  /** 1–12 when mode === 'month' */
  month: number
  /** 1–4 when mode === 'quarter' */
  quarter: 1 | 2 | 3 | 4
  /** 1 or 2 when mode === 'half' */
  half: 1 | 2
}

export const MONTH_OPTIONS = [
  { value: 1, label: 'Januar' },
  { value: 2, label: 'Februar' },
  { value: 3, label: 'März' },
  { value: 4, label: 'April' },
  { value: 5, label: 'Mai' },
  { value: 6, label: 'Juni' },
  { value: 7, label: 'Juli' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'Oktober' },
  { value: 11, label: 'November' },
  { value: 12, label: 'Dezember' },
] as const

export const QUARTER_OPTIONS = [
  { value: 1 as const, label: 'Q1 (Jan–Mär)' },
  { value: 2 as const, label: 'Q2 (Apr–Jun)' },
  { value: 3 as const, label: 'Q3 (Jul–Sep)' },
  { value: 4 as const, label: 'Q4 (Okt–Dez)' },
]

function currentQuarter(date = new Date()): 1 | 2 | 3 | 4 {
  return (Math.floor(date.getMonth() / 3) + 1) as 1 | 2 | 3 | 4
}

export function defaultPeriodFilter(years: number[]): PeriodFilter {
  const now = new Date()
  const year = years.includes(now.getFullYear())
    ? now.getFullYear()
    : (years[years.length - 1] ?? now.getFullYear())
  return {
    year,
    mode: 'year',
    month: now.getMonth() + 1,
    quarter: currentQuarter(now),
    half: now.getMonth() < 6 ? 1 : 2,
  }
}

export function availableYearsFromTickets(
  tickets: Array<{ resolvedAt: string | null }>,
): number[] {
  const years = new Set<number>()
  for (const ticket of tickets) {
    const resolved = parseFlexibleDate(ticket.resolvedAt)
    if (resolved) years.add(getYear(resolved))
  }
  const list = Array.from(years).sort((a, b) => a - b)
  if (!list.length) list.push(new Date().getFullYear())
  return list
}

export function getPeriodRange(filter: PeriodFilter): { start: Date; end: Date } {
  const { year, mode, month, quarter, half } = filter

  if (mode === 'month') {
    const base = new Date(year, month - 1, 1)
    return { start: startOfMonth(base), end: endOfMonth(base) }
  }

  if (mode === 'quarter') {
    const startMonth = (quarter - 1) * 3
    const endMonth = startMonth + 2
    return {
      start: startOfDay(new Date(year, startMonth, 1)),
      end: endOfMonth(new Date(year, endMonth, 1)),
    }
  }

  if (mode === 'half') {
    if (half === 1) {
      return {
        start: startOfDay(new Date(year, 0, 1)),
        end: endOfDay(new Date(year, 5, 30)),
      }
    }
    return {
      start: startOfDay(new Date(year, 6, 1)),
      end: endOfDay(new Date(year, 11, 31)),
    }
  }

  const base = new Date(year, 0, 1)
  return { start: startOfYear(base), end: endOfYear(base) }
}

export function formatPeriodLabel(filter: PeriodFilter): string {
  if (filter.mode === 'month') {
    const month = MONTH_OPTIONS.find((item) => item.value === filter.month)?.label
    return `${month ?? filter.month} ${filter.year}`
  }
  if (filter.mode === 'quarter') {
    return `Q${filter.quarter} ${filter.year}`
  }
  if (filter.mode === 'half') {
    return filter.half === 1
      ? `1. Halbjahr ${filter.year}`
      : `2. Halbjahr ${filter.year}`
  }
  return `Jahr ${filter.year}`
}

export function filterTicketsByPeriod<T extends { resolvedAt: string | null }>(
  tickets: T[],
  filter: PeriodFilter,
): T[] {
  const { start, end } = getPeriodRange(filter)
  const startMs = start.getTime()
  const endMs = end.getTime()

  return tickets.filter((ticket) => {
    const resolved = parseFlexibleDate(ticket.resolvedAt)
    if (!resolved) return false
    const time = resolved.getTime()
    return time >= startMs && time <= endMs
  })
}
