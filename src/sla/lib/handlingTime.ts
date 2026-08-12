import { cell } from './csv'
import { minutesBetween } from './dates'
import { matchTechnician } from './match'
import type {
  ColumnMapping,
  RawTicketRow,
  Technician,
  TimeCustomerBreakdown,
  TimeOverallStats,
  TimeServiceBreakdown,
  TimeTechnicianStats,
  TimeTicket,
} from '../types'

function average(values: number[]): number | null {
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function resolveTechnician(technicianKey: string, technicians: Technician[]) {
  const matched = matchTechnician(technicianKey, technicians)
  if (matched) {
    return {
      technicianId: matched.id,
      technicianName: matched.name,
      knownTechnician: true,
    }
  }
  const fallback = technicianKey.trim() || 'Unbekannt'
  return {
    technicianId: null,
    technicianName: fallback,
    knownTechnician: false,
  }
}

export function buildTimeTicketsFromRows(
  rows: RawTicketRow[],
  mapping: ColumnMapping,
  technicians: Technician[],
  importBatchId: string,
): TimeTicket[] {
  return rows.map((row, index) => {
    const technicianKey = cell(row, mapping.technician)
    const createdAt = cell(row, mapping.createdAt) || null
    const resolvedAt = cell(row, mapping.resolvedAt) || null
    const externalId = cell(row, mapping.ticketId) || `ROW-${index + 1}`
    const tech = resolveTechnician(technicianKey, technicians)

    return {
      id: `${importBatchId}-${index}-${externalId}`,
      externalId,
      customerKey: cell(row, mapping.customer),
      serviceKey: mapping.service ? cell(row, mapping.service) : '',
      technicianKey,
      ...tech,
      subject: cell(row, mapping.subject),
      createdAt,
      resolvedAt,
      handlingMinutes: minutesBetween(createdAt, resolvedAt),
      importBatchId,
    }
  })
}

export function reevaluateTimeTickets(
  tickets: TimeTicket[],
  technicians: Technician[],
): TimeTicket[] {
  return tickets.map((ticket) => {
    const tech = resolveTechnician(ticket.technicianKey, technicians)
    return {
      ...ticket,
      serviceKey: ticket.serviceKey ?? '',
      ...tech,
      handlingMinutes: minutesBetween(ticket.createdAt, ticket.resolvedAt),
    }
  })
}

function buildServiceBreakdown(tickets: TimeTicket[]): TimeServiceBreakdown[] {
  const counts = new Map<string, number>()
  const minutesByService = new Map<string, number[]>()

  for (const ticket of tickets) {
    const name = ticket.serviceKey?.trim() || 'Ohne Service'
    counts.set(name, (counts.get(name) ?? 0) + 1)
    if (ticket.handlingMinutes != null) {
      const list = minutesByService.get(name) ?? []
      list.push(ticket.handlingMinutes)
      minutesByService.set(name, list)
    }
  }

  return [...counts.entries()]
    .map(([serviceName, count]) => ({
      serviceName,
      count,
      avgHandlingMinutes: average(minutesByService.get(serviceName) ?? []),
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return a.serviceName.localeCompare(b.serviceName, 'de')
    })
}

function buildCustomerBreakdown(tickets: TimeTicket[]): TimeCustomerBreakdown[] {
  const byCustomer = new Map<string, TimeTicket[]>()
  for (const ticket of tickets) {
    const name = ticket.customerKey.trim() || 'Ohne Kunde'
    const list = byCustomer.get(name) ?? []
    list.push(ticket)
    byCustomer.set(name, list)
  }

  return [...byCustomer.entries()]
    .map(([customerName, group]) => {
      const minutes = group
        .map((ticket) => ticket.handlingMinutes)
        .filter((value): value is number => value != null)
      return {
        customerName,
        count: group.length,
        avgHandlingMinutes: average(minutes),
        byService: buildServiceBreakdown(group),
      }
    })
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return a.customerName.localeCompare(b.customerName, 'de')
    })
}

export function computeTimeStats(tickets: TimeTicket[]): TimeOverallStats {
  const evaluatedMinutes = tickets
    .map((ticket) => ticket.handlingMinutes)
    .filter((value): value is number => value != null)

  const byTechMap = new Map<string, TimeTicket[]>()
  for (const ticket of tickets) {
    const key = ticket.technicianId
      ? `id:${ticket.technicianId}`
      : `name:${ticket.technicianName.trim().toLowerCase()}`
    const list = byTechMap.get(key) ?? []
    list.push(ticket)
    byTechMap.set(key, list)
  }

  const byTechnician: TimeTechnicianStats[] = [...byTechMap.values()]
    .map((group) => {
      const minutes = group
        .map((ticket) => ticket.handlingMinutes)
        .filter((value): value is number => value != null)

      const displayName =
        group
          .map((ticket) => ticket.technicianName.trim())
          .filter(Boolean)
          .sort((a, b) => b.length - a.length)[0] ?? 'Unbekannt'

      const sample = group.find((ticket) => ticket.knownTechnician) ?? group[0]

      return {
        technicianId: sample.technicianId,
        technicianName: sample.knownTechnician
          ? sample.technicianName
          : displayName,
        knownTechnician: sample.knownTechnician,
        total: group.length,
        evaluated: minutes.length,
        avgHandlingMinutes: average(minutes),
        byCustomer: buildCustomerBreakdown(group),
      }
    })
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total
      return a.technicianName.localeCompare(b.technicianName, 'de')
    })

  return {
    totalTickets: tickets.length,
    evaluated: evaluatedMinutes.length,
    avgHandlingMinutes: average(evaluatedMinutes),
    byTechnician,
  }
}
