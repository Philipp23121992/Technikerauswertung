import { addDays, differenceInCalendarDays, format, isWeekend, startOfDay } from 'date-fns'
import type { SlaType } from '../types'
import { getSlaTypeOption } from './slaTypes'
import { parseFlexibleDate } from './dates'

/** Add N business days (Mon–Fri). Weekends are skipped; holidays are not considered. */
export function addBusinessDays(from: Date, amount: number): Date {
  let cursor = startOfDay(from)
  let remaining = amount

  while (remaining > 0) {
    cursor = addDays(cursor, 1)
    if (!isWeekend(cursor)) {
      remaining -= 1
    }
  }

  return cursor
}

/**
 * Arbeitstage zwischen Erstellt und Gelöst.
 * Gleicher Arbeitstag = 0, nächster Arbeitstag = 1, usw.
 * Wochenenden zählen nicht.
 */
export function countBusinessDaysUsed(
  createdAt: string | null | undefined,
  resolvedAt: string | null | undefined,
): number | null {
  const created = parseFlexibleDate(createdAt ?? null)
  const resolved = parseFlexibleDate(resolvedAt ?? null)
  if (!created || !resolved) return null

  const start = startOfDay(created)
  const end = startOfDay(resolved)
  if (end.getTime() < start.getTime()) return null

  let days = 0
  let cursor = start
  const totalCalendarDays = differenceInCalendarDays(end, start)

  for (let i = 0; i < totalCalendarDays; i += 1) {
    cursor = addDays(cursor, 1)
    if (!isWeekend(cursor)) {
      days += 1
    }
  }

  return days
}

export function isSlaMetByBusinessDays(
  businessDaysUsed: number | null,
  slaType: SlaType | null | undefined,
): boolean | null {
  const option = getSlaTypeOption(slaType)
  if (businessDaysUsed == null || !option) return null
  return businessDaysUsed <= option.businessDays
}

export function formatBusinessDays(days: number | null | undefined): string {
  if (days == null || Number.isNaN(days)) return '—'
  if (days === 0) return '0 AT (gleicher Tag)'
  if (days === 1) return '1 Arbeitstag'
  return `${days} Arbeitstage`
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? parseFlexibleDate(value) : value
  if (!date) return '—'
  return format(date, 'dd.MM.yyyy HH:mm')
}
