import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import Link from 'next/link'
import { ChevronDown, ChevronRight, Download } from 'lucide-react'
import { extractTicketNumber } from '../lib/csv'
import { formatPercent } from '../lib/dates'
import { downloadSlaStatsCsv } from '../lib/export'
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
import { computeStats, partnerDisplayName } from '../lib/sla'
import { useAppStore } from '../store/useAppStore'
import type { TechnicianVolumeStats, Ticket } from '../types'

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

function personRowKey(row: TechnicianVolumeStats): string {
  return row.isPartner
    ? `partner:${row.technicianName}`
    : `tech:${row.technicianId ?? row.technicianName}`
}

function ticketsForPerson(
  tickets: Ticket[],
  row: TechnicianVolumeStats,
): Ticket[] {
  return tickets.filter((ticket) => {
    if (row.isPartner) {
      return ticket.isPartner && partnerDisplayName(ticket) === row.technicianName
    }
    if (ticket.isPartner) return false
    if (row.technicianId && ticket.technicianId) {
      return ticket.technicianId === row.technicianId
    }
    return ticket.technicianName === row.technicianName
  })
}

function SlaCountCells({
  total,
  met,
  sameDay,
  breached,
  metPercent,
}: {
  total: number
  met: number
  sameDay: number
  breached: number
  metPercent: number | null
}) {
  return (
    <>
      <td>{total}</td>
      <td>
        <span className="badge badge-ok">{met}</span>
      </td>
      <td>{sameDay}</td>
      <td>
        <span className="badge badge-bad">{breached}</span>
      </td>
      <td>
        <span className="badge badge-ok">{formatPercent(metPercent)}</span>
      </td>
    </>
  )
}

function TicketDetailTable({ tickets }: { tickets: Ticket[] }) {
  if (!tickets.length) {
    return <div className="empty">Keine Tickets.</div>
  }

  return (
    <table className="data review-table">
      <thead>
        <tr>
          <th>Ticketnummer</th>
          <th>Kunde</th>
          <th>Betreff</th>
          <th>Erstellt</th>
          <th>Gelöst</th>
          <th>SLA</th>
        </tr>
      </thead>
      <tbody>
        {tickets.map((ticket) => (
          <tr key={ticket.id}>
            <td>
              <span className="mono">
                {extractTicketNumber(ticket.externalId) || '—'}
              </span>
            </td>
            <td>{ticket.customerName || ticket.customerKey || '—'}</td>
            <td>{ticket.subject || '—'}</td>
            <td>{formatTicketDate(ticket.createdAt)}</td>
            <td>{formatTicketDate(ticket.resolvedAt)}</td>
            <td>
              {ticket.slaMet === true ? (
                <span className="badge badge-ok">in SLA</span>
              ) : ticket.slaMet === false ? (
                <span className="badge badge-bad">außerhalb</span>
              ) : (
                <span className="badge badge-muted">n/a</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PersonRows({
  rows,
  tickets,
  expandedKey,
  onToggle,
  emptyLabel,
}: {
  rows: TechnicianVolumeStats[]
  tickets: Ticket[]
  expandedKey: string | null
  onToggle: (key: string) => void
  emptyLabel: string
}) {
  if (!rows.length) {
    return (
      <tr className="tech-sla-child">
        <td colSpan={6}>
          <div className="empty">{emptyLabel}</div>
        </td>
      </tr>
    )
  }

  return (
    <>
      {rows.map((row) => {
        const key = personRowKey(row)
        const expanded = expandedKey === key
        const personTickets = expanded ? ticketsForPerson(tickets, row) : []
        return (
          <PersonBlock
            key={key}
            row={row}
            expanded={expanded}
            tickets={personTickets}
            onToggle={() => onToggle(key)}
          />
        )
      })}
    </>
  )
}

function PersonBlock({
  row,
  expanded,
  tickets,
  onToggle,
}: {
  row: TechnicianVolumeStats
  expanded: boolean
  tickets: Ticket[]
  onToggle: () => void
}) {
  return (
    <>
      <tr
        className="tech-row-clickable tech-sla-child"
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onToggle()
          }
        }}
      >
        <td>
          <span className="tech-expand-label">
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <strong>{row.technicianName}</strong>
          </span>
          <div>
            <span className="badge badge-muted">
              {expanded ? 'Tickets ausblenden' : 'Tickets anzeigen'}
            </span>
          </div>
        </td>
        <SlaCountCells
          total={row.total}
          met={row.met}
          sameDay={row.sameDay}
          breached={row.breached}
          metPercent={row.metPercent}
        />
      </tr>
      {expanded ? (
        <tr className="tech-row-details">
          <td colSpan={6}>
            <div className="tech-customer-panel">
              <div className="section-subtitle">Tickets von {row.technicianName}</div>
              <TicketDetailTable tickets={tickets} />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  )
}

export function DashboardPage() {
  const tickets = useAppStore((state) => state.tickets)
  const customers = useAppStore((state) => state.customers)
  const imports = useAppStore((state) => state.imports)

  const years = useMemo(() => availableYearsFromTickets(tickets), [tickets])
  const [period, setPeriod] = useState<PeriodFilter>(() =>
    defaultPeriodFilter(years),
  )
  const [customerId, setCustomerId] = useState('all')
  const [techniciansExpanded, setTechniciansExpanded] = useState(false)
  const [partnersExpanded, setPartnersExpanded] = useState(false)
  const [expandedPersonKey, setExpandedPersonKey] = useState<string | null>(null)

  useEffect(() => {
    setPeriod((current) => {
      if (years.includes(current.year)) return current
      return { ...current, year: years[years.length - 1] ?? current.year }
    })
  }, [years])

  useEffect(() => {
    if (
      customerId !== 'all' &&
      customerId !== 'unmatched' &&
      !customers.some((customer) => customer.id === customerId)
    ) {
      setCustomerId('all')
    }
  }, [customers, customerId])

  const filteredTickets = useMemo(() => {
    const byPeriod = filterTicketsByPeriod(tickets, period)
    if (customerId === 'all') return byPeriod
    if (customerId === 'unmatched') {
      return byPeriod.filter((ticket) => !ticket.customerId)
    }
    return byPeriod.filter((ticket) => ticket.customerId === customerId)
  }, [tickets, period, customerId])

  const stats = useMemo(() => computeStats(filteredTickets), [filteredTickets])
  const periodLabel = formatPeriodLabel(period)
  const customerLabel =
    customerId === 'all'
      ? 'Alle Kunden'
      : customerId === 'unmatched'
        ? 'Ohne Kundenmatch'
        : (customers.find((customer) => customer.id === customerId)?.name ??
          'Kunde')

  const ownTechnicians = stats.byTechnician
  const partnerRows = stats.byPartner

  const technicianSummary = useMemo(() => {
    const total = ownTechnicians.reduce((sum, row) => sum + row.total, 0)
    const evaluated = ownTechnicians.reduce((sum, row) => sum + row.evaluated, 0)
    const met = ownTechnicians.reduce((sum, row) => sum + row.met, 0)
    const sameDay = ownTechnicians.reduce((sum, row) => sum + row.sameDay, 0)
    const breached = ownTechnicians.reduce((sum, row) => sum + row.breached, 0)
    return {
      total,
      met,
      sameDay,
      breached,
      metPercent: evaluated ? (met / evaluated) * 100 : null,
    }
  }, [ownTechnicians])

  const monthChart = stats.byMonth.map((item) => ({
    name: item.label.replace(/^\w/, (c) => c.toUpperCase()),
    Tickets: item.total,
  }))

  const ticketAssignments = useMemo(() => {
    return [...filteredTickets].sort((a, b) => {
      const groupCmp = Number(a.isPartner) - Number(b.isPartner)
      if (groupCmp !== 0) return groupCmp
      const nameA = a.isPartner ? partnerDisplayName(a) : a.technicianName
      const nameB = b.isPartner ? partnerDisplayName(b) : b.technicianName
      const techCmp = nameA.localeCompare(nameB, 'de')
      if (techCmp !== 0) return techCmp
      const resolvedA = a.resolvedAt ?? ''
      const resolvedB = b.resolvedAt ?? ''
      if (resolvedA !== resolvedB) return resolvedA.localeCompare(resolvedB)
      return a.externalId.localeCompare(b.externalId, 'de')
    })
  }, [filteredTickets])

  function updatePeriod(patch: Partial<PeriodFilter>) {
    setPeriod((current) => ({ ...current, ...patch }))
  }

  function togglePerson(key: string) {
    setExpandedPersonKey((current) => (current === key ? null : key))
  }

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h2>Auswertung</h2>
          <p>
            Kunden-SLA, Techniker-Volumen und Partner-SLA für den gewählten
            Zeitraum.
          </p>
        </div>
        <div className="toolbar">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!filteredTickets.length}
            onClick={() => downloadSlaStatsCsv(stats, period)}
          >
            <Download size={16} />
            Export
          </button>
          <Link className="btn btn-secondary" href="/sla/import">
            CSV importieren
          </Link>
        </div>
      </div>

      {!tickets.length ? (
        <div className="panel panel-body empty">
          Noch keine Auswertung. Lege Kunden und Techniker an, importiere danach
          eine CSV unter <Link href="/sla/import">CSV Import</Link>.
        </div>
      ) : (
        <>
          <section className="panel panel-body period-bar">
            <div className="toolbar" style={{ gap: 12 }}>
              <div className="field" style={{ minWidth: 120 }}>
                <label htmlFor="period-year">Jahr</label>
                <select
                  id="period-year"
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
                <label htmlFor="period-mode">Zeitraum</label>
                <select
                  id="period-mode"
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
                  <label htmlFor="period-month">Monat</label>
                  <select
                    id="period-month"
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
                  <label htmlFor="period-quarter">Quartal</label>
                  <select
                    id="period-quarter"
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
                  <label htmlFor="period-half">Halbjahr</label>
                  <select
                    id="period-half"
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

              <div className="field" style={{ minWidth: 200 }}>
                <label htmlFor="filter-customer">Kunde</label>
                <select
                  id="filter-customer"
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                >
                  <option value="all">Alle Kunden</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                  <option value="unmatched">Ohne Kundenmatch</option>
                </select>
              </div>

              <div className="spacer" />
              <span className="badge badge-muted">
                {periodLabel} · {customerLabel} · {filteredTickets.length} Tickets
              </span>
            </div>
          </section>

          {!filteredTickets.length ? (
            <div className="panel panel-body empty">
              Keine Tickets für {customerLabel} im Zeitraum {periodLabel}.
            </div>
          ) : (
            <>
              <div className="metrics">
                <div className="metric">
                  <div className="metric-label">Tickets erledigt</div>
                  <div className="metric-value">{stats.totalTickets}</div>
                  <div className="metric-hint">
                    {imports.length} Import{imports.length === 1 ? '' : 's'} ·{' '}
                    {periodLabel}
                  </div>
                </div>
                <div className="metric">
                  <div className="metric-label">Eigene Techniker</div>
                  <div className="metric-value">{stats.technicianMatched}</div>
                  <div className="metric-hint">über Techniker-Datenbank erkannt</div>
                </div>
                <div className="metric">
                  <div className="metric-label">Partner</div>
                  <div className="metric-value">{stats.partnerTickets}</div>
                  <div className="metric-hint">ohne Techniker-Match</div>
                </div>
                <div className="metric">
                  <div className="metric-label">SLA erreicht / gerissen</div>
                  <div className="metric-value">
                    <span style={{ color: 'var(--ok)' }}>
                      {formatPercent(stats.metPercent)}
                    </span>
                    <span style={{ color: 'var(--ink-soft)', fontSize: '1.1rem' }}>
                      {' '}
                      /{' '}
                    </span>
                    <span style={{ color: 'var(--danger)' }}>
                      {formatPercent(stats.breachedPercent)}
                    </span>
                  </div>
                  <div className="metric-hint">bezogen auf Kunden-SLA</div>
                </div>
              </div>

              {period.mode !== 'month' && (
                <div className="grid-2">
                  <section className="panel">
                    <div className="panel-header">
                      <h3>Tickets je Monat (Gelöst am)</h3>
                    </div>
                    <div className="panel-body">
                      {monthChart.length ? (
                        <div className="chart-box">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={monthChart}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                              <Tooltip />
                              <Bar
                                dataKey="Tickets"
                                fill="#c8102e"
                                radius={[4, 4, 0, 0]}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="empty">Keine Monatsdaten.</div>
                      )}
                    </div>
                  </section>

                  <section className="panel">
                    <div className="panel-header">
                      <h3>Monatsübersicht</h3>
                    </div>
                    <div className="table-wrap">
                      <table className="data">
                        <thead>
                          <tr>
                            <th>Monat</th>
                            <th>Erledigte Tickets</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.byMonth.map((row) => (
                            <tr key={row.monthKey}>
                              <td style={{ textTransform: 'capitalize' }}>
                                {row.label}
                              </td>
                              <td>{row.total}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              )}

              <section className="panel">
                <div className="panel-header">
                  <h3>SLA-Auswertung</h3>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => downloadSlaStatsCsv(stats, period)}
                  >
                    <Download size={16} />
                    CSV Export
                  </button>
                </div>
                <div className="panel-body stack">
                  <div>
                    <h4 className="section-subtitle">Kunden</h4>
                    <div className="table-wrap">
                      {stats.byCustomer.length ? (
                        <table className="data sla-wide">
                          <thead>
                            <tr>
                              <th>Kunde</th>
                              <th>Anzahl Tickets</th>
                              <th>Innerhalb SLA</th>
                              <th>Selber Tag</th>
                              <th>außerhalb SLA</th>
                              <th>SLA in %</th>
                            </tr>
                          </thead>
                          <tbody>
                            {stats.byCustomer.map((row) => (
                              <tr
                                key={`${row.customerId ?? 'x'}-${row.customerName}`}
                              >
                                <td>
                                  {row.customerName}
                                  {!row.customerId && (
                                    <div>
                                      <span className="badge badge-warn">
                                        ohne Match
                                      </span>
                                    </div>
                                  )}
                                </td>
                                <SlaCountCells
                                  total={row.total}
                                  met={row.met}
                                  sameDay={row.sameDay}
                                  breached={row.breached}
                                  metPercent={row.metPercent}
                                />
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="empty">Keine Kundendaten im Zeitraum.</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="section-subtitle">Techniker & Partner</h4>
                    <div className="table-wrap">
                      <table className="data sla-wide">
                        <thead>
                          <tr>
                            <th>Bearbeiter</th>
                            <th>Anzahl Tickets</th>
                            <th>Innerhalb SLA</th>
                            <th>Selber Tag</th>
                            <th>außerhalb SLA</th>
                            <th>SLA in %</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr
                            className="tech-row-clickable"
                            role="button"
                            tabIndex={0}
                            onClick={() =>
                              setTechniciansExpanded((open) => !open)
                            }
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                setTechniciansExpanded((open) => !open)
                              }
                            }}
                          >
                            <td>
                              <span className="tech-expand-label">
                                {techniciansExpanded ? (
                                  <ChevronDown size={16} />
                                ) : (
                                  <ChevronRight size={16} />
                                )}
                                <strong>Techniker</strong>
                              </span>
                              <div>
                                <span className="badge badge-ok">eigene</span>
                                <span className="badge badge-muted">
                                  {ownTechnicians.length} Techniker · anklicken
                                </span>
                              </div>
                            </td>
                            <SlaCountCells
                              total={technicianSummary.total}
                              met={technicianSummary.met}
                              sameDay={technicianSummary.sameDay}
                              breached={technicianSummary.breached}
                              metPercent={technicianSummary.metPercent}
                            />
                          </tr>
                          {techniciansExpanded ? (
                            <PersonRows
                              rows={ownTechnicians}
                              tickets={filteredTickets}
                              expandedKey={expandedPersonKey}
                              onToggle={togglePerson}
                              emptyLabel="Keine eigenen Techniker im Zeitraum."
                            />
                          ) : null}
                          <tr
                            className="tech-row-clickable"
                            role="button"
                            tabIndex={0}
                            onClick={() => setPartnersExpanded((open) => !open)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                setPartnersExpanded((open) => !open)
                              }
                            }}
                          >
                            <td>
                              <span className="tech-expand-label">
                                {partnersExpanded ? (
                                  <ChevronDown size={16} />
                                ) : (
                                  <ChevronRight size={16} />
                                )}
                                <strong>Partner</strong>
                              </span>
                              <div>
                                <span className="badge badge-warn">
                                  nicht zuordenbar
                                </span>
                                <span className="badge badge-muted">
                                  {partnerRows.length} Partner · anklicken
                                </span>
                              </div>
                            </td>
                            <SlaCountCells
                              total={stats.partner.total}
                              met={stats.partner.met}
                              sameDay={stats.partner.sameDay}
                              breached={stats.partner.breached}
                              metPercent={stats.partner.metPercent}
                            />
                          </tr>
                          {partnersExpanded ? (
                            <PersonRows
                              rows={partnerRows}
                              tickets={filteredTickets}
                              expandedKey={expandedPersonKey}
                              onToggle={togglePerson}
                              emptyLabel="Keine Partner-Tickets im Zeitraum."
                            />
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </section>

              <section className="panel">
                <div className="panel-header">
                  <h3>Techniker & Partner → Tickets</h3>
                  <span className="badge badge-muted">
                    {customerLabel} · {ticketAssignments.length} Tickets
                  </span>
                </div>
                <div className="table-wrap">
                  {ticketAssignments.length ? (
                    <table className="data review-table">
                      <thead>
                        <tr>
                          <th>Bearbeiter</th>
                          <th>Ticketnummer</th>
                          <th>Kunde</th>
                          <th>Betreff</th>
                          <th>Erstellt</th>
                          <th>Gelöst</th>
                          <th>SLA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ticketAssignments.map((ticket) => (
                          <tr key={ticket.id}>
                            <td>
                              {ticket.isPartner
                                ? partnerDisplayName(ticket)
                                : ticket.technicianName}
                              {ticket.isPartner && (
                                <div>
                                  <span className="badge badge-warn">Partner</span>
                                </div>
                              )}
                            </td>
                            <td>
                              <span className="mono">
                                {extractTicketNumber(ticket.externalId) || '—'}
                              </span>
                            </td>
                            <td>{ticket.customerName || ticket.customerKey || '—'}</td>
                            <td>{ticket.subject || '—'}</td>
                            <td>{formatTicketDate(ticket.createdAt)}</td>
                            <td>{formatTicketDate(ticket.resolvedAt)}</td>
                            <td>
                              {ticket.slaMet === true ? (
                                <span className="badge badge-ok">in SLA</span>
                              ) : ticket.slaMet === false ? (
                                <span className="badge badge-bad">außerhalb</span>
                              ) : (
                                <span className="badge badge-muted">n/a</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="empty">Keine Tickets in dieser Auswahl.</div>
                  )}
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  )
}
