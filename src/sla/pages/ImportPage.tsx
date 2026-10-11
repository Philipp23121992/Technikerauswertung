import { useEditAccess } from '@/components/EditAccessProvider'
import { useMemo, useState, type DragEvent } from 'react'
import { useRouter } from 'next/navigation'
import { FileUp, CheckCircle2 } from 'lucide-react'
import { guessColumnMapping, parseCsvFile } from '../lib/csv'
import { computeStats } from '../lib/sla'
import { useAppStore } from '../store/useAppStore'
import type { ColumnMapping, RawTicketRow } from '../types'
import { EMPTY_MAPPING } from '../types'

const MAPPING_FIELDS: { key: keyof ColumnMapping; label: string; hint: string }[] = [
  { key: 'customer', label: 'Kunde / Firma', hint: 'Kundenzuordnung' },
  { key: 'technician', label: 'Techniker', hint: 'ohne Match → Partner' },
  { key: 'createdAt', label: 'Erstellt am', hint: 'Start für Arbeitstage' },
  { key: 'resolvedAt', label: 'Gelöst am', hint: 'Ende + Monatsauswertung' },
  { key: 'ticketId', label: 'Ticketnummer', hint: 'z. B. 2026-100123' },
  { key: 'priority', label: 'Priorität', hint: 'Optional' },
  { key: 'status', label: 'Status', hint: 'Optional' },
  { key: 'subject', label: 'Betreff', hint: 'Optional' },
]

export function ImportPage() {
  const { canEdit } = useEditAccess()
  const router = useRouter()
  const importTickets = useAppStore((state) => state.importTickets)
  const clearTickets = useAppStore((state) => state.clearTickets)
  const imports = useAppStore((state) => state.imports)
  const customers = useAppStore((state) => state.customers)

  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<RawTicketRow[]>([])
  const [mapping, setMapping] = useState<ColumnMapping>(EMPTY_MAPPING)
  /** Default: anhängen – weitere Monate (z. B. August) ergänzen bestehende Kundendaten */
  const [append, setAppend] = useState(true)
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const previewRows = useMemo(() => rows.slice(0, 5), [rows])

  async function handleFile(file: File | null | undefined) {
    if (!canEdit) return
    if (!file) return
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      const parsed = await parseCsvFile(file)
      if (!parsed.headers.length) {
        throw new Error('Keine Spaltenköpfe gefunden. Bitte CSV mit Header-Zeile verwenden.')
      }
      setFileName(file.name)
      setHeaders(parsed.headers)
      setRows(parsed.rows)
      setMapping(guessColumnMapping(parsed.headers, parsed.rows))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import fehlgeschlagen.')
      setFileName('')
      setHeaders([])
      setRows([])
      setMapping(EMPTY_MAPPING)
    } finally {
      setLoading(false)
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragActive(false)
    void handleFile(event.dataTransfer.files?.[0])
  }

  async function runImport() {
    setError('')
    setSuccess('')
    if (!customers.length) {
      setError('Bitte zuerst unter „Kunden & SLA“ Kunden mit SLA-Typ anlegen.')
      return
    }
    if (!rows.length) {
      setError('Bitte zuerst eine CSV-Datei laden.')
      return
    }
    if (!mapping.customer) {
      setError('Spalte „Kunde / Firma“ muss gemappt sein.')
      return
    }
    if (!mapping.createdAt || !mapping.resolvedAt) {
      setError('Spalten „Erstellt am“ und „Gelöst am“ müssen gemappt sein.')
      return
    }

    try {
      const count = await importTickets({
        fileName,
        rows,
        mapping,
        replace: !append,
      })
      const allTickets = useAppStore.getState().tickets
      const stats = computeStats(allTickets)
      setSuccess(
        append
          ? `${count} Tickets angehängt · Gesamt jetzt ${allTickets.length} · ` +
              `${stats.matchedTickets} mit Kundenmatch`
          : `${count} Tickets importiert (Auswertung ersetzt) · ` +
              `${stats.matchedTickets} mit Kundenmatch`,
      )
      window.setTimeout(() => router.push('/sla/zuordnung'), 700)
    } catch (err) {
      setError(
        err instanceof Error
          ? `Import fehlgeschlagen: ${err.message}`
          : 'Import fehlgeschlagen – Sync nicht erreichbar?',
      )
    }
  }

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h2>CSV Import</h2>
          <p>
            Weitere Monats-CSVs (z. B. DM Tech August) werden standardmäßig an
            die bestehende Auswertung angehängt und dem Kunden zugeordnet.
          </p>
        </div>
        <button
          className="btn btn-ghost"
          type="button"
          disabled={!canEdit}
          onClick={() => {
            if (!canEdit) return
            void clearTickets()
          }}
        >
          Auswertung zurücksetzen
        </button>
      </div>

      <div
        className={`dropzone ${dragActive ? 'active' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault()
          setDragActive(true)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={(event) => {
          event.preventDefault()
          setDragActive(false)
        }}
        onDrop={onDrop}
      >
        <FileUp size={28} />
        <h3>{loading ? 'Datei wird gelesen…' : 'CSV hierher ziehen'}</h3>
        <p>Benötigt: Kunde, Erstellt am, Gelöst am · empfohlen: Techniker</p>
        <div style={{ marginTop: 16 }}>
          <label className="btn btn-primary">
            Datei wählen
            <input
              type="file" disabled={!canEdit}
              accept=".csv,text/csv"
              hidden
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
          </label>
        </div>
      </div>

      {error && <div className="notice warn">{error}</div>}
      {success && (
        <div className="notice success">
          <CheckCircle2 size={16} style={{ verticalAlign: 'text-bottom' }} /> {success}
        </div>
      )}

      {!!headers.length && (
        <section className="panel">
          <div className="panel-header">
            <h3>Spaltenzuordnung · {fileName}</h3>
            <span className="badge badge-muted">{rows.length} Zeilen</span>
          </div>
          <div className="panel-body stack">
            <div className="mapping-grid">
              {MAPPING_FIELDS.map((field) => (
                <div className="field" key={field.key}>
                  <label htmlFor={field.key}>
                    {field.label}
                    <span style={{ fontWeight: 400 }}> · {field.hint}</span>
                  </label>
                  <select
                    id={field.key}
                    value={mapping[field.key]}
                    onChange={(event) =>
                      setMapping((current) => ({
                        ...current,
                        [field.key]: event.target.value,
                      }))
                    }
                  >
                    <option value="">— nicht zuordnen —</option>
                    {headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <label className="toolbar" style={{ color: 'var(--ink-soft)' }}>
              <input
                type="checkbox"
                checked={append}
                onChange={(event) => setAppend(event.target.checked)}
              />
              An bestehende Auswertung anhängen (z. B. weiterer Monat für denselben
              Kunden)
            </label>
            {!append && (
              <div className="notice warn">
                Achtung: Ohne „Anhängen“ wird die bisherige Auswertung komplett
                ersetzt.
              </div>
            )}

            <div className="toolbar">
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => void runImport()}
              >
                {append ? 'Anhängen & auswerten' : 'Ersetzen & auswerten'}
              </button>
            </div>
          </div>
        </section>
      )}

      {!!previewRows.length && (
        <section className="panel">
          <div className="panel-header">
            <h3>Vorschau (erste 5 Zeilen)</h3>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  {headers.map((header) => (
                    <th key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, index) => (
                  <tr key={index}>
                    {headers.map((header) => (
                      <td key={header}>{row[header]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!!imports.length && (
        <section className="panel">
          <div className="panel-header">
            <h3>Bisherige Imports</h3>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Datei</th>
                  <th>Zeitpunkt</th>
                  <th>Tickets</th>
                </tr>
              </thead>
              <tbody>
                {imports.map((item) => (
                  <tr key={item.id}>
                    <td>{item.fileName}</td>
                    <td className="mono">
                      {new Date(item.importedAt).toLocaleString('de-DE')}
                    </td>
                    <td>{item.ticketCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
