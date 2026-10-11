import { create } from 'zustand'
import { saveState, type SyncState } from '../lib/api'
import {
  buildTimeTicketsFromRows,
  reevaluateTimeTickets,
} from '../lib/handlingTime'
import { buildTicketsFromRows, reevaluateTickets } from '../lib/sla'
import type {
  ColumnMapping,
  Customer,
  ImportBatch,
  RawTicketRow,
  Technician,
  Ticket,
  TimeTicket,
} from '../types'
import { DEFAULT_CUSTOMERS, DEFAULT_TECHNICIANS } from '../types'

export type SyncStatus = 'connecting' | 'online' | 'offline' | 'saving' | 'error'

interface AppState {
  customers: Customer[]
  technicians: Technician[]
  tickets: Ticket[]
  imports: ImportBatch[]
  timeTickets: TimeTicket[]
  timeImports: ImportBatch[]
  revision: number
  syncStatus: SyncStatus
  syncError: string
  lastSyncedAt: string | null
  setSyncMeta: (meta: {
    syncStatus?: SyncStatus
    syncError?: string
    lastSyncedAt?: string | null
  }) => void
  hydrateFromServer: (state: SyncState) => void
  addCustomer: (customer: Omit<Customer, 'id'>) => Promise<void>
  updateCustomer: (
    id: string,
    patch: Partial<Omit<Customer, 'id'>>,
  ) => Promise<void>
  deleteCustomer: (id: string) => Promise<void>
  removeTicketsForCustomer: (customerId: string) => Promise<number>
  addTechnician: (technician: Omit<Technician, 'id'>) => Promise<void>
  updateTechnician: (
    id: string,
    patch: Partial<Omit<Technician, 'id'>>,
  ) => Promise<void>
  deleteTechnician: (id: string) => Promise<void>
  importTickets: (payload: {
    fileName: string
    rows: RawTicketRow[]
    mapping: ColumnMapping
    replace: boolean
  }) => Promise<number>
  clearTickets: () => Promise<void>
  importTimeTickets: (payload: {
    fileName: string
    rows: RawTicketRow[]
    mapping: ColumnMapping
    replace: boolean
  }) => Promise<number>
  clearTimeTickets: () => Promise<void>
}

function createId(prefix: string): string {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `${prefix}-${uuid}`
}

function refreshTickets(
  tickets: Ticket[],
  customers: Customer[],
  technicians: Technician[],
) {
  return reevaluateTickets(tickets, customers, technicians)
}

function refreshTimeTickets(tickets: TimeTicket[], technicians: Technician[]) {
  return reevaluateTimeTickets(tickets, technicians)
}

async function persistSnapshot(get: () => AppState) {
  const state = get()
  state.setSyncMeta({ syncStatus: 'saving', syncError: '' })
  const result = await saveState({
    customers: state.customers,
    technicians: state.technicians,
    tickets: state.tickets,
    imports: state.imports,
    timeTickets: state.timeTickets,
    timeImports: state.timeImports,
  })

  if (!result.ok) {
    state.setSyncMeta({
      syncStatus: 'error',
      syncError: result.error,
    })
    throw new Error(result.error)
  }

  useAppStore.setState({
    revision: result.data.revision,
    lastSyncedAt: result.data.updatedAt,
    syncStatus: 'online',
    syncError: '',
  })
}

export const useAppStore = create<AppState>((set, get) => ({
  customers: DEFAULT_CUSTOMERS,
  technicians: DEFAULT_TECHNICIANS,
  tickets: [],
  imports: [],
  timeTickets: [],
  timeImports: [],
  revision: 0,
  syncStatus: 'connecting',
  syncError: '',
  lastSyncedAt: null,

  setSyncMeta: (meta) => set(meta),

  hydrateFromServer: (state) => {
    const customers = state.customers
    const technicians = state.technicians
    set({
      customers,
      technicians,
      tickets: refreshTickets(state.tickets, customers, technicians),
      imports: state.imports,
      timeTickets: refreshTimeTickets(
        Array.isArray(state.timeTickets) ? state.timeTickets : [],
        technicians,
      ),
      timeImports: Array.isArray(state.timeImports) ? state.timeImports : [],
      revision: state.revision,
      lastSyncedAt: state.updatedAt,
      syncStatus: 'online',
      syncError: '',
    })
  },

  addCustomer: async (customer) => {
    const customers = [...get().customers, { ...customer, id: createId('cust') }]
    set({
      customers,
      tickets: refreshTickets(get().tickets, customers, get().technicians),
    })
    await persistSnapshot(get)
  },

  updateCustomer: async (id, patch) => {
    const customers = get().customers.map((customer) =>
      customer.id === id ? { ...customer, ...patch } : customer,
    )
    set({
      customers,
      tickets: refreshTickets(get().tickets, customers, get().technicians),
    })
    await persistSnapshot(get)
  },

  deleteCustomer: async (id) => {
    const customers = get().customers.filter((customer) => customer.id !== id)
    set({
      customers,
      tickets: refreshTickets(get().tickets, customers, get().technicians),
    })
    await persistSnapshot(get)
  },

  removeTicketsForCustomer: async (customerId) => {
    const before = get().tickets
    const tickets = before.filter((ticket) => ticket.customerId !== customerId)
    const removed = before.length - tickets.length

    if (!removed) return 0

    const remainingBatchIds = new Set(tickets.map((ticket) => ticket.importBatchId))
    const imports = get()
      .imports.map((batch) => ({
        ...batch,
        ticketCount: tickets.filter((ticket) => ticket.importBatchId === batch.id)
          .length,
      }))
      .filter((batch) => remainingBatchIds.has(batch.id) && batch.ticketCount > 0)

    set({ tickets, imports })
    await persistSnapshot(get)
    return removed
  },

  addTechnician: async (technician) => {
    const technicians = [
      ...get().technicians,
      { ...technician, id: createId('tech') },
    ]
    set({
      technicians,
      tickets: refreshTickets(get().tickets, get().customers, technicians),
      timeTickets: refreshTimeTickets(get().timeTickets, technicians),
    })
    await persistSnapshot(get)
  },

  updateTechnician: async (id, patch) => {
    const technicians = get().technicians.map((technician) =>
      technician.id === id ? { ...technician, ...patch } : technician,
    )
    set({
      technicians,
      tickets: refreshTickets(get().tickets, get().customers, technicians),
      timeTickets: refreshTimeTickets(get().timeTickets, technicians),
    })
    await persistSnapshot(get)
  },

  deleteTechnician: async (id) => {
    const technicians = get().technicians.filter(
      (technician) => technician.id !== id,
    )
    set({
      technicians,
      tickets: refreshTickets(get().tickets, get().customers, technicians),
      timeTickets: refreshTimeTickets(get().timeTickets, technicians),
    })
    await persistSnapshot(get)
  },

  importTickets: async ({ fileName, rows, mapping, replace }) => {
    const batchId = createId('batch')
    const built = buildTicketsFromRows(
      rows,
      mapping,
      get().customers,
      get().technicians,
      batchId,
    )
    const batch: ImportBatch = {
      id: batchId,
      fileName,
      importedAt: new Date().toISOString(),
      ticketCount: built.length,
    }

    set((state) => ({
      tickets: replace ? built : [...state.tickets, ...built],
      imports: replace ? [batch] : [batch, ...state.imports],
    }))
    await persistSnapshot(get)
    return built.length
  },

  clearTickets: async () => {
    set({ tickets: [], imports: [] })
    await persistSnapshot(get)
  },

  importTimeTickets: async ({ fileName, rows, mapping, replace }) => {
    const batchId = createId('time-batch')
    const built = buildTimeTicketsFromRows(
      rows,
      mapping,
      get().technicians,
      batchId,
    )
    const batch: ImportBatch = {
      id: batchId,
      fileName,
      importedAt: new Date().toISOString(),
      ticketCount: built.length,
    }

    set((state) => ({
      timeTickets: replace ? built : [...state.timeTickets, ...built],
      timeImports: replace ? [batch] : [batch, ...state.timeImports],
    }))
    await persistSnapshot(get)
    return built.length
  },

  clearTimeTickets: async () => {
    set({ timeTickets: [], timeImports: [] })
    await persistSnapshot(get)
  },
}))
