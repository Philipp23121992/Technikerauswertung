import { useState } from 'react'
import { useEditAccess } from '@/components/EditAccessProvider'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import type { Technician } from '../types'

interface TechnicianFormState {
  name: string
  aliases: string
}

const EMPTY_FORM: TechnicianFormState = {
  name: '',
  aliases: '',
}

function toForm(technician: Technician): TechnicianFormState {
  return {
    name: technician.name,
    aliases: technician.aliases.join(', '),
  }
}

export function TechniciansPage() {
  const technicians = useAppStore((state) => state.technicians)
  const addTechnician = useAppStore((state) => state.addTechnician)
  const updateTechnician = useAppStore((state) => state.updateTechnician)
  const deleteTechnician = useAppStore((state) => state.deleteTechnician)
  const { canEdit } = useEditAccess()

  const [form, setForm] = useState<TechnicianFormState>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')

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
      setError('Technikername ist erforderlich.')
      return
    }

    const aliases = form.aliases
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)

    const payload = { name, aliases }

    try {
      if (editingId) {
        await updateTechnician(editingId, payload)
      } else {
        await addTechnician(payload)
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
          <h2>Techniker</h2>
          <p>
            Nur Stammdaten: Wer ist eigener Techniker? Alle übrigen Bearbeiter
            aus dem Import werden in der Auswertung als Partner gezählt.
          </p>
        </div>
      </div>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-header">
            <h3>{editingId ? 'Techniker bearbeiten' : 'Neuen Techniker anlegen'}</h3>
          </div>
          <div className="panel-body stack">
            <div className="form-grid">
              <div className="field full">
                <label htmlFor="name">Technikername</label>
                <input
                  id="name"
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="z. B. Max Müller"
                />
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
                  placeholder="Müller, M. Müller"
                />
              </div>
            </div>

            {error && <div className="notice warn">{error}</div>}

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
                    <Plus size={16} /> Techniker anlegen
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
            <h3>Hinterlegte Techniker</h3>
            <span className="badge badge-muted">{technicians.length}</span>
          </div>
          <div className="panel-body">
            {!technicians.length ? (
              <div className="empty">Noch keine Techniker hinterlegt.</div>
            ) : (
              <div className="customer-list">
                {technicians.map((technician) => (
                  <article className="customer-item" key={technician.id}>
                    <div>
                      <h4>{technician.name}</h4>
                      {!!technician.aliases.length ? (
                        <p>Aliase: {technician.aliases.join(', ')}</p>
                      ) : (
                        <p>Keine Aliase</p>
                      )}
                    </div>
                    <div className="actions">
                      <button
                        className="btn btn-secondary"
                        type="button"
                        disabled={!canEdit}
                        onClick={() => {
                          setEditingId(technician.id)
                          setForm(toForm(technician))
                          setError('')
                        }}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="btn btn-danger"
                        type="button"
                        disabled={!canEdit}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Techniker „${technician.name}“ wirklich löschen?`,
                            )
                          ) {
                              void deleteTechnician(technician.id).then(() => {
                                if (editingId === technician.id) resetForm()
                              })
                          }
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
