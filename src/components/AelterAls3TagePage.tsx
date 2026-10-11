"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_AGE_THRESHOLD_DAYS,
  exportTicketAgeCsv,
} from "@/lib/auswertung/tickets-aelter-3-tage";
import {
  isActiveAelter3Ticket,
  type Aelter3TageStoredTicket,
} from "@/lib/auswertung/aelter-3-tage-types";
import { parseCsvFile } from "@/lib/csv";
import type { ImportedDataset } from "@/lib/types";
import { formatDisplayDate, toDateInputValue } from "@/lib/tracker";
import { formatSlaType } from "@/sla/lib/slaTypes";
import { Package } from "lucide-react";
import type { Aelter3TageMailTab } from "@/lib/auswertung/aelter-3-tage-mail-types";
import { Aelter3TageMailPanel } from "./Aelter3TageMailPanel";
import { useEditAccess } from "./EditAccessProvider";

type SortKey = "technician" | "ticketNo" | "ageWorkdays" | "customer";
type SortDir = "asc" | "desc";

type ViewTab =
  | "haupt"
  | "abgeschlossen"
  | "sla"
  | "zielOverdue"
  | "wunschOverdue"
  | "ersatzteile"
  | "umbau"
  | "termineFehlen";

const VIEW_TABS: { id: ViewTab; label: string }[] = [
  { id: "haupt", label: "Hauptansicht" },
  { id: "abgeschlossen", label: "Abgeschlossen" },
  { id: "sla", label: "SLA überfällig" },
  { id: "zielOverdue", label: "Zieltermin überfällig" },
  { id: "wunschOverdue", label: "Wunschtermin überfällig" },
  { id: "ersatzteile", label: "Ersatzteile angekommen" },
  { id: "umbau", label: "Umbauten / Installationen" },
  { id: "termineFehlen", label: "Wunsch- und Zieltermin fehlt" },
];

const MAIL_VIEW_TABS = new Set<Aelter3TageMailTab>(["zielOverdue", "ersatzteile", "termineFehlen"]);

function isMailViewTab(tab: ViewTab): tab is Aelter3TageMailTab {
  return MAIL_VIEW_TABS.has(tab as Aelter3TageMailTab);
}

function matchesViewTab(row: Aelter3TageStoredTicket, tab: ViewTab): boolean {
  switch (tab) {
    case "haupt":
      return isActiveAelter3Ticket(row);
    case "abgeschlossen":
      return row.listStatus === "abgeschlossen";
    case "sla":
      return isActiveAelter3Ticket(row) && row.slaOverdueWorkdays != null;
    case "zielOverdue":
      return isActiveAelter3Ticket(row) && row.zielterminOverdue;
    case "wunschOverdue":
      return isActiveAelter3Ticket(row) && row.wunschterminOverdue;
    case "ersatzteile":
      return isActiveAelter3Ticket(row) && row.ersatzteileAngekommen;
    case "umbau":
      return isActiveAelter3Ticket(row) && row.umzugUmbauInstallation;
    case "termineFehlen":
      return isActiveAelter3Ticket(row) && !row.hasZieltermin && !row.wunschtermin;
    default:
      return true;
  }
}

function sortTicketRows(
  rows: Aelter3TageStoredTicket[],
  sortKey: SortKey,
  sortDir: SortDir,
): Aelter3TageStoredTicket[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    let cmp = 0;
    if (sortKey === "technician") cmp = a.technician.localeCompare(b.technician, "de");
    else if (sortKey === "ticketNo") cmp = a.ticketNo.localeCompare(b.ticketNo, "de");
    else if (sortKey === "customer") cmp = a.customer.localeCompare(b.customer, "de");
    else cmp = a.ageWorkdays - b.ageWorkdays;
    if (cmp === 0) cmp = a.ticketNo.localeCompare(b.ticketNo, "de");
    return sortDir === "asc" ? cmp : -cmp;
  });
  return sorted;
}

type Summary = {
  total: number;
  older: number;
  withZieltermin: number;
  overdue: number;
  ersatzteile: number;
  lidl: number;
  umzug: number;
};

function downloadText(content: string, fileName: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function slaChipClass(slaType: Aelter3TageStoredTicket["slaType"]): string {
  if (slaType === "NBD") return "disp-prio-chip is-nbd";
  if (slaType === "2ND_NBD") return "disp-prio-chip is-nbd2";
  return "";
}

function rowAccentClass(row: Aelter3TageStoredTicket): string | undefined {
  if (row.hasZieltermin && !row.zielterminOverdue) {
    return "aelter-3-row is-ziel-ok";
  }
  if (row.slaOverdueWorkdays != null) {
    return "aelter-3-row is-sla-overdue";
  }
  if (row.wunschtermin) {
    return "aelter-3-row is-wunsch-only";
  }
  if (row.ersatzteileAngekommen) return "aelter-3-row is-kz-parts";
  if (row.lidlBerechnen) return "aelter-3-row is-kz-lidl";
  if (row.umzugUmbauInstallation) return "aelter-3-row is-kz-umbau";
  return undefined;
}

function rowAlertMark(row: Aelter3TageStoredTicket): string | null {
  if (row.zielterminOverdue) return "!!";
  if (row.wunschterminOverdue) return "!";
  return null;
}

type ImportPreviewAnalysis = {
  fileName: string;
  totalRows: number;
  parsedRows: number;
  skippedRows: number;
  skippedClosedRows: number;
  olderCount: number;
  withZielterminCount: number;
  overdueCount: number;
  ersatzteileCount: number;
  lidlCount: number;
  umzugCount: number;
  createdColumn: string | null;
  zielterminColumn: string | null;
  wunschterminColumn: string | null;
  kennzeichenColumn: string | null;
  lastActionColumn: string | null;
};

type PendingImport = {
  dataset: ImportedDataset;
  analysis: ImportPreviewAnalysis;
  stats: {
    added: number;
    removed: number;
    movedToAbgeschlossen: number;
    reactivated: number;
    updated: number;
    total: number;
    active: number;
    abgeschlossen: number;
    olderThanThreshold: number;
  };
  previousTotal: number;
};

function KennzeichenCell({ row }: { row: Aelter3TageStoredTicket }) {
  if (!row.kennzeichen) return <>—</>;
  const tags = row.kennzeichen.split(/[,;]/).map((item) => item.trim()).filter(Boolean);
  return (
    <div className="aelter-3-kennzeichen">
      {tags.map((tag) => {
        let cls = "aelter-3-kz-tag";
        const lower = tag.toLowerCase();
        if (/ersatzteil.*angekommen|ersatzteil.*eingetroffen/.test(lower)) cls += " is-parts";
        else if (/lidl\s*[-–]?\s*berechnen/.test(lower)) cls += " is-lidl";
        else if (/\b(umzug|umbau|installation)\b/i.test(tag)) cls += " is-umbau";
        return (
          <span key={tag} className={cls}>
            {tag}
          </span>
        );
      })}
    </div>
  );
}

export function AelterAls3TagePage() {
  const { canEdit } = useEditAccess();
  const today = useMemo(() => toDateInputValue(new Date()), []);
  const [referenceDate, setReferenceDate] = useState(today);
  const [tickets, setTickets] = useState<Aelter3TageStoredTicket[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [lastImportAt, setLastImportAt] = useState<string | null>(null);
  const [lastFileName, setLastFileName] = useState<string | null>(null);
  const [onlyOlder, setOnlyOlder] = useState(true);
  const [viewTab, setViewTab] = useState<ViewTab>("haupt");
  const [sortKey, setSortKey] = useState<SortKey>("technician");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const noteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const threshold = DEFAULT_AGE_THRESHOLD_DAYS;

  const baseRows = useMemo(() => {
    const rows = onlyOlder ? tickets.filter((row) => row.olderThanThreshold) : [...tickets];
    return sortTicketRows(rows, sortKey, sortDir);
  }, [tickets, onlyOlder, sortKey, sortDir]);

  const tabCounts = useMemo(() => {
    const counts = {} as Record<ViewTab, number>;
    for (const tab of VIEW_TABS) {
      counts[tab.id] = baseRows.filter((row) => matchesViewTab(row, tab.id)).length;
    }
    return counts;
  }, [baseRows]);

  const visibleRows = useMemo(() => {
    if (viewTab === "haupt") return baseRows;
    return baseRows.filter((row) => matchesViewTab(row, viewTab));
  }, [baseRows, viewTab]);

  const activeTabLabel = VIEW_TABS.find((tab) => tab.id === viewTab)?.label ?? "Hauptansicht";

  const loadState = useCallback(async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/auswertung/aelter-3-tage?referenceDate=${encodeURIComponent(date)}`, {
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        tickets?: Aelter3TageStoredTicket[];
        summary?: Summary;
        lastImportAt?: string | null;
        lastFileName?: string | null;
      } | null;
      if (!res.ok) throw new Error(data?.error ?? "Laden fehlgeschlagen.");
      setTickets(data?.tickets ?? []);
      setSummary(data?.summary ?? null);
      setLastImportAt(data?.lastImportAt ?? null);
      setLastFileName(data?.lastFileName ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Laden fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadState(referenceDate);
  }, [loadState, referenceDate]);

  async function requestImportPreview(dataset: ImportedDataset) {
    const res = await fetch("/api/auswertung/aelter-3-tage", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataset, referenceDate, save: false }),
    });
    const data = (await res.json().catch(() => null)) as {
      error?: string;
      preview?: boolean;
      analysis?: ImportPreviewAnalysis;
      stats?: PendingImport["stats"];
      previousTotal?: number;
    } | null;
    if (!res.ok) throw new Error(data?.error ?? "Import-Analyse fehlgeschlagen.");
    if (!data?.preview || !data.analysis || !data.stats) {
      throw new Error("Import-Analyse fehlgeschlagen.");
    }
    return {
      dataset,
      analysis: data.analysis,
      stats: data.stats,
      previousTotal: data.previousTotal ?? 0,
    };
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    if (!canEdit) {
      setError(
        "Import gesperrt: Bitte mit Bearbeitungsrecht anmelden oder in der Sidebar freischalten.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    setPendingImport(null);
    try {
      const imported = await parseCsvFile(files[0]);
      const preview = await requestImportPreview(imported);
      setPendingImport(preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import-Analyse fehlgeschlagen.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function confirmImport() {
    if (!pendingImport) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/auswertung/aelter-3-tage", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataset: pendingImport.dataset,
          referenceDate,
          save: true,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        tickets?: Aelter3TageStoredTicket[];
        summary?: Summary;
        stats?: PendingImport["stats"];
        lastImportAt?: string | null;
        lastFileName?: string | null;
      } | null;
      if (!res.ok) throw new Error(data?.error ?? "Import fehlgeschlagen.");
      setTickets(data?.tickets ?? []);
      setSummary(data?.summary ?? null);
      setLastImportAt(data?.lastImportAt ?? null);
      setLastFileName(data?.lastFileName ?? null);
      setPendingImport(null);
      const stats = data?.stats;
      if (stats) {
        const parts = [
          `${stats.active} aktiv`,
          stats.added ? `+${stats.added} neu` : null,
          stats.movedToAbgeschlossen ? `${stats.movedToAbgeschlossen} → Abgeschlossen` : null,
          stats.removed ? `${stats.removed} gelöscht` : null,
          stats.reactivated ? `${stats.reactivated} reaktiviert` : null,
          `${stats.olderThanThreshold} älter als ${threshold} AT`,
        ].filter(Boolean);
        setMessage(`Import gespeichert: ${parts.join(", ")}.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "ageWorkdays" ? "desc" : "asc");
    }
  }

  function scheduleNoteSave(ticketId: string, note: string) {
    const existing = noteTimers.current.get(ticketId);
    if (existing) clearTimeout(existing);
    noteTimers.current.set(
      ticketId,
      setTimeout(() => {
        void saveNote(ticketId, note);
      }, 500),
    );
  }

  async function saveNote(ticketId: string, note: string) {
    if (!canEdit) return;
    try {
      const res = await fetch("/api/auswertung/aelter-3-tage", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId, note, referenceDate }),
      });
      const data = (await res.json().catch(() => null)) as {
        ticket?: Aelter3TageStoredTicket;
      } | null;
      if (!res.ok || !data?.ticket) return;
      setTickets((prev) => prev.map((item) => (item.id === ticketId ? data.ticket! : item)));
    } catch {
      /* ignore */
    }
  }

  function onNoteChange(ticketId: string, note: string) {
    setTickets((prev) => prev.map((item) => (item.id === ticketId ? { ...item, note } : item)));
    scheduleNoteSave(ticketId, note);
  }

  function sortIndicator(key: SortKey): string {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  return (
    <div className="page-panel aelter-3-tage-page">
      <header className="section-header aelter-3-header">
        <div>
          <h1>Älter als 3 Tage</h1>
          <p>
            Gespeicherte Ticketliste · Import wird täglich abgeglichen · Alter und Überfälligkeit in
            Arbeitstagen
          </p>
        </div>
        <div className="toolbar-actions-row">
          <button
            type="button"
            className="btn btn-import"
            disabled={busy || loading}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? "Importiere…" : "CSV importieren"}
          </button>
          <input
            ref={fileRef}
            className="sr-only-date"
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={(event) => void handleFiles(event.target.files)}
          />
          <button
            type="button"
            className="btn btn-date"
            onClick={() => dateRef.current?.showPicker?.() ?? dateRef.current?.focus()}
          >
            Stichtag {formatDisplayDate(referenceDate)}
          </button>
          <input
            ref={dateRef}
            className="sr-only-date"
            type="date"
            value={referenceDate}
            onChange={(event) => setReferenceDate(event.target.value)}
            aria-label="Stichtag"
          />
          <label className="aelter-3-toggle">
            <input
              type="checkbox"
              checked={onlyOlder}
              onChange={(event) => setOnlyOlder(event.target.checked)}
            />
            Nur &gt; {threshold} AT
          </label>
          {tickets.length ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                downloadText(
                  exportTicketAgeCsv(visibleRows),
                  `tickets-aelter-${threshold}-at-${referenceDate}.csv`,
                )
              }
            >
              Export
            </button>
          ) : null}
        </div>
      </header>

      {error ? (
        <div className="error-banner" role="alert">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="success-banner" role="status">
          {message}
        </div>
      ) : null}

      {pendingImport ? (
        <section className="content-card aelter-3-import-preview" aria-labelledby="aelter-3-import-title">
          <h2 id="aelter-3-import-title">Import-Analyse: {pendingImport.analysis.fileName}</h2>
          <p>
            Stichtag {formatDisplayDate(referenceDate)} · bisher {pendingImport.previousTotal} gespeicherte
            Tickets
          </p>
          <div className="aelter-3-import-kpis">
            <article>
              <span>Zeilen CSV</span>
              <strong>{pendingImport.analysis.totalRows}</strong>
            </article>
            <article>
              <span>Auswertbar</span>
              <strong>{pendingImport.analysis.parsedRows}</strong>
            </article>
            <article>
              <span>Geschlossen übersprungen</span>
              <strong>{pendingImport.analysis.skippedClosedRows}</strong>
            </article>
            <article>
              <span>&gt; {threshold} AT</span>
              <strong>{pendingImport.analysis.olderCount}</strong>
            </article>
            <article>
              <span>Aktiv nach Import</span>
              <strong>{pendingImport.stats.active}</strong>
            </article>
            <article>
              <span>Abgeschlossen</span>
              <strong>{pendingImport.stats.abgeschlossen}</strong>
            </article>
            <article>
              <span>Neu / → Abgeschlossen / gelöscht</span>
              <strong>
                +{pendingImport.stats.added} / {pendingImport.stats.movedToAbgeschlossen} / −
                {pendingImport.stats.removed}
              </strong>
            </article>
          </div>
          <ul className="aelter-3-import-columns">
            <li>Erstellt: {pendingImport.analysis.createdColumn ?? "—"}</li>
            <li>Zieltermin: {pendingImport.analysis.zielterminColumn ?? "—"}</li>
            <li>Wunschtermin: {pendingImport.analysis.wunschterminColumn ?? "—"}</li>
            <li>Kennzeichen: {pendingImport.analysis.kennzeichenColumn ?? "—"}</li>
            <li>Letzte Aktion: {pendingImport.analysis.lastActionColumn ?? "—"}</li>
          </ul>
          <div className="aelter-3-import-actions">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void confirmImport()}>
              {busy ? "Importiere…" : "Import übernehmen"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => setPendingImport(null)}
            >
              Abbrechen
            </button>
          </div>
        </section>
      ) : null}

      {loading ? (
        <section className="content-card">
          <p>Lade Ticketliste…</p>
        </section>
      ) : tickets.length === 0 ? (
        <section className="content-card">
          <p>CSV importieren – Spalten u. a. Erstellt, Zieltermin, Wunschtermin, Kennzeichen, letzte Aktion.</p>
        </section>
      ) : (
        <section className="content-card aelter-3-table-card">
          <div className="aelter-3-subnav" role="tablist" aria-label="Ticket-Ansichten">
            {VIEW_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={viewTab === tab.id}
                className={viewTab === tab.id ? "is-active" : undefined}
                onClick={() => setViewTab(tab.id)}
              >
                {tab.label}
                <span className="aelter-3-tab-count">{tabCounts[tab.id]}</span>
              </button>
            ))}
          </div>
          {isMailViewTab(viewTab) ? (
            <Aelter3TageMailPanel
              tab={viewTab}
              referenceDate={referenceDate}
              onlyOlder={onlyOlder}
              canEdit={canEdit}
            />
          ) : null}
          <div className="content-card-head">
            <div>
              <h2>{activeTabLabel}</h2>
              <p>
                {visibleRows.length} Zeilen
                {viewTab !== "haupt" ? ` · gefiltert aus ${baseRows.length} in Hauptansicht` : ""}
                {lastFileName ? ` · ${lastFileName}` : ""}
                {lastImportAt ? ` · Import ${formatDisplayDate(lastImportAt.slice(0, 10))}` : ""}
                {summary && viewTab === "haupt" ? ` · ${summary.older} älter als ${threshold} AT` : ""}
                {viewTab === "abgeschlossen"
                  ? " · fehlen im CSV, werden beim nächsten Import ohne Eintrag gelöscht"
                  : ""}
              </p>
            </div>
          </div>
          <div className="aelter-3-table-scroll">
            <table className="data-table aelter-3-tage-table">
              <thead>
                <tr>
                  <th className="aelter-3-alert-col" aria-label="Hinweise" />
                  <th>Ticket</th>
                  <th>Erstellt</th>
                  <th>
                    <button type="button" className="aelter-3-sort" onClick={() => toggleSort("technician")}>
                      Bearbeiter{sortIndicator("technician")}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="aelter-3-sort" onClick={() => toggleSort("customer")}>
                      Kunde{sortIndicator("customer")}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="aelter-3-sort" onClick={() => toggleSort("ageWorkdays")}>
                      Alter (AT){sortIndicator("ageWorkdays")}
                    </button>
                  </th>
                  <th>Zieltermin</th>
                  <th>Wunschtermin</th>
                  <th>Überfällig Zieltermin (AT)</th>
                  <th>SLA überfällig seit (AT)</th>
                  <th>Kennzeichen</th>
                  <th className="aelter-3-action-col">Letzte Aktion</th>
                  <th>Notiz Serviceleitung</th>
                </tr>
              </thead>
              <tbody>
                {!visibleRows.length ? (
                  <tr>
                    <td colSpan={13} className="aelter-3-empty-tab">
                      Keine Tickets in dieser Ansicht
                      {viewTab !== "haupt" ? " (Filter „Nur > 3 AT“ beachten)." : "."}
                    </td>
                  </tr>
                ) : null}
                {visibleRows.map((row) => {
                  const alertMark = rowAlertMark(row);
                  return (
                  <tr key={row.id} className={rowAccentClass(row)}>
                    <td className="aelter-3-alert-col">
                      <div className="aelter-3-alert-cell">
                        {row.ersatzteileAngekommen ? (
                          <span className="aelter-3-pack-wrap" title="Ersatzteile angekommen">
                            <Package className="aelter-3-pack-icon" aria-hidden />
                            <span className="sr-only-date">Ersatzteile angekommen</span>
                          </span>
                        ) : null}
                        {alertMark ? (
                          <span
                            className="aelter-3-row-alert"
                            title={
                              alertMark === "!!"
                                ? "Zieltermin überschritten"
                                : "Wunschtermin überschritten (ohne Zieltermin)"
                            }
                            aria-label={
                              alertMark === "!!"
                                ? "Zieltermin überschritten"
                                : "Wunschtermin überschritten"
                            }
                          >
                            {alertMark}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>{row.ticketNo || "—"}</td>
                    <td>{formatDisplayDate(row.createdAt)}</td>
                    <td>{row.technician || "—"}</td>
                    <td>
                      {row.slaType ? (
                        <span className="aelter-3-customer-sla">
                          <span className={slaChipClass(row.slaType)}>{formatSlaType(row.slaType)}</span>
                          <span>{row.customer || "—"}</span>
                        </span>
                      ) : (
                        row.customer || "—"
                      )}
                    </td>
                    <td>{row.ageWorkdays} AT</td>
                    <td>{row.hasZieltermin ? formatDisplayDate(row.zieltermin!) : "—"}</td>
                    <td>{row.wunschtermin ? formatDisplayDate(row.wunschtermin) : "—"}</td>
                    <td>{row.overdueZielWorkdays != null ? `${row.overdueZielWorkdays} AT` : "—"}</td>
                    <td>{row.slaOverdueWorkdays != null ? `${row.slaOverdueWorkdays} AT` : "—"}</td>
                    <td>
                      <KennzeichenCell row={row} />
                    </td>
                    <td className="aelter-3-action">
                      {row.lastAction ? (
                        <div className="aelter-3-action-scroll" title={row.lastAction}>
                          {row.lastAction}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <input
                        type="text"
                        className="aelter-3-note-input"
                        value={row.note}
                        disabled={!canEdit}
                        placeholder="Notiz…"
                        onChange={(event) => onNoteChange(row.id, event.target.value)}
                      />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
