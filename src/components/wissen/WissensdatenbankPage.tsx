"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useEditAccess } from "@/components/EditAccessProvider";

type KnowledgeDoc = {
  id: string;
  title: string;
  fileName: string;
  category: "manual" | "leitfaden" | "sonstiges";
  active: boolean;
  charCount: number;
  chunkCount: number;
  updatedAt: string;
};

const CATEGORY_LABEL: Record<KnowledgeDoc["category"], string> = {
  manual: "Manual",
  leitfaden: "Leitfaden",
  sonstiges: "Sonstiges",
};

export function WissensdatenbankPage() {
  const { canEdit } = useEditAccess();
  const fileRef = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [stats, setStats] = useState({ docs: 0, active: 0, chunks: 0 });
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<KnowledgeDoc["category"]>("manual");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const res = await fetch("/api/wissen/docs");
    const data = await res.json();
    setDocs(Array.isArray(data.docs) ? data.docs : []);
    setStats(data.stats ?? { docs: 0, active: 0, chunks: 0 });
  }

  useEffect(() => {
    void load().catch(() => setError("Wissensdatenbank konnte nicht geladen werden."));
  }, []);

  async function onUpload(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Bitte eine Datei auswählen.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("title", title);
      body.set("category", category);
      const res = await fetch("/api/wissen/docs", {
        method: "POST",
        credentials: "same-origin",
        body,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload fehlgeschlagen.");
        return;
      }
      setTitle("");
      setCategory("manual");
      if (fileRef.current) fileRef.current.value = "";
      setMessage(`„${data.doc.title}“ wurde in die Wissensdatenbank übernommen.`);
      await load();
    } catch {
      setError("Upload fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(doc: KnowledgeDoc) {
    if (!canEdit) return;
    const res = await fetch(`/api/wissen/docs/${doc.id}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !doc.active }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Aktualisieren fehlgeschlagen.");
      return;
    }
    await load();
  }

  async function removeDoc(doc: KnowledgeDoc) {
    if (!canEdit) return;
    if (!window.confirm(`Dokument „${doc.title}“ wirklich löschen?`)) return;
    const res = await fetch(`/api/wissen/docs/${doc.id}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Löschen fehlgeschlagen.");
      return;
    }
    await load();
  }

  return (
    <div className="page-panel">
      <header className="section-header">
        <div>
          <h1>Wissensdatenbank</h1>
          <p>Manuale und Leitfäden für den Chatbot hinterlegen</p>
        </div>
        <div className="wissen-stats">
          <span>{stats.docs} Dokumente</span>
          <span>{stats.active} aktiv</span>
          <span>{stats.chunks} Abschnitte</span>
        </div>
      </header>

      <section className="content-card">
        <div className="content-card-head">
          <div>
            <h2>Dokument hochladen</h2>
            <p>Unterstützt: PDF, TXT, MD, CSV</p>
          </div>
        </div>
        <form className="wissen-upload" onSubmit={onUpload}>
          <input
            value={title}
            disabled={!canEdit || busy}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Titel (optional)"
          />
          <select
            value={category}
            disabled={!canEdit || busy}
            onChange={(event) =>
              setCategory(event.target.value as KnowledgeDoc["category"])
            }
          >
            <option value="manual">Manual</option>
            <option value="leitfaden">Leitfaden</option>
            <option value="sonstiges">Sonstiges</option>
          </select>
          <input
            ref={fileRef}
            type="file"
            disabled={!canEdit || busy}
            accept=".pdf,.txt,.md,.csv,application/pdf,text/plain,text/markdown,text/csv"
          />
          <button type="submit" className="btn btn-primary" disabled={!canEdit || busy}>
            {busy ? "Lade hoch…" : "Hochladen"}
          </button>
        </form>
        {error ? <p className="wissen-error">{error}</p> : null}
        {message ? <p className="wissen-ok">{message}</p> : null}
      </section>

      <section className="content-card" style={{ marginTop: "1rem" }}>
        <div className="content-card-head">
          <div>
            <h2>Hinterlegte Dokumente</h2>
            <p>Nur aktive Dokumente fließen in den Chatbot ein</p>
          </div>
        </div>
        {docs.length === 0 ? (
          <p className="wissen-empty">Noch keine Dokumente vorhanden.</p>
        ) : (
          <div className="wissen-doc-list">
            {docs.map((doc) => (
              <article key={doc.id} className="wissen-doc-card">
                <div>
                  <h3>{doc.title}</h3>
                  <p>
                    {CATEGORY_LABEL[doc.category]} · {doc.fileName} ·{" "}
                    {doc.chunkCount} Abschnitte ·{" "}
                    {new Date(doc.updatedAt).toLocaleString("de-DE")}
                  </p>
                </div>
                <div className="wissen-doc-actions">
                  <button
                    type="button"
                    className={`btn ${doc.active ? "btn-secondary" : "btn-primary"}`}
                    disabled={!canEdit}
                    onClick={() => void toggleActive(doc)}
                  >
                    {doc.active ? "Aktiv" : "Inaktiv"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-link-danger"
                    disabled={!canEdit}
                    onClick={() => void removeDoc(doc)}
                  >
                    Löschen
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
