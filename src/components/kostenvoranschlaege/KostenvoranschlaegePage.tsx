"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditAccess } from "@/components/EditAccessProvider";
import { InvoiceImportDropzone } from "@/components/InvoiceImportDropzone";
import { KostenvoranschlaegeAssigneesPanel } from "@/components/kostenvoranschlaege/KostenvoranschlaegeAssigneesPanel";
import { type QuoteAssignee } from "@/lib/kostenvoranschlaege/assignees";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  QUOTE_FILE_KIND_LABELS,
  QUOTE_FILE_KINDS,
  QUOTE_STATUS_LABELS,
  QUOTE_STATUSES,
  createQuote,
  createQuoteUpdate,
  formatDateDe,
  formatDateTimeDe,
  formatFileSize,
  isQuoteExpired,
  type CostQuote,
  type OrderStatus,
  type QuoteFileKind,
  type QuoteStatus,
  type QuoteUpdate,
} from "@/lib/kostenvoranschlaege/types";

type Draft = {
  quoteNumber: string;
  processingNumber: string;
  quoteDate: string;
  validUntil: string;
  amount: string;
  currency: string;
  customer: string;
  contact: string;
  device: string;
  serialNumber: string;
  description: string;
  assignee: string;
  assigneeId: string;
  status: QuoteStatus;
  orderStatus: OrderStatus;
};

function toDraft(quote: CostQuote): Draft {
  return {
    quoteNumber: quote.quoteNumber,
    processingNumber: quote.processingNumber,
    quoteDate: quote.quoteDate ?? "",
    validUntil: quote.validUntil ?? "",
    amount: quote.amount,
    currency: quote.currency,
    customer: quote.customer,
    contact: quote.contact,
    device: quote.device,
    serialNumber: quote.serialNumber,
    description: quote.description,
    assignee: quote.assignee,
    assigneeId: quote.assigneeId,
    status: quote.status,
    orderStatus: quote.orderStatus,
  };
}

function emptyDraft(): Draft {
  return toDraft(createQuote());
}

type SortKey =
  | "processingNumber"
  | "quoteNumber"
  | "customer"
  | "assignee"
  | "validUntil"
  | "amount"
  | "status"
  | "orderStatus"
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

function sortValue(quote: CostQuote, key: SortKey): string | number {
  switch (key) {
    case "processingNumber":
      return quote.processingNumber;
    case "quoteNumber":
      return quote.quoteNumber;
    case "customer":
      return quote.customer;
    case "assignee":
      return quote.assignee;
    case "validUntil":
      return quote.validUntil ?? "";
    case "amount":
      return parseAmount(quote.amount);
    case "status":
      return QUOTE_STATUS_LABELS[quote.status];
    case "orderStatus":
      return ORDER_STATUS_LABELS[quote.orderStatus];
    case "files":
      return quote.attachments.length;
  }
}

function compareQuotes(a: CostQuote, b: CostQuote, key: SortKey, dir: SortDir): number {
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

export function KostenvoranschlaegePage() {
  const searchParams = useSearchParams();
  const { canEdit } = useEditAccess();
  const view = searchParams.get("view") === "zustaendige" ? "zustaendige" : "liste";
  const [quotes, setQuotes] = useState<CostQuote[]>([]);
  const [assignees, setAssignees] = useState<QuoteAssignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"alle" | QuoteStatus>("alle");
  const [orderFilter, setOrderFilter] = useState<"alle" | OrderStatus>("alle");
  const [sortKey, setSortKey] = useState<SortKey>("validUntil");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [createOpen, setCreateOpen] = useState(false);
  const [updateDraft, setUpdateDraft] = useState("");
  const [draftUpdates, setDraftUpdates] = useState<QuoteUpdate[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadKind, setUploadKind] = useState<QuoteFileKind>("kostenvoranschlag");

  const selected = quotes.find((item) => item.id === selectedId) ?? null;
  const editorUpdates = selected?.updates ?? draftUpdates;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/kostenvoranschlaege", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => null)) as {
        quotes?: CostQuote[];
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(data?.error || "Kostenvoranschläge konnten nicht geladen werden.");
      }
      setQuotes(Array.isArray(data?.quotes) ? data.quotes : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Laden fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAssignees = useCallback(async () => {
    try {
      const res = await fetch("/api/kostenvoranschlaege/assignees", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => null)) as {
        assignees?: QuoteAssignee[];
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(data?.error || "Zuständige konnten nicht geladen werden.");
      }
      setAssignees(Array.isArray(data?.assignees) ? data.assignees : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zuständige konnten nicht geladen werden.");
    }
  }, []);

  useEffect(() => {
    void load();
    void loadAssignees();
  }, [load, loadAssignees]);

  const persist = useCallback(
    async (next: CostQuote[]) => {
      if (!canEdit) return false;
      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/kostenvoranschlaege", {
          method: "PUT",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quotes: next }),
        });
        const data = (await res.json().catch(() => null)) as {
          quotes?: CostQuote[];
          error?: string;
        } | null;
        if (!res.ok) {
          throw new Error(data?.error || "Speichern fehlgeschlagen.");
        }
        setQuotes(Array.isArray(data?.quotes) ? data.quotes : next);
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

  const persistAssignees = useCallback(
    async (next: QuoteAssignee[]) => {
      if (!canEdit) return false;
      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/kostenvoranschlaege/assignees", {
          method: "PUT",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assignees: next }),
        });
        const data = (await res.json().catch(() => null)) as {
          assignees?: QuoteAssignee[];
          error?: string;
        } | null;
        if (!res.ok) {
          throw new Error(data?.error || "Zuständige konnten nicht gespeichert werden.");
        }
        setAssignees(Array.isArray(data?.assignees) ? data.assignees : next);
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
    const rows = quotes.filter((quote) => {
      if (statusFilter !== "alle" && quote.status !== statusFilter) return false;
      if (orderFilter !== "alle" && quote.orderStatus !== orderFilter) return false;
      if (!needle) return true;
      return (
        quote.processingNumber.toLowerCase().includes(needle) ||
        quote.quoteNumber.toLowerCase().includes(needle) ||
        quote.customer.toLowerCase().includes(needle) ||
        quote.assignee.toLowerCase().includes(needle) ||
        quote.device.toLowerCase().includes(needle) ||
        quote.serialNumber.toLowerCase().includes(needle) ||
        quote.description.toLowerCase().includes(needle)
      );
    });
    return [...rows].sort((a, b) => compareQuotes(a, b, sortKey, sortDir));
  }, [quotes, query, statusFilter, orderFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "validUntil" || key === "amount" || key === "files" ? "desc" : "asc");
  }

  function openCreate() {
    setCreateOpen(true);
    setSelectedId(null);
    setDraft(emptyDraft());
    setDraftUpdates([]);
    setUpdateDraft("");
    setMessage(null);
  }

  function openQuote(quote: CostQuote) {
    setCreateOpen(false);
    setSelectedId(quote.id);
    setDraft(toDraft(quote));
    setDraftUpdates([]);
    setUpdateDraft("");
    setMessage(null);
  }

  function closeMask() {
    setSelectedId(null);
    setCreateOpen(false);
  }

  async function changeStatus(quote: CostQuote, status: QuoteStatus) {
    if (!canEdit || quote.status === status) return;
    const now = new Date().toISOString();
    const next = quotes.map((item) =>
      item.id === quote.id ? { ...item, status, updatedAt: now } : item,
    );
    const ok = await persist(next);
    if (!ok) return;
    if (selectedId === quote.id) {
      setDraft((current) => ({ ...current, status }));
    }
    setMessage(`Status auf „${QUOTE_STATUS_LABELS[status]}“ gesetzt.`);
  }

  async function changeOrderStatus(quote: CostQuote, orderStatus: OrderStatus) {
    if (!canEdit || quote.orderStatus === orderStatus) return;
    const now = new Date().toISOString();
    const next = quotes.map((item) =>
      item.id === quote.id ? { ...item, orderStatus, updatedAt: now } : item,
    );
    const ok = await persist(next);
    if (!ok) return;
    if (selectedId === quote.id) {
      setDraft((current) => ({ ...current, orderStatus }));
    }
    setMessage(`Bestellung auf „${ORDER_STATUS_LABELS[orderStatus]}“ gesetzt.`);
  }

  async function changeAssignee(quote: CostQuote, assigneeId: string) {
    if (!canEdit || quote.assigneeId === assigneeId) return;
    const person = assignees.find((item) => item.id === assigneeId);
    const now = new Date().toISOString();
    const next = quotes.map((item) =>
      item.id === quote.id
        ? {
            ...item,
            assigneeId,
            assignee: person?.name ?? "",
            updatedAt: now,
          }
        : item,
    );
    const ok = await persist(next);
    if (!ok) return;
    if (selectedId === quote.id) {
      setDraft((current) => ({
        ...current,
        assigneeId,
        assignee: person?.name ?? "",
      }));
    }
    setMessage(
      assigneeId
        ? `Zuständigen auf „${person?.name ?? assigneeId}“ gesetzt.`
        : "Zuständigen entfernt.",
    );
  }

  async function saveDraft() {
    if (!canEdit) return;
    const payload: CostQuote = createOpen
      ? {
          ...createQuote(),
          ...draft,
          quoteDate: draft.quoteDate || null,
          validUntil: draft.validUntil || null,
          updates: draftUpdates,
        }
      : selected
        ? {
            ...selected,
            ...draft,
            quoteDate: draft.quoteDate || null,
            validUntil: draft.validUntil || null,
            updates: selected.updates,
            updatedAt: new Date().toISOString(),
          }
        : createQuote(draft);

    if (
      !payload.processingNumber.trim() &&
      !payload.quoteNumber.trim() &&
      !payload.customer.trim()
    ) {
      setError("Bitte mindestens Bearbeitungsnummer, KV-Nummer oder Kunde eintragen.");
      return;
    }

    const next = createOpen
      ? [payload, ...quotes]
      : quotes.map((item) => (item.id === payload.id ? payload : item));
    const ok = await persist(next);
    if (!ok) return;
    setCreateOpen(false);
    setSelectedId(payload.id);
    setDraft(toDraft(payload));
    setMessage("Kostenvoranschlag gespeichert.");
  }

  async function removeQuote(quote: CostQuote) {
    if (!canEdit) return;
    const label = quote.processingNumber || quote.quoteNumber || quote.id;
    if (!window.confirm(`Kostenvoranschlag ${label} löschen?`)) return;
    const ok = await persist(quotes.filter((item) => item.id !== quote.id));
    if (!ok) return;
    if (selectedId === quote.id) closeMask();
    setMessage("Kostenvoranschlag gelöscht.");
  }

  async function addUpdate() {
    if (!canEdit) return;
    const text = updateDraft.trim();
    if (!text) {
      setError("Update-Text ist erforderlich.");
      return;
    }
    const entry = createQuoteUpdate(text);
    if (!selected) {
      setDraftUpdates((current) => [entry, ...current]);
      setUpdateDraft("");
      setMessage("Update vorgemerkt – wird mit dem Kostenvoranschlag gespeichert.");
      return;
    }
    const now = new Date().toISOString();
    const next = quotes.map((quote) =>
      quote.id === selected.id
        ? {
            ...quote,
            ...draft,
            quoteDate: draft.quoteDate || null,
            validUntil: draft.validUntil || null,
            updates: [entry, ...(quote.updates ?? [])],
            updatedAt: now,
          }
        : quote,
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
      quotes.map((quote) =>
        quote.id === selected.id
          ? {
              ...quote,
              updates: (quote.updates ?? []).filter((entry) => entry.id !== updateId),
              updatedAt: now,
            }
          : quote,
      ),
    );
  }

  async function importFiles(files: File[]) {
    if (!files.length || !canEdit) return;
    setUploading(true);
    setError(null);
    setMessage(null);
    const notes: string[] = [];
    let lastQuote: CostQuote | null = null;
    let imported = 0;
    try {
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/kostenvoranschlaege/import", {
          method: "POST",
          credentials: "same-origin",
          body: form,
        });
        const data = (await res.json().catch(() => null)) as {
          quote?: CostQuote;
          quotes?: CostQuote[];
          merged?: boolean;
          warnings?: string[];
          error?: string;
        } | null;
        if (!res.ok) {
          throw new Error(data?.error || `Import von ${file.name} fehlgeschlagen.`);
        }
        if (Array.isArray(data?.quotes)) setQuotes(data.quotes);
        if (data?.quote) lastQuote = data.quote;
        imported += 1;
        if (data?.merged) notes.push(`${file.name}: bestehenden Eintrag aktualisiert.`);
        notes.push(...(data?.warnings?.filter(Boolean) ?? []));
      }
      if (lastQuote) openQuote(lastQuote);
      setMessage(
        [
          imported === 1
            ? "Kostenvoranschlag importiert."
            : `${imported} Kostenvoranschläge importiert.`,
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
        `/api/kostenvoranschlaege/${encodeURIComponent(selected.id)}/files`,
        { method: "POST", credentials: "same-origin", body: form },
      );
      const data = (await res.json().catch(() => null)) as {
        quote?: CostQuote;
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(data?.error || "Upload fehlgeschlagen.");
      }
      if (data?.quote) {
        setQuotes((current) =>
          current.map((item) => (item.id === data.quote!.id ? data.quote! : item)),
        );
        setDraft(toDraft(data.quote));
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
        `/api/kostenvoranschlaege/${encodeURIComponent(selected.id)}/files/${encodeURIComponent(fileId)}`,
        { method: "DELETE", credentials: "same-origin" },
      );
      const data = (await res.json().catch(() => null)) as {
        quote?: CostQuote;
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(data?.error || "Datei konnte nicht entfernt werden.");
      }
      if (data?.quote) {
        setQuotes((current) =>
          current.map((item) => (item.id === data.quote!.id ? data.quote! : item)),
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
          <h1>Kostenvoranschläge</h1>
          <p>
            Kostenvoranschläge anlegen, per Drag-and-Drop importieren und mit Dateien
            ablegen. Aus dem KV werden Ihre Referenz (2026-…), TVDAU-Nummer und Kunde
            oben links übernommen. Am Gültigkeitsdatum wird der ausgewählte Zuständige
            per Mail informiert.
          </p>
        </div>
        <div className="hp-header-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canEdit}
            onClick={openCreate}
          >
            + Neuer Kostenvoranschlag
          </button>
        </div>
      </header>

      <InvoiceImportDropzone
        busy={uploading}
        disabled={!canEdit}
        kicker="Import"
        title="Kostenvoranschlag hierher ziehen"
        description="PDF oder Bild ablegen. Ihre Referenz (2026-…), TVDAU-Nummer und Kunde oben links werden übernommen."
        onFiles={(files) => void importFiles(files)}
      />

      {error ? <p className="hp-banner is-error">{error}</p> : null}
      {message ? <p className="hp-banner is-ok">{message}</p> : null}

      {view === "zustaendige" ? (
        <KostenvoranschlaegeAssigneesPanel
          assignees={assignees}
          canEdit={canEdit}
          saving={saving}
          onSave={persistAssignees}
        />
      ) : null}

      {view === "liste" ? (
      <>
      <div className="hp-toolbar">
        <label className="hp-search">
          <span>Suche</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="z. B. 2026-…, TVDAU…, Kunde"
          />
        </label>
        <label>
          <span>Status</span>
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as "alle" | QuoteStatus)
            }
          >
            <option value="alle">Alle</option>
            {QUOTE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {QUOTE_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Bestellung</span>
          <select
            value={orderFilter}
            onChange={(event) =>
              setOrderFilter(event.target.value as "alle" | OrderStatus)
            }
          >
            <option value="alle">Alle</option>
            {ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {ORDER_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <p className="muted-meta">Lade Kostenvoranschläge…</p>
      ) : (
        <div className="content-card hp-table-wrap">
          <table className="hp-table">
            <thead>
              <tr>
                <SortHeader
                  label="Bearbeitungsnr."
                  column="processingNumber"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                <SortHeader
                  label="KV- / Auftragsnr."
                  column="quoteNumber"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                <SortHeader
                  label="Kunde"
                  column="customer"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                <SortHeader
                  label="Gültig bis"
                  column="validUntil"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                <SortHeader
                  label="Betrag"
                  column="amount"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                <SortHeader
                  label="Status"
                  column="status"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                <SortHeader
                  label="Bestellung"
                  column="orderStatus"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                <SortHeader
                  label="Zuständigen"
                  column="assignee"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                <SortHeader
                  label="Dateien"
                  column="files"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9}>Keine Kostenvoranschläge gefunden.</td>
                </tr>
              ) : (
                filtered.map((quote) => (
                  <tr
                    key={quote.id}
                    className={selectedId === quote.id ? "is-active" : undefined}
                    onClick={() => openQuote(quote)}
                  >
                    <td>
                      <strong>{quote.processingNumber || "Ohne Referenz"}</strong>
                    </td>
                    <td>{quote.quoteNumber || "—"}</td>
                    <td>{quote.customer || "—"}</td>
                    <td>
                      <span
                        className={isQuoteExpired(quote) ? "kv-date-expired" : undefined}
                      >
                        {formatDateDe(quote.validUntil)}
                      </span>
                    </td>
                    <td>
                      {quote.amount ? `${quote.amount} ${quote.currency}` : "—"}
                    </td>
                    <td
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <select
                        className={`hp-status-select is-compact status-${quote.status}`}
                        value={quote.status}
                        disabled={!canEdit || saving}
                        aria-label={`Status ${quote.processingNumber || "Kostenvoranschlag"}`}
                        onChange={(event) =>
                          void changeStatus(quote, event.target.value as QuoteStatus)
                        }
                      >
                        {QUOTE_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {QUOTE_STATUS_LABELS[status]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <select
                        className={`hp-status-select is-compact status-${quote.orderStatus}`}
                        value={quote.orderStatus}
                        disabled={!canEdit || saving}
                        aria-label={`Bestellung ${quote.processingNumber || "Kostenvoranschlag"}`}
                        onChange={(event) =>
                          void changeOrderStatus(
                            quote,
                            event.target.value as OrderStatus,
                          )
                        }
                      >
                        {ORDER_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {ORDER_STATUS_LABELS[status]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <select
                        className="hp-status-select is-compact"
                        value={quote.assigneeId}
                        disabled={!canEdit || saving}
                        aria-label={`Zuständigen ${quote.processingNumber || "Kostenvoranschlag"}`}
                        onChange={(event) =>
                          void changeAssignee(quote, event.target.value)
                        }
                      >
                        <option value="">Kein Zuständiger</option>
                        {assignees.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.name}
                          </option>
                        ))}
                        {quote.assigneeId &&
                        !assignees.some((person) => person.id === quote.assigneeId) ? (
                          <option value={quote.assigneeId}>
                            {quote.assignee || "Unbekannt"}
                          </option>
                        ) : null}
                      </select>
                    </td>
                    <td>{quote.attachments.length}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      </>
      ) : null}

      {maskOpen ? (
        <div className="aufgaben-modal-backdrop" role="presentation" onClick={closeMask}>
          <div
            className="aufgaben-modal hp-mask"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="aufgaben-modal-head">
              <h2>{createOpen ? "Neuer Kostenvoranschlag" : "Kostenvoranschlag"}</h2>
              <button type="button" className="btn btn-ghost" onClick={closeMask}>
                Schließen
              </button>
            </header>

            <div className="hp-mask-body">
              <label>
                <span>Bearbeitungsnummer</span>
                <input
                  value={draft.processingNumber}
                  disabled={!canEdit}
                  placeholder="2026-…"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      processingNumber: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>KV- / Auftragsnummer</span>
                <input
                  value={draft.quoteNumber}
                  disabled={!canEdit}
                  placeholder="TVDAU…"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      quoteNumber: event.target.value,
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
                      status: event.target.value as QuoteStatus,
                    }))
                  }
                >
                  {QUOTE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {QUOTE_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Bestellung</span>
                <select
                  value={draft.orderStatus}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      orderStatus: event.target.value as OrderStatus,
                    }))
                  }
                >
                  {ORDER_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {ORDER_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Angebotsdatum</span>
                <input
                  type="date"
                  value={draft.quoteDate}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      quoteDate: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>Gültigkeitsdatum</span>
                <input
                  type="date"
                  value={draft.validUntil}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      validUntil: event.target.value,
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
                <span>Kunde</span>
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
              <label>
                <span>Ansprechpartner</span>
                <input
                  value={draft.contact}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      contact: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>Gerät / Modell</span>
                <input
                  value={draft.device}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      device: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>Seriennummer</span>
                <input
                  value={draft.serialNumber}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      serialNumber: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>Zuständigen</span>
                <select
                  value={draft.assigneeId}
                  disabled={!canEdit}
                  onChange={(event) => {
                    const assigneeId = event.target.value;
                    const person = assignees.find((item) => item.id === assigneeId);
                    setDraft((current) => ({
                      ...current,
                      assigneeId,
                      assignee: person?.name ?? "",
                    }));
                  }}
                >
                  <option value="">Kein Zuständiger</option>
                  {assignees.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                      {person.email ? ` (${person.email})` : ""}
                    </option>
                  ))}
                  {draft.assigneeId &&
                  !assignees.some((person) => person.id === draft.assigneeId) ? (
                    <option value={draft.assigneeId}>
                      {draft.assignee || "Unbekannt"}
                    </option>
                  ) : null}
                </select>
              </label>
              <label className="full">
                <span>Betreff / Beschreibung</span>
                <input
                  value={draft.description}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      description: event.target.value,
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
                    placeholder="Update zum Kostenvoranschlag schreiben…"
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
                        setUploadKind(event.target.value as QuoteFileKind)
                      }
                    >
                      {QUOTE_FILE_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {QUOTE_FILE_KIND_LABELS[kind]}
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
                    <p className="muted-meta">Noch keine Dateien hinterlegt.</p>
                  ) : (
                    <ul className="projekt-file-list">
                      {selected.attachments.map((file) => (
                        <li key={file.id}>
                          <a
                            className="projekt-file-name"
                            href={`/api/kostenvoranschlaege/${encodeURIComponent(selected.id)}/files/${encodeURIComponent(file.id)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {QUOTE_FILE_KIND_LABELS[file.kind]} · {file.name}
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
                  onClick={() => void removeQuote(selected)}
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
