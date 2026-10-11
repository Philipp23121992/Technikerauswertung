"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditAccess } from "@/components/EditAccessProvider";
import { InvoiceImportDropzone } from "@/components/InvoiceImportDropzone";
import {
  INVOICE_FILE_KIND_LABELS,
  INVOICE_FILE_KINDS,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUSES,
  REMINDER_RHYTHM_LABELS,
  REMINDER_RHYTHMS,
  createInvoice,
  createInvoiceUpdate,
  formatDateDe,
  formatDateTimeDe,
  formatFileSize,
  type HpInvoice,
  type InvoiceFileKind,
  type InvoiceStatus,
  type InvoiceUpdate,
  type ReminderRhythm,
} from "@/lib/hp-rechnungen/types";

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
  hpOrderNumber: string;
  assignee: string;
  reminderName: string;
  reminderEmail: string;
  reminderRhythm: ReminderRhythm;
  status: InvoiceStatus;
};

function toDraft(invoice: HpInvoice): Draft {
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
    hpOrderNumber: invoice.hpOrderNumber,
    assignee: invoice.assignee,
    reminderName: invoice.reminderName || invoice.assignee,
    reminderEmail: invoice.reminderEmail,
    reminderRhythm: invoice.reminderRhythm,
    status: invoice.status,
  };
}

function emptyDraft(): Draft {
  return toDraft(createInvoice());
}

type SortKey =
  | "invoiceNumber"
  | "hpOrderNumber"
  | "creditNoteNumber"
  | "invoiceDate"
  | "ticketNumber"
  | "assignee"
  | "amount"
  | "status"
  | "files";

type SortDir = "asc" | "desc";

function parseAmount(value: string): number {
  const raw = value.trim().replace(/\s/g, "").replace(/€/g, "");
  if (!raw) return Number.NEGATIVE_INFINITY;
  const normalized =
    raw.includes(",") && (raw.includes(".") || /,\d{1,2}$/.test(raw))
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : Number.NEGATIVE_INFINITY;
}

function compareText(a: string, b: string): number {
  const left = a.trim();
  const right = b.trim();
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.localeCompare(right, "de", { numeric: true, sensitivity: "base" });
}

function sortValue(invoice: HpInvoice, key: SortKey): string | number {
  switch (key) {
    case "invoiceNumber":
      return invoice.invoiceNumber;
    case "hpOrderNumber":
      return invoice.hpOrderNumber;
    case "creditNoteNumber":
      return invoice.creditNoteNumber;
    case "invoiceDate":
      return invoice.invoiceDate ?? "";
    case "ticketNumber":
      return invoice.ticketNumber;
    case "assignee":
      return invoice.assignee;
    case "amount":
      return parseAmount(invoice.amount);
    case "status":
      return INVOICE_STATUS_LABELS[invoice.status];
    case "files":
      return invoice.attachments.length;
  }
}

function compareInvoices(a: HpInvoice, b: HpInvoice, key: SortKey, dir: SortDir): number {
  const left = sortValue(a, key);
  const right = sortValue(b, key);
  const leftEmpty =
    typeof left === "number" ? left === Number.NEGATIVE_INFINITY : !String(left).trim();
  const rightEmpty =
    typeof right === "number" ? right === Number.NEGATIVE_INFINITY : !String(right).trim();
  if (leftEmpty || rightEmpty) {
    if (leftEmpty && rightEmpty) return b.createdAt.localeCompare(a.createdAt);
    return leftEmpty ? 1 : -1;
  }
  const result =
    typeof left === "number" && typeof right === "number"
      ? left === right
        ? 0
        : left < right
          ? -1
          : 1
      : compareText(String(left), String(right));
  if (result !== 0) return dir === "asc" ? result : -result;
  return b.createdAt.localeCompare(a.createdAt);
}

function SortHeader({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = sortKey === column;
  return (
    <th aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        className={`hp-sort ${active ? "is-active" : ""}`}
        onClick={() => onSort(column)}
      >
        {label}
        <span aria-hidden>{active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}</span>
      </button>
    </th>
  );
}

export function HpRechnungenPage() {
  const { canEdit } = useEditAccess();
  const [invoices, setInvoices] = useState<HpInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"alle" | InvoiceStatus>("alle");
  const [sortKey, setSortKey] = useState<SortKey>("invoiceDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
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
      const res = await fetch("/api/hp-rechnungen", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => null)) as {
        invoices?: HpInvoice[];
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(data?.error || "HP-Rechnungen konnten nicht geladen werden.");
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
    async (next: HpInvoice[]) => {
      if (!canEdit) return false;
      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/hp-rechnungen", {
          method: "PUT",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoices: next }),
        });
        const data = (await res.json().catch(() => null)) as {
          invoices?: HpInvoice[];
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
    const rows = invoices.filter((invoice) => {
      if (statusFilter !== "alle" && invoice.status !== statusFilter) return false;
      if (!needle) return true;
      return (
        invoice.invoiceNumber.toLowerCase().includes(needle) ||
        invoice.creditNoteNumber.toLowerCase().includes(needle) ||
        invoice.hpOrderNumber.toLowerCase().includes(needle) ||
        invoice.ticketNumber.toLowerCase().includes(needle)
      );
    });
    return [...rows].sort((a, b) => compareInvoices(a, b, sortKey, sortDir));
  }, [invoices, query, statusFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "invoiceDate" || key === "amount" || key === "files" ? "desc" : "asc");
  }

  function openCreate() {
    setCreateOpen(true);
    setSelectedId(null);
    setDraft(emptyDraft());
    setDraftUpdates([]);
    setUpdateDraft("");
    setMessage(null);
  }

  function openInvoice(invoice: HpInvoice) {
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

  async function changeStatus(invoice: HpInvoice, status: InvoiceStatus) {
    if (!canEdit || invoice.status === status) return;
    const now = new Date().toISOString();
    const next = invoices.map((item) =>
      item.id === invoice.id ? { ...item, status, updatedAt: now } : item,
    );
    const ok = await persist(next);
    if (!ok) return;
    if (selectedId === invoice.id) {
      setDraft((current) => ({ ...current, status }));
    }
    setMessage(`Status auf „${INVOICE_STATUS_LABELS[status]}“ gesetzt.`);
  }

  async function saveDraft() {
    if (!canEdit) return;
    const reminderChanged =
      selected &&
      (selected.reminderRhythm !== draft.reminderRhythm ||
        selected.reminderEmail !== draft.reminderEmail ||
        selected.reminderName !== draft.reminderName);
    const payload: HpInvoice = createOpen
      ? {
          ...createInvoice(),
          ...draft,
          invoiceDate: draft.invoiceDate || null,
          dueDate: draft.dueDate || null,
          reminderName: draft.reminderName.trim() || draft.assignee.trim(),
          lastReminderSentAt: null,
          updates: draftUpdates,
        }
      : selected
        ? {
            ...selected,
            ...draft,
            invoiceDate: draft.invoiceDate || null,
            dueDate: draft.dueDate || null,
            reminderName: draft.reminderName.trim() || draft.assignee.trim(),
            lastReminderSentAt: reminderChanged ? null : selected.lastReminderSentAt,
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

  async function removeInvoice(invoice: HpInvoice) {
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
    let lastInvoice: HpInvoice | null = null;
    let imported = 0;
    try {
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/hp-rechnungen/import", {
          method: "POST",
          credentials: "same-origin",
          body: form,
        });
        const data = (await res.json().catch(() => null)) as {
          invoice?: HpInvoice;
          invoices?: HpInvoice[];
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
        `/api/hp-rechnungen/${encodeURIComponent(selected.id)}/files`,
        { method: "POST", credentials: "same-origin", body: form },
      );
      const data = (await res.json().catch(() => null)) as {
        invoice?: HpInvoice;
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
        `/api/hp-rechnungen/${encodeURIComponent(selected.id)}/files/${encodeURIComponent(fileId)}`,
        { method: "DELETE", credentials: "same-origin" },
      );
      const data = (await res.json().catch(() => null)) as {
        invoice?: HpInvoice;
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
          <h1>HP Rechnungen</h1>
          <p>
            Rechnungen von HP anlegen, importieren und mit Originaldatei oder
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

      <div className="hp-toolbar">
        <label className="hp-search">
          <span>Suche Rechnungsnummer</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="z. B. 9000123456"
          />
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
                <SortHeader label="Rechnungsnr." column="invoiceNumber" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Bestellnr. HP" column="hpOrderNumber" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Gutschriftsnr." column="creditNoteNumber" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Datum" column="invoiceDate" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Kundenauftrag" column="ticketNumber" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Bearbeiter" column="assignee" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Betrag" column="amount" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Status" column="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Dateien" column="files" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
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
                    <td>{invoice.hpOrderNumber || "—"}</td>
                    <td>{invoice.creditNoteNumber || "—"}</td>
                    <td>{formatDateDe(invoice.invoiceDate)}</td>
                    <td>{invoice.ticketNumber || "—"}</td>
                    <td>{invoice.assignee || "—"}</td>
                    <td>
                      {invoice.amount
                        ? `${invoice.amount} ${invoice.currency}`
                        : "—"}
                    </td>
                    <td
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <select
                        className={`hp-status-select status-${invoice.status}`}
                        value={invoice.status}
                        disabled={!canEdit || saving}
                        aria-label={`Status ${invoice.invoiceNumber || "Rechnung"}`}
                        onChange={(event) =>
                          void changeStatus(
                            invoice,
                            event.target.value as InvoiceStatus,
                          )
                        }
                      >
                        {INVOICE_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {INVOICE_STATUS_LABELS[status]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{invoice.attachments.length}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
              <h2>{createOpen ? "Neue HP-Rechnung" : "HP-Rechnung"}</h2>
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
                <span>Bestellnummer HP</span>
                <input
                  value={draft.hpOrderNumber}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      hpOrderNumber: event.target.value,
                    }))
                  }
                  placeholder="OD…"
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
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      invoiceDate: event.target.value,
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
                      reminderName:
                        !current.reminderName || current.reminderName === current.assignee
                          ? event.target.value
                          : current.reminderName,
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
              <section className="full hp-reminder-box">
                <div className="aufgaben-updates-head">
                  <h3>Erinnerung</h3>
                  <span className="muted-meta">
                    {draft.reminderRhythm === "none"
                      ? "Kein Rhythmus"
                      : REMINDER_RHYTHM_LABELS[draft.reminderRhythm]}
                  </span>
                </div>
                <p className="muted-meta">
                  Der hinterlegte Zuständige erhält in diesem Rhythmus eine Mail zur
                  Rechnung. Die Adresse kann direkt stehen oder über den Namen aus der
                  Technikerverwaltung ermittelt werden.
                </p>
                <div className="hp-reminder-fields">
                  <label>
                    <span>Zuständig</span>
                    <input
                      value={draft.reminderName}
                      disabled={!canEdit}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          reminderName: event.target.value,
                        }))
                      }
                      placeholder="Name des Zuständigen"
                    />
                  </label>
                  <label>
                    <span>E-Mail</span>
                    <input
                      type="email"
                      value={draft.reminderEmail}
                      disabled={!canEdit}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          reminderEmail: event.target.value,
                        }))
                      }
                      placeholder="name@firma.de"
                    />
                  </label>
                  <label>
                    <span>Rhythmus</span>
                    <select
                      value={draft.reminderRhythm}
                      disabled={!canEdit}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          reminderRhythm: event.target.value as ReminderRhythm,
                        }))
                      }
                    >
                      {REMINDER_RHYTHMS.map((rhythm) => (
                        <option key={rhythm} value={rhythm}>
                          {REMINDER_RHYTHM_LABELS[rhythm]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {selected?.lastReminderSentAt ? (
                  <p className="muted-meta">
                    Letzte Erinnerung: {formatDateTimeDe(selected.lastReminderSentAt)}
                  </p>
                ) : draft.reminderRhythm !== "none" ? (
                  <p className="muted-meta">Noch keine Erinnerungsmail gesendet.</p>
                ) : null}
              </section>

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
                            href={`/api/hp-rechnungen/${encodeURIComponent(selected.id)}/files/${encodeURIComponent(file.id)}`}
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
