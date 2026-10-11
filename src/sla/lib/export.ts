import { toCsv } from '@/lib/csv'
import { formatPeriodLabel, type PeriodFilter } from './period'
import type {
  CustomerSlaStats,
  OverallStats,
  TechnicianVolumeStats,
} from '../types'

const EXPORT_HEADERS = [
  'Gruppe',
  'Name',
  'Anzahl Tickets',
  'Anzahl erledigt innerhalb SLA',
  'Erledigt am selben Tag',
  'außerhalb SLA',
  'SLA in %',
] as const

function formatSlaPercent(value: number | null): string {
  if (value == null || Number.isNaN(value)) return ''
  return value.toFixed(1).replace('.', ',')
}

function statsRow(
  gruppe: string,
  name: string,
  row: Pick<
    TechnicianVolumeStats | CustomerSlaStats,
    'total' | 'met' | 'sameDay' | 'breached' | 'metPercent'
  >,
) {
  return {
    Gruppe: gruppe,
    Name: name,
    'Anzahl Tickets': String(row.total),
    'Anzahl erledigt innerhalb SLA': String(row.met),
    'Erledigt am selben Tag': String(row.sameDay),
    'außerhalb SLA': String(row.breached),
    'SLA in %': formatSlaPercent(row.metPercent),
  }
}

export function buildSlaStatsCsv(stats: OverallStats): string {
  const technicianTotal = {
    total: stats.byTechnician.reduce((sum, row) => sum + row.total, 0),
    met: stats.byTechnician.reduce((sum, row) => sum + row.met, 0),
    sameDay: stats.byTechnician.reduce((sum, row) => sum + row.sameDay, 0),
    breached: stats.byTechnician.reduce((sum, row) => sum + row.breached, 0),
    metPercent: (() => {
      const evaluated = stats.byTechnician.reduce((sum, row) => sum + row.evaluated, 0)
      const met = stats.byTechnician.reduce((sum, row) => sum + row.met, 0)
      return evaluated ? (met / evaluated) * 100 : null
    })(),
  }

  const rows = [
    ...stats.byCustomer.map((row) => statsRow('Kunde', row.customerName, row)),
    statsRow('Techniker gesamt', 'Techniker', technicianTotal),
    ...stats.byTechnician.map((row) => statsRow('Techniker', row.technicianName, row)),
    statsRow('Partner gesamt', 'Partner', stats.partner),
    ...stats.byPartner.map((row) => statsRow('Partner', row.technicianName, row)),
    statsRow('Gesamt', 'Alle', {
      total: stats.totalTickets,
      met: stats.met,
      sameDay: stats.sameDay,
      breached: stats.breached,
      metPercent: stats.metPercent,
    }),
  ]

  return toCsv([...EXPORT_HEADERS], rows)
}

export function slaExportFileName(period: PeriodFilter): string {
  const label = formatPeriodLabel(period)
    .replace(/[^\p{L}\p{N}.-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return `SLA-Auswertung-${label || period.year}.csv`
}

export function downloadSlaStatsCsv(stats: OverallStats, period: PeriodFilter) {
  const csv = buildSlaStatsCsv(stats)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = slaExportFileName(period)
  anchor.click()
  URL.revokeObjectURL(url)
}
