"use client";

import { useEffect, useMemo, useState } from "react";
import type { MailTemplate, MailTemplateId, MailTemplateMeta } from "@/lib/mail-templates/types";

type SmtpTemplatesPanelProps = {
  canManage: boolean;
  testTo: string;
};

export function SmtpTemplatesPanel({ canManage, testTo }: SmtpTemplatesPanelProps) {
  const [templates, setTemplates] = useState<MailTemplate[]>([]);
  const [meta, setMeta] = useState<MailTemplateMeta[]>([]);
  const [selectedId, setSelectedId] = useState<MailTemplateId | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const selected = templates.find((item) => item.id === selectedId) ?? null;
  const selectedMeta = meta.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/mail/templates", { credentials: "same-origin" });
        const data = (await res.json()) as {
          templates?: MailTemplate[];
          meta?: MailTemplateMeta[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || "Vorlagen konnten nicht geladen werden.");
          return;
        }
        const next = Array.isArray(data.templates) ? data.templates : [];
        setTemplates(next);
        setMeta(Array.isArray(data.meta) ? data.meta : []);
        setSelectedId((current) => current ?? next[0]?.id ?? null);
      } catch {
        if (!cancelled) setError("Vorlagen konnten nicht geladen werden.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const placeholders = useMemo(
    () => selectedMeta?.placeholders ?? [],
    [selectedMeta],
  );

  function updateSelected(patch: Partial<MailTemplate>) {
    if (!selectedId) return;
    setTemplates((current) =>
      current.map((item) => (item.id === selectedId ? { ...item, ...patch } : item)),
    );
  }

  function insertPlaceholder(key: string) {
    if (!selected) return;
    updateSelected({ body: `${selected.body}${selected.body ? " " : ""}{{${key}}}` });
  }

  async function onSave() {
    if (!canManage) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/mail/templates", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templates }),
      });
      const data = (await res.json()) as {
        templates?: MailTemplate[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error || "Speichern fehlgeschlagen.");
        return;
      }
      if (Array.isArray(data.templates)) setTemplates(data.templates);
      setMessage("Mail-Vorlagen gespeichert. Gilt für Fälligkeiten und Serviceboard-Zuweisungen.");
    } catch {
      setError("Speichern fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function onTest() {
    if (!canManage || !selected) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/mail/templates", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selected.id,
          to: testTo,
          subject: selected.subject,
          bodyText: selected.body,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Testmail fehlgeschlagen.");
        return;
      }
      setMessage(`Testmail der Vorlage an ${testTo} gesendet.`);
    } catch {
      setError("Testmail fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="content-card smtp-card">
      <div className="content-card-head">
        <div>
          <h2>Mail-Vorlagen</h2>
          <p>
            Betreff und Text für Fälligkeiten sowie für die Zuweisung im Serviceboard.
            Platzhalter wie <code>{"{{title}}"}</code> werden beim Versand ersetzt.
          </p>
        </div>
      </div>

      <div className="smtp-template-layout">
        <nav className="smtp-template-list" aria-label="Vorlagen">
          {templates.map((item) => {
            const info = meta.find((entry) => entry.id === item.id);
            return (
              <button
                key={item.id}
                type="button"
                className={`smtp-template-item ${item.id === selectedId ? "is-active" : ""}`}
                onClick={() => setSelectedId(item.id)}
              >
                <strong>{info?.name ?? item.id}</strong>
                <span>{item.enabled ? "Aktiv" : "Deaktiviert"}</span>
              </button>
            );
          })}
        </nav>

        {selected && selectedMeta ? (
          <div className="smtp-form">
            <p className="muted-meta">{selectedMeta.description}</p>
            <label className="smtp-check">
              <input
                type="checkbox"
                checked={selected.enabled}
                disabled={!canManage}
                onChange={(event) => updateSelected({ enabled: event.target.checked })}
              />
              <span>Vorlage aktiv – Mail wird versendet</span>
            </label>
            <label>
              <span>Betreff</span>
              <input
                value={selected.subject}
                disabled={!canManage}
                onChange={(event) => updateSelected({ subject: event.target.value })}
              />
            </label>
            <label>
              <span>Text</span>
              <textarea
                rows={14}
                value={selected.body}
                disabled={!canManage}
                onChange={(event) => updateSelected({ body: event.target.value })}
              />
            </label>
            <div className="smtp-placeholder-row">
              {placeholders.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className="btn btn-ghost"
                  disabled={!canManage}
                  onClick={() => insertPlaceholder(item.key)}
                >
                  {`{{${item.key}}}`} · {item.label}
                </button>
              ))}
            </div>
            {error ? <p className="smtp-error">{error}</p> : null}
            {message ? <p className="smtp-ok">{message}</p> : null}
            <div className="smtp-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canManage || busy}
                onClick={() => void onSave()}
              >
                Vorlagen speichern
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!canManage || busy || !testTo}
                onClick={() => void onTest()}
              >
                Test mit Beispieldaten
              </button>
            </div>
          </div>
        ) : (
          <p className="muted-meta">Vorlagen werden geladen…</p>
        )}
      </div>
    </section>
  );
}
