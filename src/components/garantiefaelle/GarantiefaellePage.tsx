"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useEditAccess } from "@/components/EditAccessProvider";
import {
  buildWarrantyAnalytics,
  exportCasesCsv,
  filterCasesByRange,
  type PeriodKind,
} from "@/lib/garantiefaelle/analytics";
import {
  analyzePartnerInvoiceRows,
  partnerImportToCases,
  type PartnerImportAnalysis,
} from "@/lib/garantiefaelle/csv-import";
import { buildWarrantyInsights } from "@/lib/garantiefaelle/insights";
import {
  createManufacturerPriceRule,
  createWarrantyCase,
  formatEuro,
  lookupManufacturerPrice,
  warrantyProfit,
  WARRANTY_CATEGORIES,
  type ManufacturerPriceRule,
  type WarrantyCase,
  type WarrantyCategory,
} from "@/lib/garantiefaelle/types";
import { parseCsvFile } from "@/lib/csv";

type TabId = "uebersicht" | "faelle" | "auswertung" | "import" | "preise";

type CaseDraft = {
  caseDate: string;
  manufacturer: string;
  partner: string;
  category: WarrantyCategory;
  reference: string;
  manufacturerAmount: string;
  partnerAmount: string;
  notes: string;
};

type PriceDraft = {
  manufacturer: string;
  category: WarrantyCategory;
  amount: string;
  validFrom: string;
  validTo: string;
};

function emptyCaseDraft(): CaseDraft {
  return {
    caseDate: new Date().toISOString().slice(0, 10),
    manufacturer: "",
    partner: "",
    category: "Sonstiges",
    reference: "",
    manufacturerAmount: "",
    partnerAmount: "",
    notes: "",
  };
}

function emptyPriceDraft(): PriceDraft {
  return {
    manufacturer: "",
    category: "Sonstiges",
    amount: "",
    validFrom: "",
    validTo: "",
  };
}

function downloadText(content: string, fileName: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function parseTab(raw: string | null): TabId {
  if (raw === "faelle" || raw === "auswertung" || raw === "import" || raw === "preise") return raw;
  return "uebersicht";
}

export function GarantiefaellePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { canEdit } = useEditAccess();
  const tab = parseTab(searchParams.get("view"));
  const setTab = useCallback(
    (next: TabId) => {
      const href = next === "uebersicht" ? "/garantiefaelle" : `/garantiefaelle?view=${next}`;
      router.replace(href, { scroll: false });
    },
    [router],
  );
  const [cases, setCases] = useState<WarrantyCase[]>([]);
  const [manufacturerPrices, setManufacturerPrices] = useState<ManufacturerPriceRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [periodKind, setPeriodKind] = useState<PeriodKind>("month");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterPartner, setFilterPartner] = useState("");
  const [filterManufacturer, setFilterManufacturer] = useState("");
  const [caseDraft, setCaseDraft] = useState<CaseDraft>(emptyCaseDraft);
  const [priceDraft, setPriceDraft] = useState<PriceDraft>(emptyPriceDraft);
  const [importAnalysis, setImportAnalysis] = useState<PartnerImportAnalysis | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const persist = useCallback(
    async (nextCases: WarrantyCase[], nextPrices: ManufacturerPriceRule[]) => {
      if (!canEdit) {
        setError("Schreibzugriff gesperrt.");
        return false;
      }
      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/garantiefaelle", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ cases: nextCases, manufacturerPrices: nextPrices }),
        });
        const data = (await res.json().catch(() => null)) as {
          cases?: WarrantyCase[];
          manufacturerPrices?: ManufacturerPriceRule[];
          error?: string;
        } | null;
        if (!res.ok) throw new Error(data?.error || "Speichern fehlgeschlagen.");
        setCases(Array.isArray(data?.cases) ? data.cases : nextCases);
        setManufacturerPrices(
          Array.isArray(data?.manufacturerPrices) ? data.manufacturerPrices : nextPrices,
        );
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/garantiefaelle", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => null)) as {
        cases?: WarrantyCase[];
        manufacturerPrices?: ManufacturerPriceRule[];
        error?: string;
      } | null;
      if (!res.ok) throw new Error(data?.error || "Laden fehlgeschlagen.");
      setCases(Array.isArray(data?.cases) ? data.cases : []);
      setManufacturerPrices(Array.isArray(data?.manufacturerPrices) ? data.manufacturerPrices : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Laden fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredCases = useMemo(() => {
    let next = filterCasesByRange(cases, filterFrom || undefined, filterTo || undefined);
    if (filterPartner.trim()) {
      const needle = filterPartner.trim().toLowerCase();
      next = next.filter((item) => item.partner.toLowerCase().includes(needle));
    }
    if (filterManufacturer.trim()) {
      const needle = filterManufacturer.trim().toLowerCase();
      next = next.filter((item) => item.manufacturer.toLowerCase().includes(needle));
    }
    return [...next].sort((a, b) => b.caseDate.localeCompare(a.caseDate));
  }, [cases, filterFrom, filterTo, filterPartner, filterManufacturer]);

  const analytics = useMemo(
    () => buildWarrantyAnalytics(filteredCases, periodKind),
    [filteredCases, periodKind],
  );
  const insights = useMemo(() => buildWarrantyInsights(analytics), [analytics]);

  async function submitCase(event: React.FormEvent) {
    event.preventDefault();
    if (!caseDraft.manufacturer.trim() || !caseDraft.partner.trim()) {
      setError("Hersteller und Partner sind Pflicht.");
      return;
    }
    const entry = createWarrantyCase({
      caseDate: caseDraft.caseDate,
      manufacturer: caseDraft.manufacturer,
      partner: caseDraft.partner,
      category: caseDraft.category,
      reference: caseDraft.reference,
      manufacturerAmount: Number(caseDraft.manufacturerAmount || 0),
      partnerAmount: Number(caseDraft.partnerAmount || 0),
      notes: caseDraft.notes,
    });
    const ok = await persist([entry, ...cases], manufacturerPrices);
    if (ok) {
      setCaseDraft(emptyCaseDraft());
      setMessage("Garantiefall gespeichert.");
      setTab("faelle");
    }
  }

  async function submitPrice(event: React.FormEvent) {
    event.preventDefault();
    if (!priceDraft.manufacturer.trim() || !priceDraft.amount.trim()) {
      setError("Hersteller und Preis sind Pflicht.");
      return;
    }
    const entry = createManufacturerPriceRule({
      manufacturer: priceDraft.manufacturer,
      category: priceDraft.category,
      amount: Number(priceDraft.amount),
      validFrom: priceDraft.validFrom || null,
      validTo: priceDraft.validTo || null,
    });
    const ok = await persist(cases, [entry, ...manufacturerPrices]);
    if (ok) {
      setPriceDraft(emptyPriceDraft());
      setMessage("Herstellerpreis gespeichert.");
    }
  }

  async function removeCase(id: string) {
    const ok = await persist(
      cases.filter((item) => item.id !== id),
      manufacturerPrices,
    );
    if (ok) setMessage("Fall gelöscht.");
  }

  async function removePrice(id: string) {
    const ok = await persist(
      cases,
      manufacturerPrices.filter((item) => item.id !== id),
    );
    if (ok) setMessage("Herstellerpreis gelöscht.");
  }

  function applySuggestedManufacturerPrice() {
    const amount = lookupManufacturerPrice(
      manufacturerPrices,
      caseDraft.manufacturer,
      caseDraft.category,
      caseDraft.caseDate,
    );
    if (amount !== null) {
      setCaseDraft((current) => ({ ...current, manufacturerAmount: String(amount) }));
    }
  }

  async function handleImportFiles(files: FileList | null) {
    if (!canEdit || !files?.length) return;
    setImportBusy(true);
    setError(null);
    try {
      const file = files[0];
      const dataset = await parseCsvFile(file);
      const analysis = analyzePartnerInvoiceRows({
        fileName: dataset.fileName,
        headers: dataset.headers,
        rows: dataset.rows,
        manufacturerPrices,
        existingCases: cases,
      });
      setImportAnalysis(analysis);
      setTab("import");
    } catch (err) {
      setImportAnalysis(null);
      setError(err instanceof Error ? err.message : "Import-Analyse fehlgeschlagen.");
    } finally {
      setImportBusy(false);
      if (importRef.current) importRef.current.value = "";
    }
  }

  async function confirmImport() {
    if (!importAnalysis) return;
    const created = partnerImportToCases(importAnalysis.ready, importAnalysis.fileName, cases);
    if (created.length === 0) {
      setError("Keine neuen Fälle zum Importieren.");
      return;
    }
    const ok = await persist([...created, ...cases], manufacturerPrices);
    if (ok) {
      setImportAnalysis(null);
      setMessage(`${created.length} Garantiefälle importiert.`);
      setTab("faelle");
    }
  }

  if (loading) {
    return (
      <div className="page-panel">
        <div className="tracker-loading">Lade Garantiefälle…</div>
      </div>
    );
  }

  return (
    <div className="page-panel garantiefaelle-page">
      <header className="section-header garantiefaelle-header">
        <div>
          <h1>Garantiefälle</h1>
          <p>Einnahmen vom Hersteller vs. Ausgaben an Partner · Gewinn je Fall</p>
        </div>
        <div className="garantiefaelle-header-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              downloadText(exportCasesCsv(filteredCases), "garantiefaelle.csv", "text/csv")
            }
          >
            CSV Export
          </button>
          <button
            type="button"
            className="btn btn-import"
            disabled={!canEdit || importBusy}
            onClick={() => importRef.current?.click()}
          >
            {importBusy ? "Analysiere…" : "Rechnung importieren"}
          </button>
          <input
            ref={importRef}
            className="sr-only-date"
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={(event) => void handleImportFiles(event.target.files)}
          />
        </div>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}
      {message ? <div className="success-banner">{message}</div> : null}
      {saving ? <p className="garantiefaelle-saving">Speichere…</p> : null}

      {tab === "uebersicht" ? (
        <section className="garantiefaelle-stack">
          <div className="garantiefaelle-kpis">
            <article>
              <span>Fälle</span>
              <strong>{analytics.totalCount}</strong>
            </article>
            <article>
              <span>Einnahmen</span>
              <strong>{formatEuro(analytics.totalIncome)}</strong>
            </article>
            <article>
              <span>Ausgaben</span>
              <strong>{formatEuro(analytics.totalExpense)}</strong>
            </article>
            <article className={analytics.totalProfit >= 0 ? "is-positive" : "is-negative"}>
              <span>Gewinn</span>
              <strong>{formatEuro(analytics.totalProfit)}</strong>
            </article>
          </div>

          <div className="garantiefaelle-insights">
            {insights.map((item) => (
              <article key={item.id} className={`insight-card tone-${item.tone}`}>
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "faelle" ? (
        <section className="garantiefaelle-stack">
          <form className="content-card garantiefaelle-form" onSubmit={(event) => void submitCase(event)}>
            <h2>Neuer Garantiefall</h2>
            <div className="garantiefaelle-fields">
              <label>
                Datum
                <input
                  type="date"
                  value={caseDraft.caseDate}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setCaseDraft((current) => ({ ...current, caseDate: event.target.value }))
                  }
                />
              </label>
              <label>
                Hersteller
                <input
                  value={caseDraft.manufacturer}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setCaseDraft((current) => ({ ...current, manufacturer: event.target.value }))
                  }
                />
              </label>
              <label>
                Partner
                <input
                  value={caseDraft.partner}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setCaseDraft((current) => ({ ...current, partner: event.target.value }))
                  }
                />
              </label>
              <label>
                Kategorie
                <select
                  value={caseDraft.category}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setCaseDraft((current) => ({
                      ...current,
                      category: event.target.value as WarrantyCategory,
                    }))
                  }
                >
                  {WARRANTY_CATEGORIES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Referenz
                <input
                  value={caseDraft.reference}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setCaseDraft((current) => ({ ...current, reference: event.target.value }))
                  }
                />
              </label>
              <label>
                Einnahmen (Hersteller)
                <div className="garantiefaelle-inline-input">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={caseDraft.manufacturerAmount}
                    disabled={!canEdit}
                    onChange={(event) =>
                      setCaseDraft((current) => ({
                        ...current,
                        manufacturerAmount: event.target.value,
                      }))
                    }
                  />
                  <button type="button" className="btn btn-secondary" onClick={applySuggestedManufacturerPrice}>
                    Preis übernehmen
                  </button>
                </div>
              </label>
              <label>
                Ausgaben (Partner)
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={caseDraft.partnerAmount}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setCaseDraft((current) => ({ ...current, partnerAmount: event.target.value }))
                  }
                />
              </label>
              <label className="garantiefaelle-span-2">
                Notiz
                <input
                  value={caseDraft.notes}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setCaseDraft((current) => ({ ...current, notes: event.target.value }))
                  }
                />
              </label>
            </div>
            <button type="submit" className="btn btn-primary" disabled={!canEdit}>
              Fall speichern
            </button>
          </form>

          <div className="content-card">
            <div className="garantiefaelle-filters">
              <label>
                Von
                <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
              </label>
              <label>
                Bis
                <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
              </label>
              <label>
                Partner
                <input value={filterPartner} onChange={(e) => setFilterPartner(e.target.value)} />
              </label>
              <label>
                Hersteller
                <input
                  value={filterManufacturer}
                  onChange={(e) => setFilterManufacturer(e.target.value)}
                />
              </label>
            </div>

            <div className="garantiefaelle-table-wrap">
              <table className="garantiefaelle-table">
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Hersteller</th>
                    <th>Partner</th>
                    <th>Kategorie</th>
                    <th>Einnahmen</th>
                    <th>Ausgaben</th>
                    <th>Gewinn</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredCases.length === 0 ? (
                    <tr>
                      <td colSpan={8}>Keine Fälle im Filter.</td>
                    </tr>
                  ) : (
                    filteredCases.map((item) => {
                      const profit = warrantyProfit(item);
                      return (
                        <tr key={item.id}>
                          <td>{item.caseDate}</td>
                          <td>{item.manufacturer}</td>
                          <td>{item.partner}</td>
                          <td>{item.category}</td>
                          <td>{formatEuro(item.manufacturerAmount)}</td>
                          <td>{formatEuro(item.partnerAmount)}</td>
                          <td className={profit >= 0 ? "is-positive" : "is-negative"}>
                            {formatEuro(profit)}
                          </td>
                          <td>
                            {canEdit ? (
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => void removeCase(item.id)}
                              >
                                Löschen
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {tab === "auswertung" ? (
        <section className="garantiefaelle-stack">
          <div className="garantiefaelle-period-switch">
            {(["week", "month", "year"] as PeriodKind[]).map((kind) => (
              <button
                key={kind}
                type="button"
                className={`soft-tab ${periodKind === kind ? "is-active" : ""}`}
                onClick={() => setPeriodKind(kind)}
              >
                {kind === "week" ? "Woche" : kind === "month" ? "Monat" : "Jahr"}
              </button>
            ))}
          </div>

          <div className="content-card garantiefaelle-chart-card">
            <h2>Gewinnentwicklung</h2>
            <div className="garantiefaelle-chart">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={analytics.periods}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" hide={analytics.periods.length > 8} />
                  <YAxis />
                  <Tooltip formatter={(value) => formatEuro(Number(value))} />
                  <Legend />
                  <Line type="monotone" dataKey="profit" name="Gewinn" stroke="#16a34a" strokeWidth={2} />
                  <Line type="monotone" dataKey="income" name="Einnahmen" stroke="#2563eb" />
                  <Line type="monotone" dataKey="expense" name="Ausgaben" stroke="#dc2626" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="content-card garantiefaelle-chart-card">
            <h2>Periodenvergleich</h2>
            <div className="garantiefaelle-chart">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={analytics.periods}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" hide={analytics.periods.length > 8} />
                  <YAxis />
                  <Tooltip formatter={(value) => formatEuro(Number(value))} />
                  <Legend />
                  <Bar dataKey="income" name="Einnahmen" fill="#2563eb" />
                  <Bar dataKey="expense" name="Ausgaben" fill="#dc2626" />
                  <Bar dataKey="profit" name="Gewinn" fill="#16a34a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="garantiefaelle-rank-grid">
            <div className="content-card">
              <h2>Partner-Ranking</h2>
              <ul className="garantiefaelle-rank-list">
                {analytics.byPartner.slice(0, 8).map((item) => (
                  <li key={item.name}>
                    <strong>{item.name}</strong>
                    <span>{item.count} Fälle · {formatEuro(item.profit)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="content-card">
              <h2>Hersteller-Ranking</h2>
              <ul className="garantiefaelle-rank-list">
                {analytics.byManufacturer.slice(0, 8).map((item) => (
                  <li key={item.name}>
                    <strong>{item.name}</strong>
                    <span>{item.count} Fälle · {formatEuro(item.profit)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      {tab === "import" ? (
        <section className="content-card garantiefaelle-import">
          <h2>Partnerrechnungen importieren</h2>
          <p>
            CSV mit Spalten wie Partner, Datum, Betrag. Optional Hersteller, Kategorie, Referenz.
            Herstellerpreise werden automatisch aus den hinterlegten Preisregeln übernommen.
          </p>
          {!importAnalysis ? (
            <button
              type="button"
              className="btn btn-import"
              disabled={!canEdit || importBusy}
              onClick={() => importRef.current?.click()}
            >
              CSV auswählen
            </button>
          ) : (
            <div className="garantiefaelle-import-report">
              <h3>Analyse: {importAnalysis.fileName}</h3>
              <div className="garantiefaelle-kpis">
                <article>
                  <span>Zeilen</span>
                  <strong>{importAnalysis.totalRows}</strong>
                </article>
                <article>
                  <span>Importierbar</span>
                  <strong>{importAnalysis.ready.length - importAnalysis.alreadyStored}</strong>
                </article>
                <article>
                  <span>Übersprungen</span>
                  <strong>{importAnalysis.skipped.length}</strong>
                </article>
              </div>
              {importAnalysis.missingRequired.length > 0 ? (
                <p className="error-banner">
                  Fehlende Spalten: {importAnalysis.missingRequired.join(", ")}
                </p>
              ) : null}
              <div className="garantiefaelle-import-actions">
                <button type="button" className="btn btn-primary" onClick={() => void confirmImport()}>
                  Import starten
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setImportAnalysis(null)}>
                  Abbrechen
                </button>
              </div>
            </div>
          )}
        </section>
      ) : null}

      {tab === "preise" ? (
        <section className="garantiefaelle-stack">
          <form className="content-card garantiefaelle-form" onSubmit={(event) => void submitPrice(event)}>
            <h2>Herstellerpreis anlegen</h2>
            <div className="garantiefaelle-fields">
              <label>
                Hersteller
                <input
                  value={priceDraft.manufacturer}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setPriceDraft((current) => ({ ...current, manufacturer: event.target.value }))
                  }
                />
              </label>
              <label>
                Kategorie
                <select
                  value={priceDraft.category}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setPriceDraft((current) => ({
                      ...current,
                      category: event.target.value as WarrantyCategory,
                    }))
                  }
                >
                  {WARRANTY_CATEGORIES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Preis pro Fall
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={priceDraft.amount}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setPriceDraft((current) => ({ ...current, amount: event.target.value }))
                  }
                />
              </label>
              <label>
                Gültig ab
                <input
                  type="date"
                  value={priceDraft.validFrom}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setPriceDraft((current) => ({ ...current, validFrom: event.target.value }))
                  }
                />
              </label>
              <label>
                Gültig bis
                <input
                  type="date"
                  value={priceDraft.validTo}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setPriceDraft((current) => ({ ...current, validTo: event.target.value }))
                  }
                />
              </label>
            </div>
            <button type="submit" className="btn btn-primary" disabled={!canEdit}>
              Preis speichern
            </button>
          </form>

          <div className="content-card">
            <h2>Hinterlegte Herstellerpreise</h2>
            <div className="garantiefaelle-table-wrap">
              <table className="garantiefaelle-table">
                <thead>
                  <tr>
                    <th>Hersteller</th>
                    <th>Kategorie</th>
                    <th>Preis</th>
                    <th>Gültig ab</th>
                    <th>Gültig bis</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {manufacturerPrices.length === 0 ? (
                    <tr>
                      <td colSpan={6}>Noch keine Preisregeln hinterlegt.</td>
                    </tr>
                  ) : (
                    manufacturerPrices.map((item) => (
                      <tr key={item.id}>
                        <td>{item.manufacturer}</td>
                        <td>{item.category}</td>
                        <td>{formatEuro(item.amount)}</td>
                        <td>{item.validFrom ?? "—"}</td>
                        <td>{item.validTo ?? "—"}</td>
                        <td>
                          {canEdit ? (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => void removePrice(item.id)}
                            >
                              Löschen
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
