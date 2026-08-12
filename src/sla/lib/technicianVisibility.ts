/** Zusätzlich zu Stammdaten-Technikern in der Auswertung anzeigen. */
const EXTRA_TECHNICIAN_ALLOWLIST = [
  'PLZ:34253 - Reinhold Jodeit, Partner',
  'PLZ:34253 - Reinhold Jodeit',
  'Reinhold Jodeit',
]

function normalizeAssignee(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

const EXTRA_NORMALIZED = EXTRA_TECHNICIAN_ALLOWLIST.map(normalizeAssignee)

export function isExtraAllowedTechnician(
  technicianName: string,
  technicianKey = '',
): boolean {
  const candidates = [technicianName, technicianKey]
    .map(normalizeAssignee)
    .filter(Boolean)

  return candidates.some(
    (value) =>
      EXTRA_NORMALIZED.some(
        (allowed) => value === allowed || value.includes(allowed),
      ) ||
      (value.includes('34253') && value.includes('reinhold') && value.includes('jodeit')),
  )
}

/** SLA-Tickets: nur bekannte Techniker + Allowlist-Ausnahme. */
export function isVisibleInSlaTechnicianView(ticket: {
  isPartner: boolean
  technicianName: string
  technicianKey?: string
}): boolean {
  if (!ticket.isPartner) return true
  return isExtraAllowedTechnician(ticket.technicianName, ticket.technicianKey)
}

/** Bearbeitungszeit: nur Stammdaten-Techniker + Allowlist-Ausnahme. */
export function isVisibleInTimeTechnicianView(ticket: {
  knownTechnician: boolean
  technicianName: string
  technicianKey?: string
}): boolean {
  if (ticket.knownTechnician) return true
  return isExtraAllowedTechnician(ticket.technicianName, ticket.technicianKey)
}
