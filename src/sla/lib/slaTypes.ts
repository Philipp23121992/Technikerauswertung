import type { SlaType } from '../types'

export interface SlaTypeOption {
  id: SlaType
  label: string
  shortLabel: string
  description: string
  businessDays: number
}

export const SLA_TYPE_OPTIONS: SlaTypeOption[] = [
  {
    id: 'NBD',
    label: 'NBD (Next Business Day)',
    shortLabel: 'NBD',
    description: 'Nächster Arbeitstag',
    businessDays: 1,
  },
  {
    id: '2ND_NBD',
    label: '2nd NBD',
    shortLabel: '2nd NBD',
    description: 'Bis zu 2 Arbeitstage',
    businessDays: 2,
  },
]

export function getSlaTypeOption(slaType: SlaType | null | undefined): SlaTypeOption | null {
  if (!slaType) return null
  return SLA_TYPE_OPTIONS.find((option) => option.id === slaType) ?? null
}

export function formatSlaType(slaType: SlaType | null | undefined): string {
  return getSlaTypeOption(slaType)?.shortLabel ?? '—'
}
