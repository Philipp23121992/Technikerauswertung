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
  ticketId: ['ticket', 'ticketid', 'ticket_id', 'id', 'nummer', 'ticketnummer', 'case', 'incident'],
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

export function guessColumnMapping(headers: string[]): ColumnMapping {
  const normalized = headers.map((header) => ({
    original: header,
    key: normalizeHeader(header),
  }))

  const pick = (field: keyof ColumnMapping): string => {
    const aliases = new Set(FIELD_ALIASES[field].map(normalizeHeader))
    const found = normalized.find((item) => aliases.has(item.key))
    return found?.original ?? ''
  }

  return {
    ticketId: pick('ticketId'),
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
