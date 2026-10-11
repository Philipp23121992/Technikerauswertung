import Papa from 'papaparse'
import type { ColumnMapping, RawTicketRow } from '../types'

export interface ParsedCsv {
  headers: string[]
  rows: RawTicketRow[]
  delimiter: string
}

export function parseCsvFile(file: File): Promise<ParsedCsv> {
  return new Promise((resolve, reject) => {
    Papa.parse<RawTicketRow>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      delimiter: '',
      encoding: 'UTF-8',
      complete: (result) => {
        if (result.errors.length && !result.data.length) {
          reject(new Error(result.errors[0]?.message ?? 'CSV konnte nicht gelesen werden.'))
          return
        }

        const headers = (result.meta.fields ?? []).filter(Boolean)
        const rows = result.data.filter((row) =>
          Object.values(row).some((value) => String(value ?? '').trim() !== ''),
        )

        resolve({
          headers,
          rows,
          delimiter: result.meta.delimiter || ',',
        })
      },
      error: (error) => reject(error),
    })
  })
}

const FIELD_ALIASES: Record<keyof ColumnMapping, string[]> = {
  ticketId: [
    'ticket',
    'ticketid',
    'ticket_id',
    'ticketnr',
    'ticketno',
    'ticketnummer',
    'ticketnumber',
    'ticketnnummer',
    'id',
    'nummer',
    'fallnummer',
    'vorgang',
    'vorgangsnr',
    'vorgangsnummer',
    'referenz',
    'referenznummer',
    'case',
    'incident',
  ],
  customer: [
    'kunde',
    'customer',
    'firma',
    'company',
    'organisation',
    'organization',
    'account',
    'mandant',
    'client',
  ],
  technician: [
    'techniker',
    'technician',
    'bearbeiter',
    'assignee',
    'zugewiesen',
    'zugewiesenan',
    'owner',
    'agent',
    'mitarbeiter',
    'engineer',
  ],
  createdAt: [
    'erstellt',
    'erstelltam',
    'erstellt_am',
    'created',
    'createdat',
    'created_at',
    'opendate',
    'erstellungsdatum',
    'gemeldet',
    'angelegt',
    'angelegtam',
  ],
  firstResponseAt: [
    'erstreaktion',
    'erstereaktion',
    'firstresponse',
    'first_response',
    'firstresponseat',
    'antwortzeitpunkt',
    'reactedat',
  ],
  resolvedAt: [
    'geloest',
    'gelöst',
    'gelost',
    'geloestam',
    'gelöstam',
    'gelostam',
    'geloest_am',
    'resolved',
    'resolvedat',
    'resolved_at',
    'closed',
    'closedat',
    'closed_at',
    'abgeschlossen',
    'abschlussdatum',
    'geschlossen',
    'geschlossenam',
  ],
  priority: ['prioritaet', 'priorität', 'prioritat', 'priority', 'prio', 'urgency'],
  status: ['status', 'state', 'zustand'],
  subject: ['betreff', 'subject', 'title', 'titel', 'summary', 'beschreibung'],
  service: [
    'service',
    'services',
    'dienstleistung',
    'leistung',
    'produkt',
    'product',
    'kategorie',
    'category',
    'servicetyp',
    'serviceart',
    'servicevertrag',
    'vertrag',
    'sla',
  ],
  responseMinutes: [
    'reaktionszeit',
    'response_time',
    'responsetime',
    'responseminutes',
    'firstresponsetime',
    'sla_response',
  ],
  resolutionMinutes: [
    'loesungszeit',
    'lösungszeit',
    'losungszeit',
    'resolution_time',
    'resolutiontime',
    'resolutionminutes',
    'sla_resolution',
  ],
}

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

const TICKET_NUMBER_VALUE = /^(?:ticket[-_ ]?)?\d{4}-\d{5,}$/i

export function extractTicketNumber(value: string | null | undefined): string {
  const raw = String(value ?? '').trim()
  if (!raw || /^ROW-\d+$/i.test(raw)) return ''
  const match = raw.match(/(?:ticket[-_ ]?)?(\d{4}-\d{5,})/i)
  return match?.[1] ?? raw
}

function guessTicketIdByValues(
  headers: string[],
  rows: RawTicketRow[],
): string {
  const sample = rows.slice(0, 25)
  if (!sample.length) return ''

  let bestHeader = ''
  let bestHits = 0
  for (const header of headers) {
    const hits = sample.filter((row) =>
      TICKET_NUMBER_VALUE.test(String(row[header] ?? '').trim()),
    ).length
    if (hits > bestHits) {
      bestHits = hits
      bestHeader = header
    }
  }

  const threshold = Math.max(2, Math.ceil(sample.length * 0.4))
  return bestHits >= threshold ? bestHeader : ''
}

export function guessColumnMapping(
  headers: string[],
  rows: RawTicketRow[] = [],
): ColumnMapping {
  const normalized = headers.map((header) => ({
    original: header,
    key: normalizeHeader(header),
  }))

  const pick = (field: keyof ColumnMapping): string => {
    const aliases = new Set(FIELD_ALIASES[field].map(normalizeHeader))
    const exact = normalized.find((item) => aliases.has(item.key))
    if (exact) return exact.original

    if (field === 'ticketId') {
      const fuzzy = normalized.find((item) =>
        /ticket(nr|no|nummer|number|id)|vorgang(s)?(nr|nummer)|referenz(nr|nummer)?/.test(
          item.key,
        ),
      )
      if (fuzzy) return fuzzy.original
    }

    return ''
  }

  return {
    ticketId: pick('ticketId') || guessTicketIdByValues(headers, rows),
    customer: pick('customer'),
    technician: pick('technician'),
    createdAt: pick('createdAt'),
    firstResponseAt: pick('firstResponseAt'),
    resolvedAt: pick('resolvedAt'),
    priority: pick('priority'),
    status: pick('status'),
    subject: pick('subject'),
    service: pick('service'),
    responseMinutes: pick('responseMinutes'),
    resolutionMinutes: pick('resolutionMinutes'),
  }
}

export function cell(row: RawTicketRow, column: string): string {
  if (!column) return ''
  return String(row[column] ?? '').trim()
}
