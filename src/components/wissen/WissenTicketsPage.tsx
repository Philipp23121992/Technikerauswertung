"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useEditAccess } from "@/components/EditAccessProvider";
import { parseCsvFile } from "@/lib/csv";
import { buildWissenTicketsFromCsv } from "@/lib/wissen/ticket-import";

const IMPORT_CHUNK = 400;

async function readApiError(res: Response): Promise<string> {
  if (res.status === 413) {
    return "Die Datei ist zu groß für den direkten Upload. Bitte Seite neu laden – der Import liest die CSV jetzt lokal.";
  }
  const text = await res.text();
  try {
    const data = JSON.parse(text) as { error?: string };
    if (data.error) return data.error;
  } catch {
    /* HTML / leere Antwort */
  }
  return `Import fehlgeschlagen (HTTP ${res.status}).`;
}

type TicketStats = {
  tickets: number;
  errorCodes: number;
  partNumbers: number;
  models: number;
};

type KnowledgeTicket = {
  id: string;
  ticketNo: string;
  model: string;
  customer: string;
  summary: string;
  note: string;
  errorCodes: string[];
  partNumbers: string[];
  closed: boolean;
};

type ImportStats = {
  kept: number;
  neu: number;
  updated: number;
  skipped: number;
};

export function WissenTicketsPage() {
  const { canEdit } = useEditAccess();
  const fileRef = useRef<HTMLInputElement>(null);
  const [stats, setStats] = useState<TicketStats>({ tickets: 0, errorCodes: 0, partNumbers: 0, models: 0 });
  const [tickets, setTickets] = useState<KnowledgeTicket[]>([]);
  const [query, setQuery] = useState("");
  const [lastFile, setLastFile] = useState("");
  const [lastStats, setLastStats] = useState<ImportStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load(search = query) {
    const res = await fetch(`/api/wissen/tickets?q=${encodeURIComponent(search)}`, {
      credentials: "same-origin",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Tickets konnten nicht geladen werden.");
    setStats(data.stats ?? { tickets: 0, errorCodes: 0, partNumbers: 0, models: 0 });
    setTickets(Array.isArray(data.tickets) ? data.tickets : []);
    setLastFile(typeof data.lastImportFile === "string" ? data.lastImportFile : "");
    setLastStats(data.lastImportStats ?? null);
  }

  useEffect(() => {
    void load("").catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Tickets konnten nicht geladen werden.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onImport(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Bitte eine CSV-Datei auswählen.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setMessage("CSV wird gelesen…");
      const dataset = await parseCsvFile(file);
      const parsed = buildWissenTicketsFromCsv(dataset, file.name);
      if (!parsed.tickets.length) {
        setError("In der CSV wurden keine Tickets erkannt. Es braucht zumindest Ticketnummer, Beschreibung oder Notiz.");
        setMessage("");
        return;
      }

      let neu = 0;
      let updated = 0;
      const totalChunks = Math.max(1, Math.ceil(parsed.tickets.length / IMPORT_CHUNK));
      for (let index = 0; index < parsed.tickets.length; index += IMPORT_CHUNK) {
        const chunk = parsed.tickets.slice(index, index + IMPORT_CHUNK);
        const chunkNo = Math.floor(index / IMPORT_CHUNK) + 1;
        setMessage(`Sende Paket ${chunkNo} von ${totalChunks} (${parsed.tickets.length} Tickets)…`);
        const res = await fetch("/api/wissen/tickets", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            tickets: chunk,
            skippedRows: index === 0 ? parsed.skippedRows : 0,
            columns: {
              ticket: parsed.ticketColumn,
              model: parsed.modelColumn,
              summary: parsed.summaryColumn,
              note: parsed.noteColumn,
            },
          }),
        });
        if (!res.ok) {
          setError(await readApiError(res));
          setMessage("");
          return;
        }
        const data = (await res.json()) as { lastImportStats?: ImportStats };
        neu += data.lastImportStats?.neu ?? 0;
        updated += data.lastImportStats?.updated ?? 0;
      }

      if (fileRef.current) fileRef.current.value = "";
      setMessage(`Import fertig: ${parsed.tickets.length} Zeilen, ${neu} neu, ${updated} aktualisiert.`);
      await load(query);
    } catch (err) {
      setMessage("");
      setError(err instanceof Error ? err.message : "Import fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await load(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suche fehlgeschlagen.");
    }
  }

  async function removeTicket(id: string) {
    if (!canEdit) return;
    if (!window.confirm("Dieses Ticket aus dem Ticketwissen löschen?")) return;
    const res = await fetch(`/api/wissen/tickets?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Löschen fehlgeschlagen.");
      return;
    }
    await load(query);
  }

  async function clearAll() {
    if (!canEdit) return;
    if (!window.confirm("Alle importierten Alttickets wirklich löschen? Der Chatbot verliert dieses Wissen.")) {
      return;
    }
    const res = await fetch("/api/wissen/tickets?clear=1", {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Löschen fehlgeschlagen.");
      return;
    }
    setMessage("Ticketwissen geleert.");
    await load("");
  }

  return (
    <div className="page-panel">
      <header className="section-header">
        <div>
          <h1>Ticketwissen</h1>
          <p>
            Alte Tickets importieren. Der Chatbot erkennt daraus Fehlercodes, Maschinen und Ersatzteile – je mehr
            Tickets, desto klarer die Muster.
          </p>
        </div>
        <div className="wissen-stats">
          <span>{stats.tickets} Tickets</span>
          <span>{stats.errorCodes} Fehlercodes</span>
          <span>{stats.partNumbers} Ersatzteile</span>
          <span>{stats.models} Maschinen</span>
        </div>
      </header>

      <section className="content-card">
        <div className="content-card-head">
          <div>
            <h2>CSV importieren</h2>
            <p>
              CSV-Export (Semikolon, nicht .xlsx). Ticket-ID, Kunde, Status, Gelöst-am reichen – Fehlercodes und
              Ersatzteile werden aus dem Text erkannt. Große Dateien werden lokal gelesen.
            </p>
          </div>
        </div>
        <form className="wissen-ticket-upload" onSubmit={onImport}>
          <input ref={fileRef} type="file" accept=".csv,text/csv" disabled={!canEdit || busy} />
          <button type="submit" className="btn btn-primary" disabled={!canEdit || busy}>
            {busy ? "Importiere…" : "Tickets übernehmen"}
          </button>
          {stats.tickets > 0 ? (
            <button type="button" className="btn btn-secondary" disabled={!canEdit || busy} onClick={() => void clearAll()}>
              Alles leeren
            </button>
          ) : null}
        </form>
        {lastFile ? (
          <p className="muted-meta" style={{ marginTop: "0.75rem" }}>
            Letzter Import: {lastFile}
            {lastStats
              ? ` · ${lastStats.neu} neu, ${lastStats.updated} aktualisiert, ${lastStats.skipped} übersprungen`
              : ""}
          </p>
        ) : null}
        {error ? <p className="wissen-error">{error}</p> : null}
        {message ? <p className="wissen-ok">{message}</p> : null}
      </section>

      <section className="content-card" style={{ marginTop: "1rem" }}>
        <div className="content-card-head">
          <div>
            <h2>Importierte Tickets</h2>
            <p>Beispiel: Fehler 121.05 an CX725 mit 41X0253 – der Chatbot zählt das über alle Tickets.</p>
          </div>
        </div>
        <form className="wissen-ticket-search" onSubmit={onSearch}>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Fehler, Maschine, Teilenummer oder Ticket suchen…"
          />
          <button type="submit" className="btn btn-secondary">
            Suchen
          </button>
        </form>
        {tickets.length === 0 ? (
          <p className="wissen-empty">Noch keine Alttickets importiert.</p>
        ) : (
          <div className="wissen-ticket-list">
            {tickets.map((ticket) => (
              <article key={ticket.id} className="wissen-ticket-card">
                <div>
                  <h3>{ticket.ticketNo || "Ohne Nummer"}</h3>
                  <p>
                    {ticket.model ? `${ticket.model} · ` : ""}
                    {ticket.errorCodes.length ? `Fehler ${ticket.errorCodes.join(", ")} · ` : ""}
                    {ticket.partNumbers.length ? `Teile ${ticket.partNumbers.join(", ")}` : "keine Teile erkannt"}
                  </p>
                  {ticket.summary || ticket.note ? (
                    <p>{ticket.summary || ticket.note}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="btn btn-link-danger"
                  disabled={!canEdit}
                  onClick={() => void removeTicket(ticket.id)}
                >
                  Löschen
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
