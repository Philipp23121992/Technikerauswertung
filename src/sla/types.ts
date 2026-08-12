export type SlaType = 'NBD' | '2ND_NBD'

export const PARTNER_NAME = 'Partner'

export interface Customer {
  id: string
  name: string
  aliases: string[]
  slaType: SlaType
}

export interface Technician {
  id: string
  name: string
  aliases: string[]
}

export interface ColumnMapping {
  ticketId: string
  customer: string
  technician: string
  createdAt: string
  firstResponseAt: string
  resolvedAt: string
  priority: string
  status: string
  subject: string
  service: string
  responseMinutes: string
  resolutionMinutes: string
}

export interface RawTicketRow {
  [key: string]: string
}

export interface Ticket {
  id: string
  externalId: string
  customerKey: string
  customerId: string | null
  customerName: string | null
  slaType: SlaType | null
  technicianKey: string
  technicianId: string | null
  technicianName: string
  isPartner: boolean
  priority: string
  status: string
  subject: string
  createdAt: string | null
  firstResponseAt: string | null
  resolvedAt: string | null
  businessDaysUsed: number | null
  businessDaysAllowed: number | null
  slaMet: boolean | null
  importBatchId: string
}

export interface ImportBatch {
  id: string
  fileName: string
  importedAt: string
  ticketCount: number
}

export interface SlaBucketStats {
  total: number
  evaluated: number
  met: number
  breached: number
  metPercent: number | null
  breachedPercent: number | null
  avgBusinessDays: number | null
}

export interface CustomerSlaStats extends SlaBucketStats {
  customerId: string | null
  customerName: string
  slaType: SlaType | null
}

export interface TechnicianVolumeStats {
  technicianId: string | null
  technicianName: string
  isPartner: boolean
  total: number
  evaluated: number
  met: number
  breached: number
  metPercent: number | null
  breachedPercent: number | null
}

export interface MonthStats {
  monthKey: string
  label: string
  total: number
}

export interface OverallStats {
  totalTickets: number
  matchedTickets: number
  unmatchedTickets: number
  technicianMatched: number
  partnerTickets: number
  evaluated: number
  met: number
  breached: number
  metPercent: number | null
  breachedPercent: number | null
  avgBusinessDays: number | null
  byCustomer: CustomerSlaStats[]
  byTechnician: TechnicianVolumeStats[]
  byMonth: MonthStats[]
  bySlaType: {
    slaType: SlaType
    total: number
    evaluated: number
    metPercent: number | null
    breachedPercent: number | null
  }[]
  partner: TechnicianVolumeStats
}

/** Separater Datensatz: Bearbeitungszeit (ohne SLA-Bezug) */
export interface TimeTicket {
  id: string
  externalId: string
  customerKey: string
  serviceKey: string
  technicianKey: string
  technicianId: string | null
  technicianName: string
  knownTechnician: boolean
  subject: string
  createdAt: string | null
  resolvedAt: string | null
  handlingMinutes: number | null
  importBatchId: string
}

export interface TimeServiceBreakdown {
  serviceName: string
  count: number
  avgHandlingMinutes: number | null
}

export interface TimeCustomerBreakdown {
  customerName: string
  count: number
  avgHandlingMinutes: number | null
  byService: TimeServiceBreakdown[]
}

export interface TimeTechnicianStats {
  technicianId: string | null
  technicianName: string
  knownTechnician: boolean
  total: number
  evaluated: number
  avgHandlingMinutes: number | null
  byCustomer: TimeCustomerBreakdown[]
}

export interface TimeOverallStats {
  totalTickets: number
  evaluated: number
  avgHandlingMinutes: number | null
  byTechnician: TimeTechnicianStats[]
}

export const EMPTY_MAPPING: ColumnMapping = {
  ticketId: '',
  customer: '',
  technician: '',
  createdAt: '',
  firstResponseAt: '',
  resolvedAt: '',
  priority: '',
  status: '',
  subject: '',
  service: '',
  responseMinutes: '',
  resolutionMinutes: '',
}

export const DEFAULT_CUSTOMERS: Customer[] = [
  {
    id: 'cust-dm-tech',
    name: 'DM Tech',
    aliases: ['DMTech', 'DM-Tech', 'D.M. Tech', 'dm tech'],
    slaType: 'NBD',
  },
  {
    id: 'cust-acme',
    name: 'ACME GmbH',
    aliases: ['ACME', 'Acme GmbH', 'ACME Germany'],
    slaType: 'NBD',
  },
  {
    id: 'cust-nordic',
    name: 'Nordic Logistics AG',
    aliases: ['Nordic Logistics', 'Nordic AG'],
    slaType: '2ND_NBD',
  },
  {
    id: 'cust-stadtwerke',
    name: 'Stadtwerke Musterstadt',
    aliases: ['Stadtwerke', 'SW Musterstadt'],
    slaType: 'NBD',
  },
]

export const DEFAULT_TECHNICIANS: Technician[] = [
  {
    id: 'tech-mueller',
    name: 'Max Müller',
    aliases: ['Müller', 'Mueller', 'M. Müller'],
  },
  {
    id: 'tech-schmidt',
    name: 'Anna Schmidt',
    aliases: ['Schmidt', 'A. Schmidt'],
  },
  {
    id: 'tech-chris-zimmermann',
    name: 'Chris Zimmermann',
    // Kein Alias „Chris“ oder nur „Zimmermann“ – sonst würde Christian Zimmermann mitmatchen.
    aliases: ['Chris Zimmerman', 'C. Zimmermann'],
  },
]
