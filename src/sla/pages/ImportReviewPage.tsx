import { useMemo, useState } from 'react'
import Link from 'next/link'
import { extractTicketNumber } from '../lib/csv'
import { formatBusinessDays } from '../lib/businessDays'
import { formatSlaType } from '../lib/slaTypes'
import {
  explainCustomerMatch,
  explainTechnicianMatch,
} from '../lib/matchExplain'
import { useAppStore } from '../store/useAppStore'

type ReviewFilter = 'all' | 'customer-ok' | 'customer-miss' | 'technician' | 'partner'

export function ImportReviewPage() {
  const tickets = useAppStore((state) => state.tickets)
  const customers = useAppStore((state) => state.customers)
  const technicians = useAppStore((state) => state.technicians)
  const imports = useAppStore((state) => state.imports)

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ReviewFilter>('all')
  const [batchId, setBatchId] = useState('all')

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()

    return tickets
      .filter((ticket) => {
        if (batchId !== 'all' && ticket.importBatchId !== batchId) return false

        const customerExplain = explainCustomerMatch(ticket.customerKey, customers)
        const techExplain = explainTechnicianMatch(ticket.technicianKey, technicians)

        if (filter === 'customer-ok' && !ticket.customerId) return false
        if (filter === 'customer-miss' && ticket.customerId) return false
        if (filter === 'technician' && ticket.isPartner) return false
        if (filter === 'partner' && !ticket.isPartner) return false

        if (!q) return true
        const haystack = [
          ticket.externalId,
          ticket.customerKey,
          ticket.customerName ?? '',
          ticket.technicianKey,
          ticket.technicianName,
          customerExplain.reason,
          techExplain.reason,
          ticket.subject,
        ]
          .join(' ')
          .toLowerCase()
        return haystack.includes(q)
      })
      .map((ticket) => {
        const customerExplain = explainCustomerMatch(ticket.customerKey, customers)
        const techExplain = explainTechnicianMatch(ticket.technicianKey, technicians)
        const batch = imports.find((item) => item.id === ticket.importBatchId)

        let slaReason = 'Kein Kunden-SLA (kein Kundenmatch oder fehlende Daten).'
        if (ticket.slaType && ticket.businessDaysUsed != null) {
          const allowed = ticket.businessDaysAllowed ?? 0
          slaReason = ticket.slaMet
            ? `${formatBusinessDays(ticket.businessDaysUsed)} ≤ ${allowed} AT (${formatSlaType(ticket.slaType)}) → in SLA.`
            : `${formatBusinessDays(ticket.businessDaysUsed)} > ${allowed} AT (${formatSlaType(ticket.slaType)}) → außerhalb SLA.`
        } else if (ticket.slaType && ticket.resolvedAt == null) {
          slaReason = `Kunde hat ${formatSlaType(ticket.slaType)}, aber „Gelöst am“ fehlt → SLA nicht bewertbar.`
        } else if (ticket.customerId && ticket.createdAt == null) {
          slaReason = '„Erstellt am“ fehlt → Arbeitstage/SLA nicht berechenbar.'
        }

        return {
          ticket,
          batch,
          customerExplain,
          techExplain,
          slaReason,
          ticketNumber: extractTicketNumber(ticket.externalId),
        }
      })
  }, [tickets, customers, technicians, imports, query, filter, batchId])

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h2>Zuordnung</h2>
          <p>
            Nachvollziehbarkeit je Ticket: welcher CSV-Wert wohin gemappt wurde
            und warum (Kunde, Techniker/Partner, SLA).
          </p>
        </div>
        <Link className="btn btn-secondary" href="/sla/import">
          Zum CSV Import
        </Link>
      </div>

      {!tickets.length ? (
        <div className="panel panel-body empty">
          Noch keine importierten Tickets. Starte unter{' '}
          <Link href="/sla/import">CSV Import</Link>.
        </div>
      ) : (
        <>
          <section className="panel panel-body">
            <div className="toolbar">
              <input
                style={{ minWidth: 220 }}
                placeholder="Suche Ticket, Kunde, Bearbeiter, Grund…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value as ReviewFilter)}
              >
                <option value="all">Alle Zuordnungen</option>
                <option value="customer-ok">Kunde zugeordnet</option>
                <option value="customer-miss">Kunde ohne Match</option>
                <option value="technician">Eigene Techniker</option>
                <option value="partner">Partner</option>
              </select>
              <select
                value={batchId}
                onChange={(event) => setBatchId(event.target.value)}
              >
                <option value="all">Alle Imports</option>
                {imports.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.fileName} ·{' '}
                    {new Date(item.importedAt).toLocaleString('de-DE')}
                  </option>
                ))}
              </select>
              <span className="badge badge-muted">
                {rows.length} / {tickets.length}
              </span>
            </div>
          </section>

          <section className="panel">
            <div className="table-wrap">
              {!rows.length ? (
                <div className="empty">Keine Tickets für die aktuellen Filter.</div>
              ) : (
                <table className="data review-table">
                  <thead>
                    <tr>
                      <th>Ticketnummer</th>
                      <th>CSV Kunde → Zuordnung</th>
                      <th>CSV Bearbeiter → Zuordnung</th>
                      <th>SLA</th>
                      <th>Import</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(
                      ({
                        ticket,
                        batch,
                        customerExplain,
                        techExplain,
                        slaReason,
                        ticketNumber,
                      }) => (
                        <tr key={ticket.id}>
                          <td>
                            {ticketNumber ? (
                              <div className="mono">{ticketNumber}</div>
                            ) : (
                              <div className="metric-hint">keine Ticketnummer</div>
                            )}
                            {ticket.subject && (
                              <div className="metric-hint" title={ticket.subject}>
                                {ticket.subject.length > 36
                                  ? `${ticket.subject.slice(0, 34)}…`
                                  : ticket.subject}
                              </div>
                            )}
                          </td>
                          <td>
                            <div>
                              <span className="mono">
                                {ticket.customerKey || '—'}
                              </span>
                              {' → '}
                              {ticket.customerName ? (
                                <strong>{ticket.customerName}</strong>
                              ) : (
                                <span className="badge badge-warn">ohne Match</span>
                              )}
                            </div>
                            <div className="metric-hint">{customerExplain.reason}</div>
                            {ticket.slaType && (
                              <div className="metric-hint">
                                SLA-Typ Kunde: {formatSlaType(ticket.slaType)}
                              </div>
                            )}
                          </td>
                          <td>
                            <div>
                              <span className="mono">
                                {ticket.technicianKey || '—'}
                              </span>
                              {' → '}
                              {ticket.isPartner ? (
                                <span className="badge badge-warn">Partner</span>
                              ) : (
                                <strong>{ticket.technicianName}</strong>
                              )}
                            </div>
                            <div className="metric-hint">{techExplain.reason}</div>
                          </td>
                          <td>
                            {ticket.slaMet == null ? (
                              <span className="badge badge-muted">n/a</span>
                            ) : ticket.slaMet ? (
                              <span className="badge badge-ok">in SLA</span>
                            ) : (
                              <span className="badge badge-bad">außerhalb</span>
                            )}
                            <div className="metric-hint">{slaReason}</div>
                            <div className="metric-hint">
                              Erstellt: {ticket.createdAt || '—'}
                              <br />
                              Gelöst: {ticket.resolvedAt || '—'}
                            </div>
                          </td>
                          <td className="metric-hint">
                            {batch?.fileName ?? '—'}
                            <br />
                            {batch
                              ? new Date(batch.importedAt).toLocaleString('de-DE')
                              : ''}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
