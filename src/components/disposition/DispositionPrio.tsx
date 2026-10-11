"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatSlaType,
  rankDispositionTickets,
  TICKET_PRIO_LABELS,
  TICKET_WORK_KIND_LABELS,
  type RankedDispositionTicket,
  type TicketPrioLevel,
  type TicketWorkKind,
} from "@/lib/disposition/priority";
import {
  UNASSIGNED_TECH_ID,
  UNASSIGNED_TECH_NAME,
  isOpenTicket,
  kennzeichenTags,
  ticketDisplayTitle,
  type DispositionTicket,
} from "@/lib/disposition/types";
import { formatDisplayDate } from "@/lib/tracker";
import type { Customer } from "@/sla/types";
import { WorkKindSelect } from "./WorkKindSelect";
import { TicketNoteField } from "./TicketNoteField";

type Tech = { id: string; name: string; count: number };

const PRIO_DASHBOARD_ID = "__prio-dashboard__";

function formatIso(value: string | null | undefined): string {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return formatDisplayDate(value);
  return `${day}.${month}.${year}`;
}

function prioStats(ranked: RankedDispositionTicket[]) {
  const nbd = ranked.filter((item) => item.slaType === "NBD").length;
  const nbd2 = ranked.filter((item) => item.slaType === "2ND_NBD").length;
  const overdue = ranked.filter(
    (item) => item.level === "nbd-overdue" || item.level === "nbd2-overdue",
  ).length;
  return { nbd, nbd2, overdue, total: ranked.length, prio: nbd + nbd2 };
}

export function DispositionPrio({
  tickets,
  technicians,
  technicianId,
  onTechnicianId,
  onOpenTicket,
  canEdit,
  onWorkKind,
  onPlannerNote,
}: {
  tickets: DispositionTicket[];
  technicians: Tech[];
  technicianId: string;
  onTechnicianId: (id: string) => void;
  onOpenTicket: (id: string) => void;
  canEdit?: boolean;
  onWorkKind?: (id: string, workKindManual: TicketWorkKind | null) => void;
  onPlannerNote?: (id: string, plannerNote: string) => void;
}) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [onlyPrio, setOnlyPrio] = useState(false);
  const [showDashboard, setShowDashboard] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetch("/api/disposition/sla-customers", { credentials: "same-origin" })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as {
          customers?: Customer[];
          error?: string;
        } | null;
        if (!res.ok) {
          throw new Error(data?.error || "SLA-Kunden konnten nicht geladen werden.");
        }
        if (!cancelled) {
          setCustomers(Array.isArray(data?.customers) ? data.customers : []);
          setError("");
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "SLA-Kunden konnten nicht geladen werden.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const unassignedCount = useMemo(
    () => tickets.filter((item) => item.technicianId === UNASSIGNED_TECH_ID && isOpenTicket(item)).length,
    [tickets],
  );

  const tech =
    technicianId === UNASSIGNED_TECH_ID
      ? { id: UNASSIGNED_TECH_ID, name: UNASSIGNED_TECH_NAME, count: unassignedCount }
      : technicians.find((item) => item.id === technicianId) ?? technicians[0] ?? null;

  const allRanked = useMemo(
    () => rankDispositionTickets(tickets, customers),
    [customers, tickets],
  );

  const ranked = useMemo(
    () =>
      showDashboard
        ? allRanked
        : allRanked.filter((item) => item.ticket.technicianId === (tech?.id ?? "")),
    [allRanked, showDashboard, tech?.id],
  );

  const visible = useMemo(
    () => (showDashboard || onlyPrio ? ranked.filter((item) => item.isPrio) : ranked),
    [onlyPrio, ranked, showDashboard],
  );

  const stats = useMemo(() => prioStats(ranked), [ranked]);
  const dashStats = useMemo(() => prioStats(allRanked), [allRanked]);

  const techNameById = useMemo(() => {
    const map = new Map<string, string>(technicians.map((item) => [item.id, item.name]));
    map.set(UNASSIGNED_TECH_ID, UNASSIGNED_TECH_NAME);
    return map;
  }, [technicians]);

  const prioByTech = useMemo(() => {
    const counts = new Map<string, number>();
    const overdue = new Map<string, number>();
    for (const item of allRanked) {
      if (!item.isPrio) continue;
      const id = item.ticket.technicianId;
      counts.set(id, (counts.get(id) ?? 0) + 1);
      if (item.level === "nbd-overdue" || item.level === "nbd2-overdue") {
        overdue.set(id, (overdue.get(id) ?? 0) + 1);
      }
    }
    return { counts, overdue };
  }, [allRanked]);

  const techSummaries = useMemo(() => {
    const rows = technicians.map((item) => ({
      id: item.id,
      name: item.name,
      total: item.count,
      prio: prioByTech.counts.get(item.id) ?? 0,
      overdue: prioByTech.overdue.get(item.id) ?? 0,
    }));
    if (unassignedCount > 0) {
      rows.push({
        id: UNASSIGNED_TECH_ID,
        name: UNASSIGNED_TECH_NAME,
        total: unassignedCount,
        prio: prioByTech.counts.get(UNASSIGNED_TECH_ID) ?? 0,
        overdue: prioByTech.overdue.get(UNASSIGNED_TECH_ID) ?? 0,
      });
    }
    return rows.sort(
      (a, b) => b.prio - a.prio || b.total - a.total || a.name.localeCompare(b.name, "de"),
    );
  }, [prioByTech, technicians, unassignedCount]);

  function selectScope(id: string) {
    if (id === PRIO_DASHBOARD_ID) {
      setShowDashboard(true);
      return;
    }
    setShowDashboard(false);
    onTechnicianId(id);
  }

  if (!showDashboard && !tech) {
    return <p className="mv-empty">Kein Techniker ausgewählt.</p>;
  }

  return (
    <div className="disp-prio">
      <div className="disp-week-toolbar">
        <label className="disp-week-tech">
          <span>Ansicht</span>
          <select
            className="status-select"
            value={showDashboard ? PRIO_DASHBOARD_ID : tech?.id ?? ""}
            onChange={(event) => selectScope(event.target.value)}
            aria-label="Techniker für Priorisierung"
          >
            <option value={PRIO_DASHBOARD_ID}>
              Dashboard
              {dashStats.prio ? ` · ${dashStats.prio} Prio` : ""}
            </option>
            {technicians.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {prioByTech.counts.get(item.id) ? ` · ${prioByTech.counts.get(item.id)} Prio` : ""}
              </option>
            ))}
            {unassignedCount > 0 ? (
              <option value={UNASSIGNED_TECH_ID}>
                {UNASSIGNED_TECH_NAME}
                {prioByTech.counts.get(UNASSIGNED_TECH_ID)
                  ? ` · ${prioByTech.counts.get(UNASSIGNED_TECH_ID)} Prio`
                  : ""}
              </option>
            ) : null}
          </select>
          <small>
            {showDashboard
              ? `${dashStats.prio} Priotickets · ${dashStats.total} offene Tickets`
              : `${stats.total} offene Tickets · ${stats.prio} SLA-Prio`}
            {(showDashboard ? dashStats.overdue : stats.overdue)
              ? ` · ${showDashboard ? dashStats.overdue : stats.overdue} überfällig`
              : ""}
          </small>
        </label>
        {showDashboard ? null : (
          <label className="disp-prio-toggle">
            <input
              type="checkbox"
              checked={onlyPrio}
              onChange={(event) => setOnlyPrio(event.target.checked)}
            />
            Nur Priotickets
          </label>
        )}
      </div>

      <p className="smtp-hint">
        Priokunden kommen aus der Kundendatenbank der App SLA Auswertung
        {loading ? " – lade Kunden…" : ` (${customers.length} Kunden mit SLA-Typ)`}
        {error ? ` · ${error}` : ""}
        . Service und Zusammenfassung zählen mit: Störung vs. Umbau / Installation.
        DG-Druckerstörung sowie Volksbank / VR-Bank / Raiffeisen → DG Nexolution.
        Steht „DM“ im Kunden, ist es DM Tech. SLA-Typ (NBD / 2nd NBD) gilt nur bei Art
        Störung – Umbau / Installation sind nicht an die SLA gebunden. Farbe nach SLA:
        NBD vor 2nd NBD. Überfällig, wenn das SLA-Ziel ab Erstellt-am überschritten ist.
      </p>

      <div className="disp-prio-legend" aria-label="Farblegende">
        <span className="disp-prio-chip is-nbd-overdue">NBD überfällig</span>
        <span className="disp-prio-chip is-nbd2-overdue">2nd NBD überfällig</span>
        <span className="disp-prio-chip is-nbd">NBD</span>
        <span className="disp-prio-chip is-nbd2">2nd NBD</span>
        <span className="disp-prio-chip is-none">Kein SLA</span>
      </div>

      {showDashboard ? (
        <div className="disp-prio-dash">
          <h2>Alle Priotickets</h2>
          {visible.length === 0 ? (
            <p className="mv-empty">Keine Priotickets vorhanden.</p>
          ) : (
            <div className="tracker-table-wrap">
              <table className="tracker-table disp-prio-table">
                <thead>
                  <tr>
                    <th>Prio</th>
                    <th>Ticket</th>
                    <th>Techniker</th>
                    <th>Kunde</th>
                    <th>Art</th>
                    <th>Service</th>
                    <th>Kennzeichen</th>
                    <th>SLA</th>
                    <th>Erstellt am</th>
                    <th>Wunschtermin</th>
                    <th>Zieltermin</th>
                    <th>SLA-Ziel</th>
                    <th>Notiz</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((item) => (
                    <PrioRow
                      key={item.ticket.id}
                      item={item}
                      showTechnician
                      showNote
                      technicianName={
                        techNameById.get(item.ticket.technicianId) || item.ticket.technicianName
                      }
                      canEdit={Boolean(canEdit && onWorkKind)}
                      onWorkKind={onWorkKind}
                      onPlannerNote={onPlannerNote}
                      onOpen={onOpenTicket}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2>Techniker</h2>
          <div className="tracker-table-wrap">
            <table className="tracker-table disp-prio-tech-table">
              <thead>
                <tr>
                  <th>Techniker</th>
                  <th>Tickets gesamt</th>
                  <th>Priotickets</th>
                  <th>Überfällig</th>
                </tr>
              </thead>
              <tbody>
                {techSummaries.map((row) => (
                  <tr key={row.id} className={row.prio ? "has-prio" : undefined}>
                    <td>
                      <button
                        type="button"
                        className="disp-prio-open"
                        onClick={() => selectScope(row.id)}
                      >
                        {row.name}
                      </button>
                    </td>
                    <td>{row.total}</td>
                    <td>
                      <strong>{row.prio}</strong>
                    </td>
                    <td>{row.overdue || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <p className="mv-empty">
          {onlyPrio
            ? "Keine Priotickets für diesen Techniker."
            : "Keine offenen Import-Tickets für diesen Techniker."}
        </p>
      ) : (
        <div className="tracker-table-wrap">
          <table className="tracker-table disp-prio-table">
            <thead>
              <tr>
                <th>Prio</th>
                <th>Ticket</th>
                {tech?.id === UNASSIGNED_TECH_ID ? <th>Bearbeiter</th> : null}
                <th>Kunde</th>
                <th>Art</th>
                <th>Service</th>
                <th>Kennzeichen</th>
                <th>SLA</th>
                <th>Erstellt am</th>
                <th>Wunschtermin</th>
                <th>Zieltermin</th>
                <th>SLA-Ziel</th>
                <th>Notiz</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <PrioRow
                  key={item.ticket.id}
                  item={item}
                  showAssignee={tech?.id === UNASSIGNED_TECH_ID}
                  showNote
                  canEdit={Boolean(canEdit && onWorkKind)}
                  onWorkKind={onWorkKind}
                  onPlannerNote={onPlannerNote}
                  onOpen={onOpenTicket}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PrioRow({
  item,
  showAssignee,
  showTechnician,
  showNote,
  technicianName,
  canEdit,
  onWorkKind,
  onPlannerNote,
  onOpen,
}: {
  item: RankedDispositionTicket;
  showAssignee?: boolean;
  showTechnician?: boolean;
  showNote?: boolean;
  technicianName?: string;
  canEdit: boolean;
  onWorkKind?: (id: string, workKindManual: TicketWorkKind | null) => void;
  onPlannerNote?: (id: string, plannerNote: string) => void;
  onOpen: (id: string) => void;
}) {
  const { ticket, level } = item;
  const csvAssignee =
    ticket.technicianName.trim() && ticket.technicianName !== UNASSIGNED_TECH_NAME
      ? ticket.technicianName
      : "—";
  const tags = kennzeichenTags(ticket.kennzeichen);
  return (
    <tr className={`disp-prio-row is-${level}`}>
      <td>
        <span className={`disp-prio-chip is-${level}`}>{TICKET_PRIO_LABELS[level as TicketPrioLevel]}</span>
      </td>
      <td>
        <button type="button" className="disp-prio-open" onClick={() => onOpen(ticket.id)}>
          {ticketDisplayTitle(ticket)}
        </button>
      </td>
      {showTechnician ? (
        <td>
          <strong>{technicianName || ticket.technicianName || "—"}</strong>
          {ticket.technicianId === UNASSIGNED_TECH_ID && csvAssignee !== "—" ? (
            <small>{csvAssignee}</small>
          ) : null}
        </td>
      ) : null}
      {showAssignee ? <td>{csvAssignee}</td> : null}
      <td>
        <strong>{item.customer?.name || ticket.customer || ticket.street || "—"}</strong>
        {item.customer && ticket.customer && item.customer.name !== ticket.customer ? (
          <small>CSV: {ticket.customer}</small>
        ) : null}
      </td>
      <td>
        {canEdit && onWorkKind ? (
          <WorkKindSelect
            ticket={ticket}
            onChange={(workKindManual) => onWorkKind(ticket.id, workKindManual)}
          />
        ) : item.workKind !== "none" ? (
          <span className={`disp-work-chip is-${item.workKind}`}>{TICKET_WORK_KIND_LABELS[item.workKind]}</span>
        ) : (
          "—"
        )}
      </td>
      <td>
        {ticket.service ? <span className="disp-prio-service">{ticket.service}</span> : "—"}
      </td>
      <td>
        {tags.length ? (
          <div className="disp-kennzeichen">
            {tags.map((tag) => (
              <span key={tag} className="disp-kennzeichen-chip">
                {tag}
              </span>
            ))}
          </div>
        ) : (
          "—"
        )}
      </td>
      <td>{formatSlaType(item.slaType)}</td>
      <td>{formatIso(ticket.erstelltAm)}</td>
      <td>{formatIso(ticket.termin)}</td>
      <td>{formatIso(ticket.zieltermin)}</td>
      <td>{formatIso(item.slaDue)}</td>
      {showNote ? (
        <td>
          {canEdit && onPlannerNote ? (
            <TicketNoteField
              value={ticket.plannerNote}
              onSave={(plannerNote) => onPlannerNote(ticket.id, plannerNote)}
            />
          ) : ticket.plannerNote ? (
            ticket.plannerNote
          ) : (
            "—"
          )}
        </td>
      ) : null}
    </tr>
  );
}
