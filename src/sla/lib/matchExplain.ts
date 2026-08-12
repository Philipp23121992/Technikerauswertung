import {
  matchCustomerDetailed,
  matchTechnicianDetailed,
  type MatchKind,
} from './match'
import type { Customer, Technician } from '../types'

export type { MatchKind }

export interface MatchExplanation<T> {
  matched: T | null
  kind: MatchKind
  matchedVia: string | null
  reason: string
}

export function explainCustomerMatch(
  customerKey: string,
  customers: Customer[],
): MatchExplanation<Customer> {
  const result = matchCustomerDetailed(customerKey, customers)
  const raw = customerKey.trim()

  if (result.kind === 'empty') {
    return {
      ...result,
      reason: 'Kein Kundenname in der CSV → keine Kundenzuordnung, kein Kunden-SLA.',
    }
  }
  if (result.kind === 'none') {
    return {
      ...result,
      reason: `„${raw}“ wurde in der Kundendatenbank nicht gefunden (Name/Alias) → ohne Kundenmatch.`,
    }
  }
  if (result.kind === 'exact' && result.matched) {
    const via = result.matchedVia ?? result.matched.name
    return {
      ...result,
      reason:
        via === result.matched.name
          ? `Exakter Treffer auf Kundenname „${result.matched.name}“.`
          : `Exakter Treffer über Alias „${via}“ → Kunde „${result.matched.name}“.`,
    }
  }
  if (result.matched) {
    const via = result.matchedVia ?? result.matched.name
    return {
      ...result,
      reason: `Teiltreffer über „${via}“ → Kunde „${result.matched.name}“ (als ganzes Wort/Phrase).`,
    }
  }
  return { ...result, reason: 'Keine Kundenzuordnung.' }
}

export function explainTechnicianMatch(
  technicianKey: string,
  technicians: Technician[],
): MatchExplanation<Technician> {
  const result = matchTechnicianDetailed(technicianKey, technicians)
  const raw = technicianKey.trim()

  if (result.kind === 'empty') {
    return {
      ...result,
      reason: 'Kein Bearbeiter in der CSV → als Partner zusammengefasst.',
    }
  }
  if (result.kind === 'none') {
    return {
      ...result,
      reason: `„${raw}“ steht nicht in der Techniker-Datenbank → als Partner zusammengefasst.`,
    }
  }
  if (result.kind === 'exact' && result.matched) {
    const via = result.matchedVia ?? result.matched.name
    return {
      ...result,
      reason:
        via === result.matched.name
          ? `Exakter Treffer auf Techniker „${result.matched.name}“ → eigener Techniker.`
          : `Exakter Treffer über Alias „${via}“ → Techniker „${result.matched.name}“.`,
    }
  }
  if (result.matched) {
    const via = result.matchedVia ?? result.matched.name
    return {
      ...result,
      reason: `Teiltreffer über „${via}“ → Techniker „${result.matched.name}“ (als ganzes Wort/Phrase).`,
    }
  }
  return { ...result, reason: 'Als Partner zusammengefasst.' }
}
