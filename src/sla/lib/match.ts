import type { Customer, Technician } from '../types'

export type MatchKind = 'exact' | 'partial' | 'none' | 'empty'

export interface NameMatchResult<T> {
  matched: T | null
  kind: MatchKind
  matchedVia: string | null
}

export function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** True if needle appears in haystack as whole words (avoids Chris ⊂ Christian). */
function containsWholePhrase(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false
  if (haystack === needle) return true
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`).test(haystack)
}

function matchByNamesDetailed<T extends { name: string; aliases: string[] }>(
  keyRaw: string,
  entries: T[],
): NameMatchResult<T> {
  const raw = keyRaw.trim()
  if (!raw) {
    return { matched: null, kind: 'empty', matchedVia: null }
  }

  const key = normalizeName(raw)

  for (const entry of entries) {
    const candidates = [entry.name, ...entry.aliases]
    for (const candidate of candidates) {
      if (normalizeName(candidate) === key) {
        return { matched: entry, kind: 'exact', matchedVia: candidate }
      }
    }
  }

  // Prefer longer candidates first so "Chris Zimmermann" beats "Chris"
  const ranked: { entry: T; candidate: string; normalized: string }[] = []
  for (const entry of entries) {
    for (const candidate of [entry.name, ...entry.aliases]) {
      const normalized = normalizeName(candidate)
      if (normalized) ranked.push({ entry, candidate, normalized })
    }
  }
  ranked.sort((a, b) => b.normalized.length - a.normalized.length)

  for (const item of ranked) {
    if (
      containsWholePhrase(key, item.normalized) ||
      containsWholePhrase(item.normalized, key)
    ) {
      return {
        matched: item.entry,
        kind: 'partial',
        matchedVia: item.candidate,
      }
    }
  }

  return { matched: null, kind: 'none', matchedVia: null }
}

export function matchCustomerDetailed(
  customerKey: string,
  customers: Customer[],
): NameMatchResult<Customer> {
  return matchByNamesDetailed(customerKey, customers)
}

export function matchTechnicianDetailed(
  technicianKey: string,
  technicians: Technician[],
): NameMatchResult<Technician> {
  return matchByNamesDetailed(technicianKey, technicians)
}

export function matchCustomer(
  customerKey: string,
  customers: Customer[],
): Customer | null {
  return matchByNamesDetailed(customerKey, customers).matched
}

export function matchTechnician(
  technicianKey: string,
  technicians: Technician[],
): Technician | null {
  return matchByNamesDetailed(technicianKey, technicians).matched
}
