"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useEditAccess } from "@/components/EditAccessProvider";
import {
  FILE_LABELS,
  fetchMailState,
  formatWhen,
  type FileDto,
  type MailverwaltungState,
} from "./types";

export function MailverwaltungFilesPage() {
  const { hasApp } = useAuth();
  const { canEdit } = useEditAccess();
  const [state, setState] = useState<MailverwaltungState | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("alle");
  const [mailboxId, setMailboxId] = useState("alle");
  const [sender, setSender] = useState("alle");

  const load = useCallback(async () => {
    try {
      setState(await fetchMailState());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dateien konnten nicht geladen werden.");
    }
  }, []);

  useEffect(() => {
    if (hasApp("mailverwaltung")) void load();
  }, [hasApp, load]);

  const files = useMemo(() => {
    if (!state) return [];
    return state.files
      .filter((item) => item.important || category !== "alle")
      .filter((item) => (mailboxId === "alle" ? true : item.mailboxId === mailboxId))
      .filter((item) => (sender === "alle" ? true : item.senderEmail === sender))
      .filter((item) => (category === "alle" ? item.important : item.category === category))
      .filter((item) => {
        if (!query.trim()) return true;
        const q = query.trim().toLowerCase();
        return `${item.name} ${item.senderEmail}`.toLowerCase().includes(q);
      })
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  }, [state, mailboxId, sender, category, query]);

  async function patchFile(file: FileDto, patch: { important?: boolean; category?: string }) {
    if (!canEdit) return;
    const res = await fetch(`/api/mailverwaltung/files/${file.id}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Datei konnte nicht aktualisiert werden.");
      return;
    }
    setState(data);
  }

  if (!hasApp("mailverwaltung")) {
    return (
      <div className="page-panel">
        <h1>Keine Berechtigung</h1>
      </div>
    );
  }

  if (!state) return <div className="page-panel">Lade Dateien…</div>;

  const senders = [...new Set(state.files.map((item) => item.senderEmail))].sort();

  return (
    <div className="page-panel">
      <header className="section-header">
        <div>
          <h1>Wichtige Dateien</h1>
          <p>Automatisch klassifizierte Anhänge, gruppiert nach Kategorie und Absender.</p>
        </div>
      </header>
      {error ? <p className="smtp-error">{error}</p> : null}

      <div className="mv-filters">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Datei oder Absender suchen…"
        />
        <select value={mailboxId} onChange={(event) => setMailboxId(event.target.value)}>
          <option value="alle">Alle Postfächer</option>
          {state.mailboxes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.displayName}
            </option>
          ))}
        </select>
        <select value={sender} onChange={(event) => setSender(event.target.value)}>
          <option value="alle">Alle Absender</option>
          {senders.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="alle">Wichtige Kategorien</option>
          {Object.entries(FILE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="content-card">
        <table className="mv-table">
          <thead>
            <tr>
              <th>Datei</th>
              <th>Kategorie</th>
              <th>Absender</th>
              <th>Datum</th>
              <th>Wichtig</th>
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr key={file.id}>
                <td>{file.name}</td>
                <td>
                  <select
                    value={file.category}
                    disabled={!canEdit}
                    onChange={(event) => void patchFile(file, { category: event.target.value })}
                  >
                    {Object.entries(FILE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{file.senderEmail}</td>
                <td>{formatWhen(file.receivedAt)}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={file.important}
                    disabled={!canEdit}
                    onChange={(event) => void patchFile(file, { important: event.target.checked })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {files.length === 0 ? <p className="mv-empty">Keine Dateien für diesen Filter.</p> : null}
      </div>
    </div>
  );
}
