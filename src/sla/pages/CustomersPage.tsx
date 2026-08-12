import { useMemo, useState } from 'react'
import { useEditAccess } from '@/components/EditAccessProvider'
import { Eraser, Pencil, Plus, Trash2 } from 'lucide-react'
import { formatSlaType, SLA_TYPE_OPTIONS } from '../lib/slaTypes'
import { useAppStore } from '../store/useAppStore'
import type { Customer, SlaType } from '../types'

interface CustomerFormState {
  name: string
  aliases: string
  slaType: SlaType
}

const EMPTY_FORM: CustomerFormState = {
  name: '',
  aliases: '',
  slaType: 'NBD',
}

function toForm(customer: Customer): CustomerFormState {
  return {
    name: customer.name,
    aliases: customer.aliases.join(', '),
    slaType: customer.slaType,
  }
}

export function CustomersPage() {
  const customers = useAppStore((state) => state.customers)
  const tickets = useAppStore((state) => state.tickets)
  const addCustomer = useAppStore((state) => state.addCustomer)
  const updateCustomer = useAppStore((state) => state.updateCustomer)
  const deleteCustomer = useAppStore((state) => state.deleteCustomer)
  const removeTicketsForCustomer = useAppStore(
    (state) => state.removeTicketsForCustomer,
  )
  const { canEdit } = useEditAccess()

  const [form, setForm] = useState<CustomerFormState>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const ticketCountByCustomer = useMemo(() => {
    const counts = new Map<string, number>()
    for (const ticket of tickets) {
      if (!ticket.customerId) continue
      counts.set(ticket.customerId, (counts.get(ticket.customerId) ?? 0) + 1)
    }
    return counts
  }, [tickets])

  function resetForm() {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setError('')
  }

  async function submit() {
    if (!canEdit) {
      setError('Schreibzugriff gesperrt. Bitte in der Sidebar freischalten.')
      return
    }
    setError('')
    const name = form.name.trim()

    if (!name) {
      setError('Kundenname ist erforderlich.')
      return
    }

    const aliases = form.aliases
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)

    const payload = { name, aliases, slaType: form.slaType }

    try {
      if (editingId) {
        await updateCustomer(editingId, payload)
      } else {
        await addCustomer(payload)
      }
      resetForm()
    } catch {
      setError('Speichern fehlgeschlagen – Sync-Server erreichbar?')
    }
  }

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h2>Kunden & SLA</h2>
          <p>
            Pro Kunde ein SLA-Typ: <strong>NBD</strong> (nächster Arbeitstag) oder{' '}
            <strong>2nd NBD</strong> (bis 2 Arbeitstage). Aliase steuern den CSV-Match.
          </p>
        </div>
      </div>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-header">
            <h3>{editingId ? 'Kunde bearbeiten' : 'Neuen Kunden anlegen'}</h3>
          </div>
          <div className="panel-body stack">
            <div className="form-grid">
              <div className="field full">
                <label htmlFor="name">Kundenname</label>
                <input
                  id="name"
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="z. B. Kunde XY"
                />
              </div>
              <div className="field full">
                <label htmlFor="slaType">SLA-Typ</label>
                <select
                  id="slaType"
                  value={form.slaType}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      slaType: event.target.value as SlaType,
                    }))
                  }
                >
                  {SLA_TYPE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label} — {option.description}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field full">
                <label htmlFor="aliases">Aliase (kommagetrennt, optional)</label>
                <textarea
                  id="aliases"
                  rows={3}
                  value={form.aliases}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      aliases: event.target.value,
                    }))
                  }
                  placeholder="Schreibweisen aus der CSV, z. B. ACME, Acme GmbH"
                />
              </div>
            </div>

            {error && <div className="notice warn">{error}</div>}
            {message && <div className="notice success">{message}</div>}

            <div className="toolbar">
              <button
                className="btn btn-primary"
                type="button"
                disabled={!canEdit}
                onClick={() => void submit()}
              >
                {editingId ? (
                  <>
                    <Pencil size={16} /> Speichern
                  </>
                ) : (
                  <>
                    <Plus size={16} /> Kunde anlegen
                  </>
                )}
              </button>
              {editingId && (
                <button className="btn btn-ghost" type="button" onClick={resetForm}>
                  Abbrechen
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h3>Hinterlegte Kunden</h3>
            <span className="badge badge-muted">{customers.length}</span>
          </div>
          <div className="panel-body">
            {!customers.length ? (
              <div className="empty">Noch keine Kunden hinterlegt.</div>
            ) : (
              <div className="customer-list">
                {customers.map((customer) => {
                  const option = SLA_TYPE_OPTIONS.find((item) => item.id === customer.slaType)
                  const ticketCount = ticketCountByCustomer.get(customer.id) ?? 0
                  return (
                    <article className="customer-item" key={customer.id}>
                      <div>
                        <h4>{customer.name}</h4>
                        <p>
                          <span className="badge badge-ok">{formatSlaType(customer.slaType)}</span>{' '}
                          {option?.description}
                        </p>
                        {!!customer.aliases.length && (
                          <p>Aliase: {customer.aliases.join(', ')}</p>
                        )}
                        <p>{ticketCount} Tickets zugeordnet</p>
                      </div>
                      <div className="actions">
                        <button
                          className="btn btn-secondary"
                          type="button"
                          disabled={!canEdit}
                          title="Bearbeiten"
                          onClick={() => {
                            setEditingId(customer.id)
                            setForm(toForm(customer))
                            setError('')
                            setMessage('')
                          }}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="btn btn-secondary"
                          type="button"
                          disabled={!canEdit || ticketCount === 0}
                          title="Nur Tickets dieses Kunden entfernen"
                          onClick={() => {
                            if (
                              !window.confirm(
                                `${ticketCount} Tickets von „${customer.name}“ wirklich entfernen?\n\nDer Kundeneintrag bleibt erhalten.`,
                              )
                            ) {
                              return
                            }
                            setError('')
                            setMessage('')
                            void removeTicketsForCustomer(customer.id)
                              .then((removed) => {
                                setMessage(
                                  removed
                                    ? `${removed} Tickets von „${customer.name}“ entfernt.`
                                    : `Keine Tickets für „${customer.name}“ gefunden.`,
                                )
                              })
                              .catch(() => {
                                setError(
                                  'Tickets konnten nicht entfernt werden – Sync erreichbar?',
                                )
                              })
                          }}
                        >
                          <Eraser size={16} />
                        </button>
                        <button
                          className="btn btn-danger"
                          type="button"
                          disabled={!canEdit}
                          title="Kundenstammdaten löschen"
                          onClick={() => {
                            if (
                              window.confirm(
                                `Kunde „${customer.name}“ wirklich löschen?\n\nTickets bleiben erhalten und werden neu zugeordnet.`,
                              )
                            ) {
                              setError('')
                              setMessage('')
                              void deleteCustomer(customer.id).then(() => {
                                if (editingId === customer.id) resetForm()
                              })
                            }
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
