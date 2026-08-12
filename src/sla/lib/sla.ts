import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import {
  countBusinessDaysUsed,
  isSlaMetByBusinessDays,
} from './businessDays'
import { cell } from './csv'
import { parseFlexibleDate } from './dates'
import { matchCustomer, matchTechnician } from './match'
import { getSlaTypeOption } from './slaTypes'
import type {
  ColumnMapping,
  Customer,
  CustomerSlaStats,
  MonthStats,
  OverallStats,
  RawTicketRow,
  SlaType,
  Technician,
  TechnicianVolumeStats,
  Ticket,
} from '../types'
import { PARTNER_NAME } from '../types'

function average(values: number[]): number | null {
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function percent(part: number, total: number): number | null {
  if (!total) return null
  return (part / total) * 100
}

function evaluateTicketFields(
  ticket: Pick<
    Ticket,
    'customerKey' | 'technicianKey' | 'createdAt' | 'resolvedAt'
  >,
  customers: Customer[],
  technicians: Technician[],
) {
  const matchedCustomer = matchCustomer(ticket.customerKey, customers)
  const matchedTechnician = matchTechnician(ticket.technicianKey, technicians)

  const slaType = matchedCustomer?.slaType ?? null
  const option = getSlaTypeOption(slaType)
  const businessDaysUsed = countBusinessDaysUsed(
    ticket.createdAt,
    ticket.resolvedAt,
  )

  return {
    customerId: matchedCustomer?.id ?? null,
    customerName: matchedCustomer?.name ?? null,
    slaType,
    businessDaysUsed,
    businessDaysAllowed: option?.businessDays ?? null,
    slaMet: isSlaMetByBusinessDays(businessDaysUsed, slaType),
    technicianId: matchedTechnician?.id ?? null,
    technicianName: matchedTechnician?.name ?? PARTNER_NAME,
    isPartner: !matchedTechnician,
  }
}

export function buildTicketsFromRows(
  rows: RawTicketRow[],
  mapping: ColumnMapping,
  customers: Customer[],
  technicians: Technician[],
  importBatchId: string,
): Ticket[] {
  return rows.map((row, index) => {
    const customerKey = cell(row, mapping.customer)
    const technicianKey = cell(row, mapping.technician)
    const createdAt = cell(row, mapping.createdAt) || null
    const resolvedAt = cell(row, mapping.resolvedAt) || null
    const firstResponseAt = cell(row, mapping.firstResponseAt) || null

    const evaluated = evaluateTicketFields(
      { customerKey, technicianKey, createdAt, resolvedAt },
      customers,
      technicians,
    )

    const externalId = cell(row, mapping.ticketId) || `ROW-${index + 1}`

    return {
      id: `${importBatchId}-${index}-${externalId}`,
      externalId,
      customerKey,
      technicianKey,
      ...evaluated,
      priority: cell(row, mapping.priority),
      status: cell(row, mapping.status),
      subject: cell(row, mapping.subject),
      createdAt,
      firstResponseAt,
      resolvedAt,
      importBatchId,
    }
  })
}

type MutableCustomerStats = CustomerSlaStats & {
  businessDaySamples: number[]
}

function emptyCustomerStats(
  customerId: string | null,
  customerName: string,
  slaType: SlaType | null,
): MutableCustomerStats {
  return {
    customerId,
    customerName,
    slaType,
    total: 0,
    evaluated: 0,
    met: 0,
    breached: 0,
    metPercent: null,
    breachedPercent: null,
    avgBusinessDays: null,
    businessDaySamples: [],
  }
}

function finalizeCustomerStats({
  businessDaySamples,
  ...stats
}: MutableCustomerStats): CustomerSlaStats {
  return {
    ...stats,
    avgBusinessDays: average(businessDaySamples),
    metPercent: percent(stats.met, stats.evaluated),
    breachedPercent: percent(stats.breached, stats.evaluated),
  }
}

export function computeStats(tickets: Ticket[]): OverallStats {
  const customerGroups = new Map<string, MutableCustomerStats>()
  const techGroups = new Map<string, TechnicianVolumeStats>()
  const monthGroups = new Map<string, number>()
  const typeBuckets = new Map<
    SlaType,
    { total: number; evaluated: number; met: number; breached: number }
  >()
  const businessDaySamples: number[] = []
  let met = 0
  let breached = 0
  let evaluated = 0
  let matchedTickets = 0
  let technicianMatched = 0
  let partnerTickets = 0

  for (const ticket of tickets) {
    if (ticket.customerId) matchedTickets += 1
    if (ticket.isPartner) partnerTickets += 1
    else technicianMatched += 1

    const customerKey =
      ticket.customerId ??
      `__unmatched__:${ticket.customerKey || 'Unbekannt'}`
    const customerName =
      ticket.customerName ?? (ticket.customerKey || 'Nicht zugeordnet')
    const customerStats =
      customerGroups.get(customerKey) ??
      emptyCustomerStats(ticket.customerId, customerName, ticket.slaType)
    customerStats.total += 1

    if (ticket.businessDaysUsed != null) {
      customerStats.businessDaySamples.push(ticket.businessDaysUsed)
      businessDaySamples.push(ticket.businessDaysUsed)
    }

    if (ticket.slaMet != null) {
      evaluated += 1
      customerStats.evaluated += 1
      if (ticket.slaMet) {
        met += 1
        customerStats.met += 1
      } else {
        breached += 1
        customerStats.breached += 1
      }
    }

    if (ticket.slaType) {
      const bucket = typeBuckets.get(ticket.slaType) ?? {
        total: 0,
        evaluated: 0,
        met: 0,
        breached: 0,
      }
      bucket.total += 1
      if (ticket.slaMet != null) {
        bucket.evaluated += 1
        if (ticket.slaMet) bucket.met += 1
        else bucket.breached += 1
      }
      typeBuckets.set(ticket.slaType, bucket)
    }

    customerGroups.set(customerKey, customerStats)

    const techKey = ticket.isPartner
      ? '__partner__'
      : (ticket.technicianId ?? `__tech__:${ticket.technicianKey}`)
    const techStats = techGroups.get(techKey) ?? {
      technicianId: ticket.technicianId,
      technicianName: ticket.technicianName,
      isPartner: ticket.isPartner,
      total: 0,
      evaluated: 0,
      met: 0,
      breached: 0,
      metPercent: null,
      breachedPercent: null,
    }
    techStats.total += 1
    if (ticket.slaMet != null) {
      techStats.evaluated += 1
      if (ticket.slaMet) techStats.met += 1
      else techStats.breached += 1
    }
    techGroups.set(techKey, techStats)

    const resolved = parseFlexibleDate(ticket.resolvedAt)
    if (resolved) {
      const monthKey = format(resolved, 'yyyy-MM')
      monthGroups.set(monthKey, (monthGroups.get(monthKey) ?? 0) + 1)
    }
  }

  const byCustomer = Array.from(customerGroups.values())
    .map(finalizeCustomerStats)
    .sort((a, b) => b.total - a.total)

  const byTechnician = Array.from(techGroups.values())
    .map((stats) => ({
      ...stats,
      metPercent: percent(stats.met, stats.evaluated),
      breachedPercent: percent(stats.breached, stats.evaluated),
    }))
    .sort((a, b) => {
      if (a.isPartner !== b.isPartner) return a.isPartner ? 1 : -1
      return b.total - a.total
    })

  const partner = byTechnician.find((item) => item.isPartner) ?? {
    technicianId: null,
    technicianName: PARTNER_NAME,
    isPartner: true,
    total: 0,
    evaluated: 0,
    met: 0,
    breached: 0,
    metPercent: null,
    breachedPercent: null,
  }

  const byMonth: MonthStats[] = Array.from(monthGroups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, total]) => {
      const [year, month] = monthKey.split('-').map(Number)
      const date = new Date(year, month - 1, 1)
      return {
        monthKey,
        label: format(date, 'LLLL yyyy', { locale: de }),
        total,
      }
    })

  const bySlaType = (['NBD', '2ND_NBD'] as SlaType[]).map((slaType) => {
    const bucket = typeBuckets.get(slaType) ?? {
      total: 0,
      evaluated: 0,
      met: 0,
      breached: 0,
    }
    return {
      slaType,
      total: bucket.total,
      evaluated: bucket.evaluated,
      metPercent: percent(bucket.met, bucket.evaluated),
      breachedPercent: percent(bucket.breached, bucket.evaluated),
    }
  })

  return {
    totalTickets: tickets.length,
    matchedTickets,
    unmatchedTickets: tickets.length - matchedTickets,
    technicianMatched,
    partnerTickets,
    evaluated,
    met,
    breached,
    metPercent: percent(met, evaluated),
    breachedPercent: percent(breached, evaluated),
    avgBusinessDays: average(businessDaySamples),
    byCustomer,
    byTechnician,
    byMonth,
    bySlaType,
    partner,
  }
}

export function reevaluateTickets(
  tickets: Ticket[],
  customers: Customer[],
  technicians: Technician[],
): Ticket[] {
  return tickets.map((ticket) => ({
    ...ticket,
    ...evaluateTicketFields(ticket, customers, technicians),
  }))
}
