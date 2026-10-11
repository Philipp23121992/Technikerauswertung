import { useEditAccess } from '@/components/EditAccessProvider'
import { useEffect, useMemo, useState, type DragEvent, Fragment } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, Clock3, FileUp } from 'lucide-react'
import { extractTicketNumber, guessColumnMapping, parseCsvFile } from '../lib/csv'
import { formatMinutes } from '../lib/dates'
import { computeTimeStats } from '../lib/handlingTime'
import {
  availableYearsFromTickets,
  defaultPeriodFilter,
  filterTicketsByPeriod,
  formatPeriodLabel,
  MONTH_OPTIONS,
  QUARTER_OPTIONS,
  type PeriodFilter,
  type PeriodMode,
} from '../lib/period'
import { isVisibleInTimeTechnicianView } from '../lib/technicianVisibility'
import { useAppStore } from '../store/useAppStore'
import type { ColumnMapping, RawTicketRow } from '../types'
import { EMPTY_MAPPING } from '../types'

const MAPPING_FIELDS: { key: keyof ColumnMapping; label: string; hint: string }[] = [
  { key: 'technician', label: 'Techniker', hint: 'Pflicht' },
  { key: 'createdAt', label: 'Erstellt am', hint: 'Start Bearbeitungszeit' },
  { key: 'resolvedAt', label: 'Gelöst am', hint: 'Ende Bearbeitungszeit' },
  { key: 'customer', label: 'Kunde / Firma', hint: 'Optional (Anzeige + Untermenü)' },
  { key: 'service', label: 'Service', hint: 'Optional – Aufschlüsselung im Untermenü' },
  { key: 'ticketId', label: 'Ticketnummer', hint: 'z. B. 2026-100123' },
  { key: 'subject', label: 'Betreff', hint: 'Optional' },
]

function formatTicketDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function HandlingTimePage() {
  const { canEdit } = useEditAccess()
  const importTimeTickets = useAppStore((state) => state.importTimeTickets)
  const clearTimeTickets = useAppStore((state) => state.clearTimeTickets)
  const timeTickets = useAppStore((state) => state.timeTickets)
  const timeImports = useAppStore((state) => state.timeImports)

  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<RawTicketRow[]>([])
  const [mapping, setMapping] = useState<ColumnMapping>(EMPTY_MAPPING)
  const [append, setAppend] = useState(true)
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [expandedTechKey, setExpandedTechKey] = useState<string | null>(null)

  const years = useMemo(() => availableYearsFromTickets(timeTickets), [timeTickets])
  const [period, setPeriod] = useState<PeriodFilter>(() =>
    defaultPeriodFilter(years),
  )

  useEffect(() => {
    setPeriod((current) => {
      if (years.includes(current.year)) return current
      return { ...current, year: years[years.length - 1] ?? current.year }
    })
  }, [years])

  const filteredTickets = useMemo(
    () => filterTicketsByPeriod(timeTickets, period),
    [timeTickets, period],
  )

  const visibleTickets = useMemo(
    () => filteredTickets.filter(isVisibleInTimeTechnicianView),
    [filteredTickets],
  )

  const stats = useMemo(
    () => computeTimeStats(visibleTickets),
    [visibleTickets],
  )
  const periodLabel = formatPeriodLabel(period)
  const previewRows = useMemo(() => rows.slice(0, 5), [rows])
  const detailRows = useMemo(() => {
    return [...visibleTickets].sort((a, b) => {
      const tech = a.technicianName.localeCompare(b.technicianName, 'de')
      if (tech !== 0) return tech
      return (a.resolvedAt ?? '').localeCompare(b.resolvedAt ?? '')
    })
  }, [visibleTickets])

  async function handleFile(file: File | null | undefined) {
    if (!canEdit) return
    if (!file) return
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      const parsed = await parseCsvFile(file)
      if (!parsed.headers.length) {
        throw new Error(
          'Keine Spaltenköpfe gefunden. Bitte CSV mit Header-Zeile verwenden.',
        )
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
    if (!rows.length) {
      setError('Bitte zuerst eine CSV-Datei laden.')
      return
    }
    if (!mapping.technician) {
      setError('Spalte „Techniker“ muss gemappt sein.')
      return
    }
    if (!mapping.createdAt || !mapping.resolvedAt) {
      setError('Spalten „Erstellt am“ und „Gelöst am“ müssen gemappt sein.')
      return
    }

    try {
      const count = await importTimeTickets({
        fileName,
        rows,
        mapping,
        replace: !append,
      })
      const all = useAppStore.getState().timeTickets
      setSuccess(
        append
          ? `${count} Tickets angehängt · Gesamt jetzt ${all.length}`
          : `${count} Tickets importiert (Daten ersetzt)`,
      )
      setRows([])
      setHeaders([])
      setFileName('')
      setMapping(EMPTY_MAPPING)
    } catch (err) {
      setError(
        err instanceof Error
          ? `Import fehlgeschlagen: ${err.message}`
          : 'Import fehlgeschlagen – Sync nicht erreichbar?',
      )
    }
  }

  function updatePeriod(patch: Partial<PeriodFilter>) {
    setPeriod((current) => ({ ...current, ...patch }))
  }

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h2>Bearbeitungszeit</h2>
          <p>
            Separater Import und Auswertung der durchschnittlichen
            Bearbeitungszeit (Erstellt → Gelöst) – unabhängig von Kunden &amp;
            SLA.
          </p>
        </div>
      </div>

      <section className="panel">
        <div className="panel-header">
          <h3>CSV Import (Bearbeitungszeit)</h3>
          {timeImports.length > 0 && (
            <span className="badge badge-muted">
              {timeTickets.length} Tickets · {timeImports.length} Import
              {timeImports.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <div className="panel-body stack">
          <div className="notice">
            Diese Daten fließen <strong>nicht</strong> in die SLA-Auswertung ein.
            Techniker aus der Stammdaten-Liste werden erkannt, alle anderen
            Namen bleiben als CSV-Wert erhalten.
          </div>

          <div
            className={`dropzone${dragActive ? ' active' : ''}`}
            onDragOver={(event) => {
              event.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
          >
            <FileUp size={28} />
            <h3>CSV hier ablegen</h3>
            <p>oder Datei auswählen</p>
            <div style={{ marginTop: 14 }}>
              <label className="btn btn-primary">
                Datei wählen
                <input
                  type="file" disabled={!canEdit}
                  accept=".csv,text/csv"
                  hidden
                  onChange={(event) =>
                    void handleFile(event.target.files?.[0])
                  }
                />
              </label>
            </div>
            {loading && <p style={{ marginTop: 10 }}>Datei wird gelesen…</p>}
            {fileName && (
              <p style={{ marginTop: 10 }}>
                Geladen: <strong>{fileName}</strong> · {rows.length} Zeilen
              </p>
            )}
          </div>

          {error && <div className="notice warn">{error}</div>}
          {success && (
            <div className="notice success">
              <CheckCircle2 size={16} style={{ verticalAlign: -3 }} /> {success}
            </div>
          )}

          {headers.length > 0 && (
            <>
              <div className="mapping-grid">
                {MAPPING_FIELDS.map((field) => (
                  <div className="field" key={field.key}>
                    <label htmlFor={`time-map-${field.key}`}>
                      {field.label}
                    </label>
                    <select
                      id={`time-map-${field.key}`}
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
                    <span className="metric-hint">{field.hint}</span>
                  </div>
                ))}
              </div>

              <div className="toolbar">
                <label className="field" style={{ flexDirection: 'row', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={append}
                    onChange={(event) => setAppend(event.target.checked)}
                  />
                  An bestehende Bearbeitungszeit-Daten anhängen
                </label>
                <div className="spacer" />
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => void clearTimeTickets()}
                  disabled={!timeTickets.length}
                >
                  Daten leeren
                </button>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => void runImport()}
                >
                  Import starten
                </button>
              </div>

              {previewRows.length > 0 && (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        {headers.slice(0, 6).map((header) => (
                          <th key={header}>{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, index) => (
                        <tr key={index}>
                          {headers.slice(0, 6).map((header) => (
                            <td key={header}>{row[header] || '—'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <section className="panel panel-body period-bar">
        <div className="toolbar" style={{ gap: 12 }}>
          <div className="field" style={{ minWidth: 120 }}>
            <label htmlFor="time-year">Jahr</label>
            <select
              id="time-year"
              value={period.year}
              onChange={(event) =>
                updatePeriod({ year: Number(event.target.value) })
              }
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ minWidth: 160 }}>
            <label htmlFor="time-mode">Zeitraum</label>
            <select
              id="time-mode"
              value={period.mode}
              onChange={(event) =>
                updatePeriod({ mode: event.target.value as PeriodMode })
              }
            >
              <option value="month">Monat</option>
              <option value="quarter">Quartal</option>
              <option value="half">Halbjahr</option>
              <option value="year">Jahr</option>
            </select>
          </div>
          {period.mode === 'month' && (
            <div className="field" style={{ minWidth: 160 }}>
              <label htmlFor="time-month">Monat</label>
              <select
                id="time-month"
                value={period.month}
                onChange={(event) =>
                  updatePeriod({ month: Number(event.target.value) })
                }
              >
                {MONTH_OPTIONS.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {period.mode === 'quarter' && (
            <div className="field" style={{ minWidth: 170 }}>
              <label htmlFor="time-quarter">Quartal</label>
              <select
                id="time-quarter"
                value={period.quarter}
                onChange={(event) =>
                  updatePeriod({
                    quarter: Number(event.target.value) as 1 | 2 | 3 | 4,
                  })
                }
              >
                {QUARTER_OPTIONS.map((quarter) => (
                  <option key={quarter.value} value={quarter.value}>
                    {quarter.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {period.mode === 'half' && (
            <div className="field" style={{ minWidth: 180 }}>
              <label htmlFor="time-half">Halbjahr</label>
              <select
                id="time-half"
                value={period.half}
                onChange={(event) =>
                  updatePeriod({
                    half: Number(event.target.value) as 1 | 2,
                  })
                }
              >
                <option value={1}>1. Halbjahr (Jan–Jun)</option>
                <option value={2}>2. Halbjahr (Jul–Dez)</option>
              </select>
            </div>
          )}
          <div className="spacer" />
          <span className="badge badge-muted">
            {periodLabel} · {visibleTickets.length} Tickets (Stammdaten-Techniker)
          </span>
        </div>
      </section>

      {!timeTickets.length ? (
        <div className="panel panel-body empty">
          Noch keine Bearbeitungszeit-Daten. CSV oben importieren.
        </div>
      ) : !visibleTickets.length ? (
        <div className="panel panel-body empty">
          Keine Tickets von Stammdaten-Technikern im Zeitraum {periodLabel}.
        </div>
      ) : (
        <>
          <div className="metrics">
            <div className="metric">
              <div className="metric-label">Tickets</div>
              <div className="metric-value">{stats.totalTickets}</div>
              <div className="metric-hint">{periodLabel}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Bewertbar</div>
              <div className="metric-value">{stats.evaluated}</div>
              <div className="metric-hint">mit Erstellt + Gelöst</div>
            </div>
            <div className="metric">
              <div className="metric-label">Ø Bearbeitungszeit</div>
              <div className="metric-value" style={{ fontSize: '1.45rem' }}>
                <Clock3
                  size={22}
                  style={{ verticalAlign: -3, marginRight: 6 }}
                />
                {formatMinutes(stats.avgHandlingMinutes)}
              </div>
              <div className="metric-hint">Erstellt → Gelöst (Kalenderzeit)</div>
            </div>
            <div className="metric">
              <div className="metric-label">Techniker</div>
              <div className="metric-value">{stats.byTechnician.length}</div>
              <div className="metric-hint">in dieser Auswahl</div>
            </div>
          </div>

          <section className="panel">
            <div className="panel-header">
              <h3>Durchschnitt je Techniker</h3>
              <span className="badge badge-muted">Zeile anklicken für Kunden</span>
            </div>
            <div className="table-wrap">
              <table className="data review-table">
                <thead>
                  <tr>
                    <th>Techniker</th>
                    <th>Tickets</th>
                    <th>Ø Bearbeitungszeit</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byTechnician.map((row) => {
                    const rowKey = `${row.technicianId ?? 'x'}-${row.technicianName}`
                    const expanded = expandedTechKey === rowKey
                    return (
                      <Fragment key={rowKey}>
                        <tr
                          className="tech-row-clickable"
                          onClick={() =>
                            setExpandedTechKey(expanded ? null : rowKey)
                          }
                        >
                          <td>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 8,
                              }}
                            >
                              {expanded ? (
                                <ChevronDown size={16} />
                              ) : (
                                <ChevronRight size={16} />
                              )}
                              <strong>{row.technicianName}</strong>
                            </span>
                            {!row.knownTechnician && (
                              <div>
                                <span className="badge badge-muted">
                                  nicht in Stammdaten
                                </span>
                              </div>
                            )}
                          </td>
                          <td>{row.total}</td>
                          <td>{formatMinutes(row.avgHandlingMinutes)}</td>
                        </tr>
                        {expanded && (
                          <tr className="tech-row-details">
                            <td colSpan={3}>
                              <div className="tech-customer-panel">
                                <div className="section-subtitle">
                                  Kunden von {row.technicianName}
                                </div>
                                {row.byCustomer.length ? (
                                  <table className="data">
                                    <thead>
                                      <tr>
                                        <th>Kunde / Service</th>
                                        <th>Tickets</th>
                                        <th>Ø Bearbeitungszeit</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {row.byCustomer.map((customer) => (
                                        <Fragment key={customer.customerName}>
                                          <tr className="tech-customer-row">
                                            <td>
                                              <strong>{customer.customerName}</strong>
                                            </td>
                                            <td>{customer.count}</td>
                                            <td>
                                              {formatMinutes(
                                                customer.avgHandlingMinutes,
                                              )}
                                            </td>
                                          </tr>
                                          {customer.byService.map((service) => (
                                            <tr
                                              key={`${customer.customerName}-${service.serviceName}`}
                                              className="tech-service-row"
                                            >
                                              <td>
                                                <span className="tech-service-label">
                                                  {service.serviceName}
                                                </span>
                                              </td>
                                              <td>{service.count}</td>
                                              <td>
                                                {formatMinutes(
                                                  service.avgHandlingMinutes,
                                                )}
                                              </td>
                                            </tr>
                                          ))}
                                        </Fragment>
                                      ))}
                                    </tbody>
                                  </table>
                                ) : (
                                  <div className="empty">Keine Kundendaten.</div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h3>Ticket-Details</h3>
              <span className="badge badge-muted">
                {detailRows.length} Tickets
              </span>
            </div>
            <div className="table-wrap">
              <table className="data review-table">
                <thead>
                  <tr>
                    <th>Techniker</th>
                    <th>Ticketnummer</th>
                    <th>Kunde</th>
                    <th>Service</th>
                    <th>Betreff</th>
                    <th>Erstellt</th>
                    <th>Gelöst</th>
                    <th>Dauer</th>
                  </tr>
                </thead>
                <tbody>
                  {detailRows.map((ticket) => (
                    <tr key={ticket.id}>
                      <td>{ticket.technicianName}</td>
                      <td>
                        <span className="mono">
                          {extractTicketNumber(ticket.externalId) || '—'}
                        </span>
                      </td>
                      <td>{ticket.customerKey || '—'}</td>
                      <td>{ticket.serviceKey || '—'}</td>
                      <td>{ticket.subject || '—'}</td>
                      <td>{formatTicketDate(ticket.createdAt)}</td>
                      <td>{formatTicketDate(ticket.resolvedAt)}</td>
                      <td>{formatMinutes(ticket.handlingMinutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
