"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useReleaseFlags } from "@/components/ReleaseFlagsProvider";
import { APP_IDS, APP_LABELS, type AppId } from "@/lib/auth/types";
import type { PublicReleaseFlag } from "@/lib/releases/types";

export function ReleasesAdminPage() {
  const { hasApp } = useAuth();
  const { refresh } = useReleaseFlags();
  const [sprint, setSprint] = useState("");
  const [flags, setFlags] = useState<PublicReleaseFlag[]>([]);
  const [title, setTitle] = useState("");
  const [id, setId] = useState("");
  const [description, setDescription] = useState("");
  const [appId, setAppId] = useState<AppId | "">("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/releases", { credentials: "same-origin" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Releases konnten nicht geladen werden.");
      return;
    }
    setSprint(typeof data.sprint === "string" ? data.sprint : "");
    setFlags(Array.isArray(data.flags) ? data.flags : []);
    setError("");
  }, []);

  useEffect(() => {
    if (hasApp("admin")) void load();
  }, [hasApp, load]);

  if (!hasApp("admin")) {
    return (
      <div className="page-panel">
        <div className="content-card">
          <h1>Keine Berechtigung</h1>
          <p>Nur Administratoren dürfen Releases verwalten.</p>
        </div>
      </div>
    );
  }

  async function send(body: Record<string, unknown>, okMessage: string) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/releases", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Speichern fehlgeschlagen.");
        return;
      }
      setSprint(typeof data.sprint === "string" ? data.sprint : "");
      setFlags(Array.isArray(data.flags) ? data.flags : []);
      setMessage(okMessage);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function createFlag(event: FormEvent) {
    event.preventDefault();
    await send(
      {
        action: "create",
        id,
        title,
        description,
        appId: appId || null,
      },
      `Flag „${title || id}“ als Vorschau angelegt.`,
    );
    setTitle("");
    setId("");
    setDescription("");
    setAppId("");
  }

  const previewCount = flags.filter((flag) => flag.status === "preview").length;

  return (
    <div className="page-panel">
      <header className="section-header">
        <div>
          <h1>Releases</h1>
          <p>Neue Funktionen zuerst nur für Admins, dann im Sprint für alle Bearbeiter</p>
        </div>
      </header>

      <p className="smtp-hint">
        Vorschau-Flags siehst nur du (Admin). Über <strong>Freigeben</strong> werden sie für alle
        sichtbar. Daten wie Disposition-Import, Tickets und Notizen bleiben gemeinsam – Flags
        steuern die Oberfläche, nicht den Datenbestand.
      </p>
      {error ? <p className="smtp-hint">{error}</p> : null}
      {message ? <p className="smtp-hint">{message}</p> : null}

      <section className="content-card">
        <div className="content-card-head">
          <div>
            <h2>Sprint</h2>
            <p>Namen speichern und alle Vorschau-Flags auf einmal freigeben</p>
          </div>
        </div>
        <form
          className="user-admin-form"
          onSubmit={(event) => {
            event.preventDefault();
            void send({ action: "sprint", sprint }, "Sprintname gespeichert.");
          }}
        >
          <div className="user-admin-row">
            <label>
              <span>Sprint</span>
              <input
                value={sprint}
                onChange={(event) => setSprint(event.target.value)}
                placeholder="z. B. 2026-KW39"
              />
            </label>
          </div>
          <div className="user-admin-flags">
            <button type="submit" className="btn btn-secondary" disabled={busy}>
              Sprint speichern
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || previewCount === 0}
              onClick={() =>
                void send(
                  { action: "release-sprint", sprint },
                  previewCount === 1
                    ? "1 Flag im Sprint freigegeben."
                    : `${previewCount} Flags im Sprint freigegeben.`,
                )
              }
            >
              Alle Vorschau-Flags freigeben ({previewCount})
            </button>
          </div>
        </form>
      </section>

      <section className="content-card">
        <div className="content-card-head">
          <div>
            <h2>Flags</h2>
            <p>Vorschau = nur Admin · Freigegeben = alle Bearbeiter</p>
          </div>
        </div>
        {flags.length === 0 ? (
          <p className="mv-empty">Noch keine Release-Flags. Neue Features erscheinen hier als Vorschau.</p>
        ) : (
          <div className="tracker-table-wrap">
            <table className="tracker-table">
              <thead>
                <tr>
                  <th>Flag</th>
                  <th>Bereich</th>
                  <th>Status</th>
                  <th>Sprint</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {flags.map((flag) => (
                  <tr key={flag.id}>
                    <td>
                      <strong>{flag.title}</strong>
                      <small>
                        {flag.id}
                        {flag.description ? ` · ${flag.description}` : ""}
                      </small>
                    </td>
                    <td>{flag.appId ? APP_LABELS[flag.appId] : "—"}</td>
                    <td>
                      <span className={`release-chip is-${flag.status}`}>
                        {flag.status === "released" ? "Freigegeben" : "Vorschau"}
                      </span>
                    </td>
                    <td>{flag.sprint || "—"}</td>
                    <td>
                      <div className="user-admin-flags">
                        {flag.status === "preview" ? (
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={busy}
                            onClick={() =>
                              void send(
                                { action: "set-status", id: flag.id, status: "released" },
                                `„${flag.title}“ freigegeben.`,
                              )
                            }
                          >
                            Freigeben
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={busy}
                            onClick={() =>
                              void send(
                                { action: "set-status", id: flag.id, status: "preview" },
                                `„${flag.title}“ wieder nur für Admins.`,
                              )
                            }
                          >
                            Zurück auf Vorschau
                          </button>
                        )}
                        {flag.source === "custom" ? (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={busy}
                            onClick={() => {
                              if (!window.confirm(`Flag „${flag.title}“ löschen?`)) return;
                              void send({ action: "delete", id: flag.id }, `„${flag.title}“ gelöscht.`);
                            }}
                          >
                            Löschen
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="content-card">
        <div className="content-card-head">
          <div>
            <h2>Neues Flag</h2>
            <p>Für eine Änderung, die noch nicht im Katalog steht</p>
          </div>
        </div>
        <form className="user-admin-form" onSubmit={createFlag}>
          <div className="user-admin-row">
            <label>
              <span>Titel</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                placeholder="z. B. Dispo-Notiz im Dashboard"
              />
            </label>
            <label>
              <span>ID</span>
              <input
                value={id}
                onChange={(event) => setId(event.target.value)}
                placeholder="disp-dashboard-note"
              />
            </label>
            <label>
              <span>App</span>
              <select
                className="status-select"
                value={appId}
                onChange={(event) => setAppId(event.target.value as AppId | "")}
              >
                <option value="">—</option>
                {APP_IDS.map((app) => (
                  <option key={app} value={app}>
                    {APP_LABELS[app]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            <span>Beschreibung</span>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Was ändert sich für die Bearbeiter?"
            />
          </label>
          <div>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Als Vorschau anlegen
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
