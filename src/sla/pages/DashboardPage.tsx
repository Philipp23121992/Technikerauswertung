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
import { formatPercent } from '../lib/dates'
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
import { computeStats } from '../lib/sla'
import { isVisibleInSlaTechnicianView } from '../lib/technicianVisibility'
import { useAppStore } from '../store/useAppStore'

export function DashboardPage() {
  const tickets = useAppStore((state) => state.tickets)
  const customers = useAppStore((state) => state.customers)
  const imports = useAppStore((state) => state.imports)

  const years = useMemo(() => availableYearsFromTickets(tickets), [tickets])
  const [period, setPeriod] = useState<PeriodFilter>(() =>
    defaultPeriodFilter(years),
  )
  const [customerId, setCustomerId] = useState('all')

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

  const technicianSummary = useMemo(() => {
    const rows = stats.byTechnician.filter((row) => !row.isPartner)
    const total = rows.reduce((sum, row) => sum + row.total, 0)
    const evaluated = rows.reduce((sum, row) => sum + row.evaluated, 0)
    const met = rows.reduce((sum, row) => sum + row.met, 0)
    const breached = rows.reduce((sum, row) => sum + row.breached, 0)
    return {
      total,
      metPercent: evaluated ? (met / evaluated) * 100 : null,
      breachedPercent: evaluated ? (breached / evaluated) * 100 : null,
    }
  }, [stats.byTechnician])

  const monthChart = stats.byMonth.map((item) => ({
    name: item.label.replace(/^\w/, (c) => c.toUpperCase()),
    Tickets: item.total,
  }))

  const ticketAssignments = useMemo(() => {
    return [...filteredTickets]
      .filter(isVisibleInSlaTechnicianView)
      .sort((a, b) => {
        const techCmp = a.technicianName.localeCompare(b.technicianName, 'de')
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
                </div>
                <div className="panel-body stack">
                  <div>
                    <h4 className="section-subtitle">Kunden</h4>
                    <div className="table-wrap">
                      {stats.byCustomer.length ? (
                        <table className="data">
                          <thead>
                            <tr>
                              <th>Kunde</th>
                              <th>Anzahl Tickets</th>
                              <th>% in SLA</th>
                              <th>% außerhalb SLA</th>
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
                                <td>{row.total}</td>
                                <td>
                                  <span className="badge badge-ok">
                                    {formatPercent(row.metPercent)}
                                  </span>
                                </td>
                                <td>
                                  <span className="badge badge-bad">
                                    {formatPercent(row.breachedPercent)}
                                  </span>
                                </td>
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
                      <table className="data">
                        <thead>
                          <tr>
                            <th>Bearbeiter</th>
                            <th>Anzahl Tickets</th>
                            <th>% in SLA</th>
                            <th>% außerhalb SLA</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>
                              Techniker
                              <div>
                                <span className="badge badge-ok">eigene</span>
                              </div>
                            </td>
                            <td>{technicianSummary.total}</td>
                            <td>
                              <span className="badge badge-ok">
                                {formatPercent(technicianSummary.metPercent)}
                              </span>
                            </td>
                            <td>
                              <span className="badge badge-bad">
                                {formatPercent(technicianSummary.breachedPercent)}
                              </span>
                            </td>
                          </tr>
                          <tr>
                            <td>
                              Partner
                              <div>
                                <span className="badge badge-warn">
                                  nicht zuordenbar
                                </span>
                              </div>
                            </td>
                            <td>{stats.partner.total}</td>
                            <td>
                              <span className="badge badge-ok">
                                {formatPercent(stats.partner.metPercent)}
                              </span>
                            </td>
                            <td>
                              <span className="badge badge-bad">
                                {formatPercent(stats.partner.breachedPercent)}
                              </span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </section>

              <section className="panel">
                <div className="panel-header">
                  <h3>Techniker → Tickets</h3>
                  <span className="badge badge-muted">
                    {customerLabel} · {ticketAssignments.length} Tickets
                  </span>
                </div>
                <div className="table-wrap">
                  {ticketAssignments.length ? (
                    <table className="data review-table">
                      <thead>
                        <tr>
                          <th>Techniker</th>
                          <th>Ticket</th>
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
                              {ticket.technicianName}
                              {ticket.isPartner && (
                                <div>
                                  <span className="badge badge-warn">Partner</span>
                                </div>
                              )}
                            </td>
                            <td>
                              <span className="mono">{ticket.externalId || '—'}</span>
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
