"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditAccess } from "@/components/EditAccessProvider";
import { InvoiceImportDropzone } from "@/components/InvoiceImportDropzone";
import {
  buildInvoiceEvaluation,
  formatEuro,
  formatMonthDe,
  monthFromDate,
  type InvoiceEvalGroupBy,
} from "@/lib/partner-rechnungen/analytics";
import {
  INVOICE_FILE_KIND_LABELS,
  INVOICE_FILE_KINDS,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUSES,
  createInvoice,
  createInvoiceUpdate,
  formatDateDe,
  formatDateTimeDe,
  formatFileSize,
  type PartnerInvoice,
  type InvoiceFileKind,
  type InvoiceStatus,
  type InvoiceUpdate,
} from "@/lib/partner-rechnungen/types";

type Draft = {
  invoiceNumber: string;
  creditNoteNumber: string;
  invoiceDate: string;
  dueDate: string;
  amount: string;
  currency: string;
  vendor: string;
  customer: string;
  ticketNumber: string;
  assignee: string;
  billingMonth: string;
  status: InvoiceStatus;
};

function toDraft(invoice: PartnerInvoice): Draft {
  return {
    invoiceNumber: invoice.invoiceNumber,
    creditNoteNumber: invoice.creditNoteNumber,
    invoiceDate: invoice.invoiceDate ?? "",
    dueDate: invoice.dueDate ?? "",
    amount: invoice.amount,
    currency: invoice.currency,
    vendor: invoice.vendor,
    customer: invoice.customer,
    ticketNumber: invoice.ticketNumber,
    assignee: invoice.assignee,
    billingMonth: invoice.billingMonth,
    status: invoice.status,
  };
}

function emptyDraft(): Draft {
  return toDraft(createInvoice());
}

export function PartnerRechnungenPage() {
  const searchParams = useSearchParams();
  const { canEdit } = useEditAccess();
  const view = searchParams.get("view") === "auswertung" ? "auswertung" : "liste";
  const [invoices, setInvoices] = useState<PartnerInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"alle" | InvoiceStatus>("alle");
  const [monthFilter, setMonthFilter] = useState("alle");
  const [evalGroupBy, setEvalGroupBy] = useState<InvoiceEvalGroupBy>("vendor");
  const [evalMonth, setEvalMonth] = useState("alle");
  const [evalYear, setEvalYear] = useState("alle");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [createOpen, setCreateOpen] = useState(false);
  const [updateDraft, setUpdateDraft] = useState("");
  const [draftUpdates, setDraftUpdates] = useState<InvoiceUpdate[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadKind, setUploadKind] = useState<InvoiceFileKind>("rechnung");

  const selected = invoices.find((item) => item.id === selectedId) ?? null;
  const editorUpdates = selected?.updates ?? draftUpdates;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/partner-rechnungen", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => null)) as {
        invoices?: PartnerInvoice[];
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(data?.error || "Partner-Rechnungen konnten nicht geladen werden.");
      }
      setInvoices(Array.isArray(data?.invoices) ? data.invoices : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Laden fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = useCallback(
    async (next: PartnerInvoice[]) => {
      if (!canEdit) return false;
      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/partner-rechnungen", {
          method: "PUT",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoices: next }),
        });
        const data = (await res.json().catch(() => null)) as {
          invoices?: PartnerInvoice[];
          error?: string;
        } | null;
        if (!res.ok) {
          throw new Error(data?.error || "Speichern fehlgeschlagen.");
        }
        setInvoices(Array.isArray(data?.invoices) ? data.invoices : next);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [canEdit],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return invoices.filter((invoice) => {
      if (statusFilter !== "alle" && invoice.status !== statusFilter) return false;
      if (monthFilter !== "alle" && invoice.billingMonth !== monthFilter) return false;
      if (!needle) return true;
      return (
        invoice.invoiceNumber.toLowerCase().includes(needle) ||
        invoice.creditNoteNumber.toLowerCase().includes(needle) ||
        invoice.vendor.toLowerCase().includes(needle) ||
        invoice.assignee.toLowerCase().includes(needle) ||
        invoice.customer.toLowerCase().includes(needle)
      );
    });
  }, [invoices, query, statusFilter, monthFilter]);

  const months = useMemo(
    () =>
      [...new Set(invoices.map((item) => item.billingMonth).filter(Boolean))].sort((a, b) =>
        b.localeCompare(a),
      ),
    [invoices],
  );

  const evaluation = useMemo(
    () =>
      buildInvoiceEvaluation(invoices, {
        groupBy: evalGroupBy,
        month: evalMonth,
        year: evalYear,
      }),
    [invoices, evalGroupBy, evalMonth, evalYear],
  );

  function openCreate() {
    setCreateOpen(true);
    setSelectedId(null);
    setDraft(emptyDraft());
    setDraftUpdates([]);
    setUpdateDraft("");
    setMessage(null);
  }

  function openInvoice(invoice: PartnerInvoice) {
    setCreateOpen(false);
    setSelectedId(invoice.id);
    setDraft(toDraft(invoice));
    setDraftUpdates([]);
    setUpdateDraft("");
    setMessage(null);
  }

  function closeMask() {
    setSelectedId(null);
    setCreateOpen(false);
  }

  async function saveDraft() {
    if (!canEdit) return;
    const payload: PartnerInvoice = createOpen
      ? {
          ...createInvoice(),
          ...draft,
          invoiceDate: draft.invoiceDate || null,
          dueDate: draft.dueDate || null,
          updates: draftUpdates,
        }
      : selected
        ? {
            ...selected,
            ...draft,
            invoiceDate: draft.invoiceDate || null,
            dueDate: draft.dueDate || null,
            updates: selected.updates,
            updatedAt: new Date().toISOString(),
          }
        : createInvoice(draft);

    if (!payload.invoiceNumber.trim()) {
      setError("Bitte eine Rechnungsnummer eintragen.");
      return;
    }

    const next = createOpen
      ? [payload, ...invoices]
      : invoices.map((item) => (item.id === payload.id ? payload : item));
    const ok = await persist(next);
    if (!ok) return;
    setCreateOpen(false);
    setSelectedId(payload.id);
    setDraft(toDraft(payload));
    setMessage("Rechnung gespeichert.");
  }

  async function removeInvoice(invoice: PartnerInvoice) {
    if (!canEdit) return;
    if (!window.confirm(`Rechnung ${invoice.invoiceNumber || invoice.id} löschen?`)) return;
    const ok = await persist(invoices.filter((item) => item.id !== invoice.id));
    if (!ok) return;
    if (selectedId === invoice.id) closeMask();
    setMessage("Rechnung gelöscht.");
  }

  async function addUpdate() {
    if (!canEdit) return;
    const text = updateDraft.trim();
    if (!text) {
      setError("Update-Text ist erforderlich.");
      return;
    }
    const entry = createInvoiceUpdate(text);
    if (!selected) {
      setDraftUpdates((current) => [entry, ...current]);
      setUpdateDraft("");
      setMessage("Update vorgemerkt – wird mit der Rechnung gespeichert.");
      return;
    }
    const now = new Date().toISOString();
    const next = invoices.map((invoice) =>
      invoice.id === selected.id
        ? {
            ...invoice,
            ...draft,
            invoiceDate: draft.invoiceDate || null,
            dueDate: draft.dueDate || null,
            updates: [entry, ...(invoice.updates ?? [])],
            updatedAt: now,
          }
        : invoice,
    );
    const ok = await persist(next);
    if (ok) {
      setUpdateDraft("");
      setMessage("Update gespeichert.");
    }
  }

  async function removeUpdate(updateId: string) {
    if (!canEdit) return;
    if (!selected) {
      setDraftUpdates((current) => current.filter((entry) => entry.id !== updateId));
      return;
    }
    const now = new Date().toISOString();
    await persist(
      invoices.map((invoice) =>
        invoice.id === selected.id
          ? {
              ...invoice,
              updates: (invoice.updates ?? []).filter((entry) => entry.id !== updateId),
              updatedAt: now,
            }
          : invoice,
      ),
    );
  }

  async function importFiles(files: File[]) {
    if (!files.length || !canEdit) return;
    setUploading(true);
    setError(null);
    setMessage(null);
    const notes: string[] = [];
    let lastInvoice: PartnerInvoice | null = null;
    let imported = 0;
    try {
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/partner-rechnungen/import", {
          method: "POST",
          credentials: "same-origin",
          body: form,
        });
        const data = (await res.json().catch(() => null)) as {
          invoice?: PartnerInvoice;
          invoices?: PartnerInvoice[];
          merged?: boolean;
          warnings?: string[];
          error?: string;
        } | null;
        if (!res.ok) {
          throw new Error(data?.error || `Import von ${file.name} fehlgeschlagen.`);
        }
        if (Array.isArray(data?.invoices)) setInvoices(data.invoices);
        if (data?.invoice) lastInvoice = data.invoice;
        imported += 1;
        if (data?.merged) notes.push(`${file.name}: bestehende Rechnung aktualisiert.`);
        notes.push(...(data?.warnings?.filter(Boolean) ?? []));
      }
      if (lastInvoice) openInvoice(lastInvoice);
      setMessage(
        [
          imported === 1
            ? "Rechnung importiert."
            : `${imported} Rechnungen importiert.`,
          ...notes,
        ]
          .filter(Boolean)
          .join(" "),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import fehlgeschlagen.");
    } finally {
      setUploading(false);
    }
  }

  async function uploadFiles(fileList: FileList | null) {
    if (!selected || !fileList?.length || !canEdit) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("kind", uploadKind);
      for (const file of Array.from(fileList)) form.append("file", file);
      const res = await fetch(
        `/api/partner-rechnungen/${encodeURIComponent(selected.id)}/files`,
        { method: "POST", credentials: "same-origin", body: form },
      );
      const data = (await res.json().catch(() => null)) as {
        invoice?: PartnerInvoice;
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(data?.error || "Upload fehlgeschlagen.");
      }
      if (data?.invoice) {
        setInvoices((current) =>
          current.map((item) => (item.id === data.invoice!.id ? data.invoice! : item)),
        );
        setDraft(toDraft(data.invoice));
      }
      setMessage("Datei gespeichert.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload fehlgeschlagen.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function removeFile(fileId: string, fileName: string) {
    if (!selected || !canEdit) return;
    if (!window.confirm(`Datei „${fileName}“ entfernen?`)) return;
    setError(null);
    try {
      const res = await fetch(
        `/api/partner-rechnungen/${encodeURIComponent(selected.id)}/files/${encodeURIComponent(fileId)}`,
        { method: "DELETE", credentials: "same-origin" },
      );
      const data = (await res.json().catch(() => null)) as {
        invoice?: PartnerInvoice;
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(data?.error || "Datei konnte nicht entfernt werden.");
      }
      if (data?.invoice) {
        setInvoices((current) =>
          current.map((item) => (item.id === data.invoice!.id ? data.invoice! : item)),
        );
      }
      setMessage("Datei entfernt.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Datei konnte nicht entfernt werden.");
    }
  }

  const maskOpen = createOpen || Boolean(selected);

  return (
    <div className="page-panel hp-rechnungen-page">
      <header className="section-header">
        <div>
          <h1>Partner Rechnung</h1>
          <p>
            Rechnungen von Partnern anlegen, importieren und mit Originaldatei oder
            Gutschrift ablegen.
          </p>
        </div>
        <div className="hp-header-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canEdit}
            onClick={openCreate}
          >
            + Neue Rechnung
          </button>
        </div>
      </header>

      <InvoiceImportDropzone
        busy={uploading}
        disabled={!canEdit}
        onFiles={(files) => void importFiles(files)}
      />

      {error ? <p className="hp-banner is-error">{error}</p> : null}
      {message ? <p className="hp-banner is-ok">{message}</p> : null}

      {view === "liste" ? (
      <>
      <div className="hp-toolbar">
        <label className="hp-search">
          <span>Suche</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nummer, Lieferant, Bearbeiter…"
          />
        </label>
        <label>
          <span>Monat</span>
          <select
            value={monthFilter}
            onChange={(event) => setMonthFilter(event.target.value)}
          >
            <option value="alle">Alle Monate</option>
            {months.map((month) => (
              <option key={month} value={month}>
                {formatMonthDe(month)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as "alle" | InvoiceStatus)
            }
          >
            <option value="alle">Alle</option>
            {INVOICE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {INVOICE_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <p className="muted-meta">Lade Rechnungen…</p>
      ) : (
        <div className="content-card hp-table-wrap">
          <table className="hp-table">
            <thead>
              <tr>
                <th>Rechnungsnr.</th>
                <th>Gutschriftsnr.</th>
                <th>Datum</th>
                <th>Monat</th>
                <th>Kundenauftrag</th>
                <th>Bearbeiter</th>
                <th>Betrag</th>
                <th>Status</th>
                <th>Dateien</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9}>Keine Rechnungen gefunden.</td>
                </tr>
              ) : (
                filtered.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className={selectedId === invoice.id ? "is-active" : undefined}
                    onClick={() => openInvoice(invoice)}
                  >
                    <td>
                      <strong>{invoice.invoiceNumber || "Ohne Nummer"}</strong>
                    </td>
                    <td>{invoice.creditNoteNumber || "—"}</td>
                    <td>{formatDateDe(invoice.invoiceDate)}</td>
                    <td>{formatMonthDe(invoice.billingMonth)}</td>
                    <td>{invoice.ticketNumber || "—"}</td>
                    <td>{invoice.assignee || "—"}</td>
                    <td>
                      {invoice.amount
                        ? `${invoice.amount} ${invoice.currency}`
                        : "—"}
                    </td>
                    <td>
                      <span className={`hp-status status-${invoice.status}`}>
                        {INVOICE_STATUS_LABELS[invoice.status]}
                      </span>
                    </td>
                    <td>{invoice.attachments.length}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      </>
      ) : (
        <>
          <div className="hp-toolbar">
            <label>
              <span>Gruppieren nach</span>
              <select
                value={evalGroupBy}
                onChange={(event) =>
                  setEvalGroupBy(event.target.value as InvoiceEvalGroupBy)
                }
              >
                <option value="vendor">Lieferant</option>
                <option value="assignee">Bearbeiter</option>
              </select>
            </label>
            <label>
              <span>Jahr</span>
              <select
                value={evalYear}
                onChange={(event) => {
                  setEvalYear(event.target.value);
                  setEvalMonth("alle");
                }}
              >
                <option value="alle">Alle Jahre</option>
                {evaluation.years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Monat</span>
              <select
                value={evalMonth}
                onChange={(event) => setEvalMonth(event.target.value)}
              >
                <option value="alle">Alle Monate</option>
                {evaluation.months
                  .filter((month) => evalYear === "alle" || month.startsWith(evalYear))
                  .map((month) => (
                    <option key={month} value={month}>
                      {formatMonthDe(month)}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div className="hp-eval-kpis">
            <article className="content-card hp-eval-kpi">
              <span>Rechnungen</span>
              <strong>{evaluation.totalCount}</strong>
            </article>
            <article className="content-card hp-eval-kpi">
              <span>Gesamtbetrag</span>
              <strong>{formatEuro(evaluation.totalAmount)}</strong>
            </article>
          </div>
          <div className="content-card hp-table-wrap">
            <table className="hp-table">
              <thead>
                <tr>
                  <th>{evalGroupBy === "assignee" ? "Bearbeiter" : "Lieferant"}</th>
                  <th>Monat</th>
                  <th>Anzahl</th>
                  <th>Betrag</th>
                </tr>
              </thead>
              <tbody>
                {evaluation.rows.length === 0 ? (
                  <tr>
                    <td colSpan={4}>Keine Rechnungen für die Auswertung.</td>
                  </tr>
                ) : (
                  evaluation.rows.map((row) => (
                    <tr key={`${row.who}-${row.month}`}>
                      <td>
                        <strong>{row.who}</strong>
                      </td>
                      <td>{formatMonthDe(row.month)}</td>
                      <td>{row.count}</td>
                      <td>{formatEuro(row.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {maskOpen ? (
        <div className="aufgaben-modal-backdrop" role="presentation" onClick={closeMask}>
          <div
            className="aufgaben-modal hp-mask"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="aufgaben-modal-head">
              <h2>{createOpen ? "Neue Partner-Rechnung" : "Partner-Rechnung"}</h2>
              <button type="button" className="btn btn-ghost" onClick={closeMask}>
                Schließen
              </button>
            </header>

            <div className="hp-mask-body">
              <label>
                <span>Rechnungsnummer</span>
                <input
                  value={draft.invoiceNumber}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      invoiceNumber: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>Gutschriftsnummer</span>
                <input
                  value={draft.creditNoteNumber}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      creditNoteNumber: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>Status</span>
                <select
                  value={draft.status}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      status: event.target.value as InvoiceStatus,
                    }))
                  }
                >
                  {INVOICE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {INVOICE_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Rechnungsdatum</span>
                <input
                  type="date"
                  value={draft.invoiceDate}
                  disabled={!canEdit}
                  onChange={(event) => {
                    const invoiceDate = event.target.value;
                    setDraft((current) => ({
                      ...current,
                      invoiceDate,
                      billingMonth:
                        current.billingMonth &&
                        current.billingMonth !== monthFromDate(current.invoiceDate)
                          ? current.billingMonth
                          : monthFromDate(invoiceDate || null),
                    }));
                  }}
                />
              </label>
              <label>
                <span>Abrechnungsmonat</span>
                <input
                  type="month"
                  value={draft.billingMonth}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      billingMonth: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>Fällig</span>
                <input
                  type="date"
                  value={draft.dueDate}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      dueDate: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>Betrag</span>
                <input
                  value={draft.amount}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, amount: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>Währung</span>
                <input
                  value={draft.currency}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      currency: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>Kundenauftragsnummer</span>
                <input
                  value={draft.ticketNumber}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      ticketNumber: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>Bearbeiter</span>
                <input
                  value={draft.assignee}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      assignee: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>Lieferant</span>
                <input
                  value={draft.vendor}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, vendor: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>Kunde / Empfänger</span>
                <input
                  value={draft.customer}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      customer: event.target.value,
                    }))
                  }
                />
              </label>
              <section className="full aufgaben-updates">
                <div className="aufgaben-updates-head">
                  <h3>Updates</h3>
                  <span className="muted-meta">
                    {editorUpdates.length} Einträg
                    {editorUpdates.length === 1 ? "" : "e"}
                  </span>
                </div>
                <div className="aufgaben-update-compose">
                  <textarea
                    rows={3}
                    placeholder="Update zur Rechnung schreiben…"
                    value={updateDraft}
                    disabled={!canEdit || saving}
                    onChange={(event) => setUpdateDraft(event.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={!canEdit || saving || !updateDraft.trim()}
                    onClick={() => void addUpdate()}
                  >
                    {selected ? "Update speichern" : "Update vormerken"}
                  </button>
                </div>
                {editorUpdates.length === 0 ? (
                  <p className="muted-meta">Noch keine Updates.</p>
                ) : (
                  <ul className="aufgaben-update-list">
                    {editorUpdates.map((entry) => (
                      <li key={entry.id}>
                        <div className="aufgaben-update-meta">
                          <span>{formatDateTimeDe(entry.createdAt)}</span>
                        </div>
                        <p>{entry.text}</p>
                        {canEdit ? (
                          <button
                            type="button"
                            className="aufgaben-update-remove"
                            disabled={saving}
                            onClick={() => void removeUpdate(entry.id)}
                          >
                            Entfernen
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {selected ? (
                <section className="full hp-files">
                  <div className="projekt-updates-head">
                    <h3>Dateien</h3>
                    <span className="muted-meta">
                      {selected.attachments.length}{" "}
                      {selected.attachments.length === 1 ? "Anhang" : "Anhänge"}
                    </span>
                  </div>
                  <div className="hp-file-actions">
                    <select
                      value={uploadKind}
                      disabled={!canEdit || uploading}
                      onChange={(event) =>
                        setUploadKind(event.target.value as InvoiceFileKind)
                      }
                    >
                      {INVOICE_FILE_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {INVOICE_FILE_KIND_LABELS[kind]}
                        </option>
                      ))}
                    </select>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      hidden
                      onChange={(event) => void uploadFiles(event.target.files)}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={!canEdit || uploading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {uploading ? "Lade hoch…" : "Datei hochladen"}
                    </button>
                  </div>
                  {selected.attachments.length === 0 ? (
                    <p className="muted-meta">
                      Noch keine Originalrechnung oder Gutschrift hinterlegt.
                    </p>
                  ) : (
                    <ul className="projekt-file-list">
                      {selected.attachments.map((file) => (
                        <li key={file.id}>
                          <a
                            className="projekt-file-name"
                            href={`/api/partner-rechnungen/${encodeURIComponent(selected.id)}/files/${encodeURIComponent(file.id)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {INVOICE_FILE_KIND_LABELS[file.kind]} · {file.name}
                          </a>
                          <span className="muted-meta">
                            {formatFileSize(file.size)}
                            {file.uploadedBy ? ` · ${file.uploadedBy}` : ""}
                            {file.uploadedAt ? ` · ${formatDateTimeDe(file.uploadedAt)}` : ""}
                          </span>
                          {canEdit ? (
                            <button
                              type="button"
                              className="projekt-update-remove"
                              onClick={() => void removeFile(file.id, file.name)}
                            >
                              Entfernen
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ) : (
                <p className="muted-meta full">
                  Dateien können nach dem ersten Speichern angehängt werden.
                </p>
              )}
            </div>

            <footer className="aufgaben-modal-foot">
              {selected && !createOpen ? (
                <button
                  type="button"
                  className="btn btn-link-danger"
                  disabled={!canEdit || saving}
                  onClick={() => void removeInvoice(selected)}
                >
                  Löschen
                </button>
              ) : (
                <span />
              )}
              <div className="aufgaben-modal-foot-actions">
                <button type="button" className="btn btn-ghost" onClick={closeMask}>
                  Abbrechen
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!canEdit || saving}
                  onClick={() => void saveDraft()}
                >
                  {saving ? "Speichern…" : "Speichern"}
                </button>
              </div>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
