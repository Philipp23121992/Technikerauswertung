"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useEditAccess } from "@/components/EditAccessProvider";
import { compactAnalyzePayload, extractPdfInBrowser } from "@/lib/lexmark/pdf-browser";

type Stats = {
  manuals: number;
  models: number;
  errorCodes: number;
  parts: number;
  relations: number;
  review: number;
};

type ManualRow = {
  id: string;
  fileName: string;
  title: string;
  pageCount: number;
  ocrNeeded: boolean;
  status: string;
  confidence: number;
};

type ModelRow = { id: string; model: string; series: string; machineType: string | null; source: string; page: number | null };
type ErrorRow = {
  id: string;
  code: string;
  description: string | null;
  customerResolution: string | null;
  remoteResolution: string | null;
  page: number | null;
  confidence: number;
  status: string;
};
type PartRow = {
  id: string;
  fru: string;
  name: string | null;
  description: string | null;
  assembly: string | null;
  removal: string | null;
  page: number | null;
};
type RelRow = { id: string; model: string; errorCode: string; fru: string; description: string | null };
type ReviewRow = { id: string; type: string; value: string; confidence: number; reason: string; status: string };
type LogRow = { id: string; level: string; message: string; created_at: string };

const EMPTY_STATS: Stats = { manuals: 0, models: 0, errorCodes: 0, parts: 0, relations: 0, review: 0 };

function reviewTypeLabel(type: string): string {
  if (type === "error_code") return "Fehlercode";
  if (type === "replacement_part") return "Ersatzteil";
  if (type === "model") return "Modell";
  if (type === "ocr") return "Scan/OCR";
  if (type === "relationship") return "Kette";
  return type;
}

function reviewStatusLabel(status: string): string {
  if (status === "NEEDS_REVIEW") return "Prüfen";
  if (status === "AUTO_APPROVED") return "Freigegeben";
  if (status === "REJECTED") return "Abgelehnt";
  return status;
}

function viewOf(search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get("view") || "analyse";
}

export function LexmarkPage() {
  const { canEdit } = useEditAccess();
  const searchParams = useSearchParams();
  const view = viewOf(searchParams.toString());
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [useAi, setUseAi] = useState(false);
  const [manuals, setManuals] = useState<ManualRow[]>([]);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [errorCodes, setErrorCodes] = useState<ErrorRow[]>([]);
  const [parts, setParts] = useState<PartRow[]>([]);
  const [relations, setRelations] = useState<RelRow[]>([]);
  const [review, setReview] = useState<ReviewRow[]>([]);
  const [serverLog, setServerLog] = useState<LogRow[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);

  async function load(search = query) {
    const res = await fetch(`/api/lexmark?q=${encodeURIComponent(search)}`, { credentials: "same-origin" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Datenbank konnte nicht geladen werden.");
    setStats(data.stats ?? EMPTY_STATS);
    setAiConfigured(Boolean(data.aiConfigured));
    setManuals(data.manuals ?? []);
    setModels(data.models ?? []);
    setErrorCodes(data.errorCodes ?? []);
    setParts(data.parts ?? []);
    setRelations(data.relations ?? []);
    setReview(data.review ?? []);
    setServerLog(data.log ?? []);
    setReady(true);
  }

  useEffect(() => {
    folderRef.current?.setAttribute("webkitdirectory", "");
    folderRef.current?.setAttribute("directory", "");
  }, []);

  useEffect(() => {
    void load("").catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Laden fehlgeschlagen.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filesFromInputs = useMemo(() => {
    return () => {
      const picked = [
        ...(fileRef.current?.files ? Array.from(fileRef.current.files) : []),
        ...(folderRef.current?.files ? Array.from(folderRef.current.files) : []),
      ];
      const byName = new Map<string, File>();
      for (const file of picked) {
        if (!file.name.toLowerCase().endsWith(".pdf")) continue;
        byName.set(file.name, file);
      }
      return [...byName.values()];
    };
  }, []);

  function pushLog(line: string) {
    setLog((prev) => [...prev.slice(-300), `${new Date().toLocaleTimeString("de-DE")}  ${line}`]);
  }

  async function analyzeFiles(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    const files = filesFromInputs();
    if (!files.length) {
      setError("Bitte PDFs oder ein Verzeichnis mit Manuals wählen.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    setProgress({ done: 0, total: files.length });
    abortRef.current = new AbortController();
    pushLog(`Starte Analyse: ${files.length} PDF(s).`);
    let okCount = 0;
    try {
      for (let i = 0; i < files.length; i += 1) {
        if (abortRef.current.signal.aborted) {
          pushLog("Analyse gestoppt.");
          break;
        }
        const file = files[i];
        pushLog(`${i + 1}/${files.length} ${file.name} (${Math.round(file.size / 1024)} KB) – lokal lesen…`);
        let extracted;
        try {
          extracted = await extractPdfInBrowser(
            file,
            (done, total) => {
              setProgress({ done: i, total: files.length });
              setMessage(`Lese ${file.name}: Seite ${done} von ${total}…`);
            },
            abortRef.current.signal,
          );
        } catch (err) {
          pushLog(`${file.name}: ${err instanceof Error ? err.message : "PDF unlesbar."}`);
          setProgress({ done: i + 1, total: files.length });
          continue;
        }
        for (const warning of extracted.warnings) pushLog(`  ${warning}`);
        pushLog(
          `  ${extracted.pageCount} Seiten lokal: ${extracted.errorCodes.length} Codes, ${extracted.parts.length} FRUs, ${extracted.models.length} Modelle.`,
        );
        const payload = compactAnalyzePayload(extracted, useAi && aiConfigured);
        const res = await fetch("/api/lexmark/analyze", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: abortRef.current.signal,
        });
        const data = await res.json().catch(() => null);
        if (res.status === 413) {
          pushLog(`${file.name}: Übertragungsvolumen zu groß – bitte Support melden.`);
        } else if (!data?.ok) {
          pushLog(`${file.name}: ${data?.error || `HTTP ${res.status}`}`);
          for (const line of data?.log ?? []) pushLog(`  ${line}`);
        } else {
          okCount += 1;
          pushLog(
            `${file.name}: ${data.stats?.errorCodes ?? 0} Codes, ${data.stats?.parts ?? 0} FRUs, ${data.stats?.models ?? 0} Modelle.`,
          );
          for (const line of data.log ?? []) pushLog(`  ${line}`);
        }
        setProgress({ done: i + 1, total: files.length });
      }
      setMessage(`${okCount} von ${files.length} Manuals übernommen.`);
      if (fileRef.current) fileRef.current.value = "";
      if (folderRef.current) folderRef.current.value = "";
      await load(query);
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") {
        setMessage("Analyse gestoppt.");
      } else {
        setError(err instanceof Error ? err.message : "Analyse fehlgeschlagen.");
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function exportExcel(manualId?: string) {
    const url = manualId ? `/api/lexmark/export?manualId=${encodeURIComponent(manualId)}` : "/api/lexmark/export";
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error || "Excel-Export fehlgeschlagen.");
      return;
    }
    const blob = await res.blob();
    const name = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] || "Lexmark-Knowledge.xlsx";
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    a.click();
    URL.revokeObjectURL(href);
  }

  async function sendToChatbot(manualId?: string) {
    if (!canEdit) return;
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const res = await fetch("/api/wissen/docs", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "lexmark", manualId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "Import in den Chatbot fehlgeschlagen. Dafür brauchst du Schreibrecht unter Wissen.");
        return;
      }
      const count = Number(data?.imported) || 1;
      const chunks = Number(data?.chunks) || data?.doc?.chunkCount || 0;
      setMessage(
        count === 1
          ? `„${data.doc?.title || "Liste"}“ ist als Wissensquelle im Chatbot (${chunks} Abschnitte).`
          : `${count} Manual-Listen sind als Wissensquelle im Chatbot (${chunks} Abschnitte).`,
      );
    } catch {
      setError("Import in den Chatbot fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    if (!canEdit) return;
    if (!window.confirm("Gesamte Lexmark-Wissensdatenbank leeren?")) return;
    const res = await fetch("/api/lexmark?clear=1", { method: "DELETE", credentials: "same-origin" });
    if (!res.ok) {
      setError("Leeren fehlgeschlagen.");
      return;
    }
    setMessage("Datenbank geleert.");
    await load("");
  }

  async function setReviewStatus(id: string, status: "AUTO_APPROVED" | "REJECTED") {
    const res = await fetch("/api/lexmark/review", {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (!res.ok) {
      setError("Review-Status konnte nicht gespeichert werden.");
      return;
    }
    await load(query);
  }

  return (
    <div className="page-panel">
      <header className="section-header">
        <div>
          <h1>Lexmark Knowledge Extractor</h1>
          <p>
            Service Manuals, Parts Lists und Troubleshooting-PDFs analysieren. Modelle, Fehlercodes und FRUs werden nur
            aus dem Dokument übernommen – nichts wird erfunden.
          </p>
        </div>
        <div className="wissen-stats">
          <span>{stats.manuals} Manuals</span>
          <span>{stats.models} Modelle</span>
          <span>{stats.errorCodes} Codes</span>
          <span>{stats.parts} FRUs</span>
          <span>{stats.relations} Ketten</span>
          <span>{stats.review} Prüfung</span>
        </div>
      </header>

      {view === "analyse" ? (
        <section className="content-card">
          <div className="content-card-head">
            <div>
              <h2>Analyse</h2>
              <p>
                Mehrere PDFs oder ein ganzer Ordner. Große Manuals werden lokal gelesen, nicht hochgeladen. Für korrekte
                FRU-Bezeichnungen und Ausbauanleitungen die Manuals hier neu analysieren (Parts Catalog + Removal).
              </p>
            </div>
          </div>
          <form className="lexmark-upload" onSubmit={(event) => void analyzeFiles(event)}>
            <label>
              PDFs
              <input ref={fileRef} type="file" accept="application/pdf,.pdf" multiple disabled={!canEdit || busy} />
            </label>
            <label>
              Verzeichnis
              <input ref={folderRef} type="file" multiple disabled={!canEdit || busy} />
            </label>
            <label className="lexmark-ai">
              <input
                type="checkbox"
                checked={useAi && aiConfigured}
                disabled={!aiConfigured || busy}
                onChange={(event) => setUseAi(event.target.checked)}
              />
              KI-Nachanalyse {aiConfigured ? "(OpenAI/Azure aus .env)" : "(kein Key in .env)"}
            </label>
            <button type="submit" className="btn btn-primary" disabled={!canEdit || busy}>
              {busy ? "Analysiere…" : "Analyse starten"}
            </button>
            <button type="button" className="btn btn-secondary" disabled={!busy} onClick={stop}>
              Stoppen
            </button>
            <button type="button" className="btn btn-secondary" disabled={busy || !stats.manuals} onClick={() => void exportExcel()}>
              Excel exportieren
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!canEdit || busy || !stats.manuals}
              onClick={() => void sendToChatbot()}
            >
              Alle zum Chatbot
            </button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void load(query)}>
              Datenbank öffnen
            </button>
            {stats.manuals > 0 ? (
              <button type="button" className="btn btn-secondary" disabled={!canEdit || busy} onClick={() => void clearAll()}>
                DB leeren
              </button>
            ) : null}
          </form>
          {busy || progress.total > 0 ? (
            <div className="lexmark-progress" aria-label="Fortschritt">
              <div style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
              <span>
                {progress.done}/{progress.total}
              </span>
            </div>
          ) : null}
          {error ? <p className="wissen-error">{error}</p> : null}
          {message ? <p className="wissen-ok">{message}</p> : null}
          <div className="lexmark-log" aria-label="Log">
            {log.length === 0 && serverLog.length === 0 ? (
              <p className="muted-meta">Noch kein Log.</p>
            ) : (
              <>
                {log.map((line, index) => (
                  <p key={`l-${index}`}>{line}</p>
                ))}
                {serverLog.slice(0, 20).map((item) => (
                  <p key={item.id} className={item.level === "error" ? "is-error" : ""}>
                    {item.created_at.slice(11, 19)} {item.message}
                  </p>
                ))}
              </>
            )}
          </div>
        </section>
      ) : null}

      {view !== "analyse" ? (
        <section className="content-card">
          <form
            className="wissen-ticket-search"
            onSubmit={(event) => {
              event.preventDefault();
              void load(query).catch((err: unknown) => {
                setError(err instanceof Error ? err.message : "Suche fehlgeschlagen.");
              });
            }}
          >
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Modell, Fehlercode oder FRU suchen…"
            />
            <button type="submit" className="btn btn-secondary">
              Suchen
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => void exportExcel()}>
              Excel
            </button>
          </form>
        </section>
      ) : null}

      {view === "modelle" ? (
        <section className="content-card" style={{ marginTop: "1rem" }}>
          <h2>Modelle</h2>
          {models.length === 0 ? (
            <p className="wissen-empty">Keine Modelle.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Modell</th>
                    <th>Serie</th>
                    <th>Maschinentyp</th>
                    <th>Quelle</th>
                    <th>Seite</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((item) => (
                    <tr key={item.id}>
                      <td>{item.model}</td>
                      <td>{item.series}</td>
                      <td>{item.machineType || "—"}</td>
                      <td>{item.source}</td>
                      <td>{item.page ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {view === "codes" ? (
        <section className="content-card" style={{ marginTop: "1rem" }}>
          <h2>Fehlercodes</h2>
          {errorCodes.length === 0 ? (
            <p className="wissen-empty">Keine Fehlercodes.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Beschreibung</th>
                    <th>Customer</th>
                    <th>Remote</th>
                    <th>Seite</th>
                    <th>%</th>
                  </tr>
                </thead>
                <tbody>
                  {errorCodes.map((item) => (
                    <tr key={item.id}>
                      <td>{item.code}</td>
                      <td>{item.description || "—"}</td>
                      <td>{item.customerResolution || "—"}</td>
                      <td>{item.remoteResolution || "—"}</td>
                      <td>{item.page ?? "—"}</td>
                      <td>{item.confidence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {view === "teile" ? (
        <section className="content-card" style={{ marginTop: "1rem" }}>
          <h2>Ersatzteile</h2>
          {parts.length === 0 ? (
            <p className="wissen-empty">Keine FRUs.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>FRU</th>
                    <th>Bezeichnung</th>
                    <th>Baugruppe</th>
                    <th>Ausbau</th>
                    <th>Seite</th>
                  </tr>
                </thead>
                <tbody>
                  {parts.map((item) => (
                    <tr key={item.id}>
                      <td>{item.fru}</td>
                      <td>{item.name || item.description || "—"}</td>
                      <td>{item.assembly || "—"}</td>
                      <td>{item.removal ? item.removal.slice(0, 90) + (item.removal.length > 90 ? "…" : "") : "—"}</td>
                      <td>{item.page ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {view === "beziehungen" ? (
        <section className="content-card" style={{ marginTop: "1rem" }}>
          <h2>Ketten</h2>
          <p className="muted-meta">
            Modell → Fehlercode → FRU. Es werden bis zu 500 Treffer gezeigt; über die Suche eingrenzen.
          </p>
          {relations.length === 0 ? (
            <p className="wissen-empty">
              {ready
                ? "Keine Ketten gefunden. Fehlercode und FRU müssen im selben Abschnitt oder auf derselben Seite stehen."
                : "Ketten werden geladen…"}
            </p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Modell</th>
                    <th>Fehlercode</th>
                    <th>FRU</th>
                    <th>Beschreibung</th>
                  </tr>
                </thead>
                <tbody>
                  {relations.map((item) => (
                    <tr key={item.id}>
                      <td>{item.model || "—"}</td>
                      <td>{item.errorCode}</td>
                      <td>{item.fru}</td>
                      <td>{item.description || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {view === "review" ? (
        <section className="content-card" style={{ marginTop: "1rem" }}>
          <h2>Prüfung</h2>
          <p className="muted-meta">
            Die Zahl ist die <strong>Sicherheit</strong> in Prozent (0–100). Je höher, desto klarer der Treffer im
            PDF. 70&nbsp;%: FRU erkannt, Bezeichnung fehlt. Unter 60&nbsp;% gilt als unsicher und bleibt zur Prüfung.
          </p>
          {review.length === 0 ? (
            <p className="wissen-empty">Nichts zur Prüfung.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Typ</th>
                    <th>Wert</th>
                    <th>Sicherheit</th>
                    <th>Grund</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {review.map((item) => (
                    <tr key={item.id}>
                      <td>{reviewTypeLabel(item.type)}</td>
                      <td>{item.value}</td>
                      <td>{item.confidence} %</td>
                      <td>{item.reason}</td>
                      <td>{reviewStatusLabel(item.status)}</td>
                      <td>
                        {canEdit && item.status === "NEEDS_REVIEW" ? (
                          <>
                            <button type="button" className="btn btn-link" onClick={() => void setReviewStatus(item.id, "AUTO_APPROVED")}>
                              Freigeben
                            </button>
                            <button type="button" className="btn btn-link-danger" onClick={() => void setReviewStatus(item.id, "REJECTED")}>
                              Ablehnen
                            </button>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {view === "analyse" && manuals.length > 0 ? (
        <section className="content-card" style={{ marginTop: "1rem" }}>
          <h2>Importierte Manuals</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Datei</th>
                  <th>Seiten</th>
                  <th>%</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {manuals.map((item) => (
                  <tr key={item.id}>
                    <td>{item.fileName}</td>
                    <td>{item.pageCount}</td>
                    <td>{item.confidence}</td>
                    <td>{item.status}</td>
                    <td>
                      <button type="button" className="btn btn-link" onClick={() => void exportExcel(item.id)}>
                        Excel
                      </button>
                      {canEdit ? (
                        <button type="button" className="btn btn-link" disabled={busy} onClick={() => void sendToChatbot(item.id)}>
                          Zum Chatbot
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
