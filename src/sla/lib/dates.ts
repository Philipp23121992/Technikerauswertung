import { differenceInMinutes, isValid, parse, parseISO } from 'date-fns'

const DATE_FORMATS = [
  'yyyy-MM-dd HH:mm:ss',
  'yyyy-MM-dd HH:mm',
  'yyyy-MM-dd\'T\'HH:mm:ss',
  'yyyy-MM-dd\'T\'HH:mm:ss.SSS',
  'yyyy-MM-dd\'T\'HH:mm:ssXXX',
  'dd.MM.yyyy HH:mm:ss',
  'dd.MM.yyyy HH:mm',
  'dd.MM.yyyy',
  'dd/MM/yyyy HH:mm:ss',
  'dd/MM/yyyy HH:mm',
  'MM/dd/yyyy HH:mm:ss',
  'MM/dd/yyyy HH:mm',
]

export function isSameCalendarDay(
  startValue: string | null | undefined,
  endValue: string | null | undefined,
): boolean {
  const start = parseFlexibleDate(startValue ?? null)
  const end = parseFlexibleDate(endValue ?? null)
  if (!start || !end) return false
  return (
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate()
  )
}

export function parseFlexibleDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null

  const iso = parseISO(trimmed)
  if (isValid(iso)) return iso

  for (const format of DATE_FORMATS) {
    const parsed = parse(trimmed, format, new Date())
    if (isValid(parsed)) return parsed
  }

  const native = new Date(trimmed)
  return isValid(native) ? native : null
}

export function minutesBetween(
  start: string | null | undefined,
  end: string | null | undefined,
): number | null {
  const a = parseFlexibleDate(start ?? null)
  const b = parseFlexibleDate(end ?? null)
  if (!a || !b) return null
  const minutes = differenceInMinutes(b, a)
  return minutes < 0 ? null : minutes
}

export function parseNumber(value: string | null | undefined): number | null {
  if (!value) return null
  const normalized = value.trim().replace(',', '.')
  if (!normalized) return null
  const num = Number(normalized)
  return Number.isFinite(num) ? num : null
}

export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes == null || Number.isNaN(minutes)) return '—'
  if (minutes < 60) return `${Math.round(minutes)} Min`
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes % 60)
  if (hours < 24) return rest ? `${hours} Std ${rest} Min` : `${hours} Std`
  const days = Math.floor(hours / 24)
  const remHours = hours % 24
  return remHours ? `${days} T ${remHours} Std` : `${days} T`
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return `${value.toFixed(1)} %`
}
