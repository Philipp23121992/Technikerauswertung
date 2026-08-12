"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { APP_IDS, APP_LABELS, type AppId, type PublicUser } from "@/lib/auth/types";

type Draft = {
  username: string;
  displayName: string;
  password: string;
  apps: AppId[];
  canEdit: boolean;
  active: boolean;
};

const emptyDraft = (): Draft => ({
  username: "",
  displayName: "",
  password: "",
  apps: [],
  canEdit: false,
  active: true,
});

export function UsersAdminPage() {
  const { hasApp, user: me } = useAuth();
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/users", { credentials: "same-origin" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Benutzer konnten nicht geladen werden.");
      return;
    }
    setUsers(Array.isArray(data.users) ? data.users : []);
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
          <p>Nur Administratoren dürfen Benutzer verwalten.</p>
        </div>
      </div>
    );
  }

  async function createUser(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Anlegen fehlgeschlagen.");
        return;
      }
      setDraft(emptyDraft());
      setMessage(`Benutzer „${data.user.username}“ angelegt.`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(id: string) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const payload: Record<string, unknown> = {
        displayName: editDraft.displayName,
        apps: editDraft.apps,
        canEdit: editDraft.canEdit,
        active: editDraft.active,
      };
      if (editDraft.password.trim()) payload.password = editDraft.password;
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Speichern fehlgeschlagen.");
        return;
      }
      setEditId(null);
      setMessage(`Benutzer „${data.user.username}“ gespeichert.`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function removeUser(id: string, username: string) {
    if (!window.confirm(`Benutzer „${username}“ wirklich löschen?`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Löschen fehlgeschlagen.");
        return;
      }
      setMessage(`Benutzer „${username}“ gelöscht.`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  function toggleApp(list: AppId[], app: AppId): AppId[] {
    return list.includes(app) ? list.filter((item) => item !== app) : [...list, app];
  }

  function AppsChecks({
    value,
    onChange,
  }: {
    value: AppId[];
    onChange: (next: AppId[]) => void;
  }) {
    return (
      <div className="user-apps-grid">
        {APP_IDS.map((app) => (
          <label key={app} className="user-app-check">
            <input
              type="checkbox"
              checked={value.includes(app)}
              onChange={() => onChange(toggleApp(value, app))}
            />
            <span>{APP_LABELS[app]}</span>
          </label>
        ))}
      </div>
    );
  }

  return (
    <div className="page-panel">
      <header className="section-header">
        <div>
          <h1>Benutzerverwaltung</h1>
          <p>Benutzer anlegen und App-Freigaben zuweisen</p>
        </div>
      </header>

      <section className="content-card">
        <div className="content-card-head">
          <div>
            <h2>Neuer Benutzer</h2>
            <p>Name, Passwort, sichtbare Apps und Schreibrecht</p>
          </div>
        </div>

        <form className="user-admin-form" onSubmit={createUser}>
          <div className="user-admin-row">
            <label>
              <span>Benutzername</span>
              <input
                value={draft.username}
                onChange={(e) => setDraft((d) => ({ ...d, username: e.target.value }))}
                required
              />
            </label>
            <label>
              <span>Anzeigename</span>
              <input
                value={draft.displayName}
                onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value }))}
              />
            </label>
            <label>
              <span>Passwort</span>
              <input
                type="password"
                value={draft.password}
                onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))}
                required
                minLength={6}
              />
            </label>
          </div>

          <AppsChecks
            value={draft.apps}
            onChange={(apps) => setDraft((d) => ({ ...d, apps }))}
          />

          <div className="user-admin-flags">
            <label className="user-app-check">
              <input
                type="checkbox"
                checked={draft.canEdit}
                onChange={(e) => setDraft((d) => ({ ...d, canEdit: e.target.checked }))}
              />
              <span>Darf bearbeiten / speichern</span>
            </label>
          </div>

          <button type="submit" className="btn btn-primary" disabled={busy}>
            Benutzer anlegen
          </button>
        </form>
      </section>

      {message ? (
        <div className="success-banner" role="status">
          <p>{message}</p>
        </div>
      ) : null}
      {error ? <p className="wissen-error">{error}</p> : null}

      <section className="content-card" style={{ marginTop: "1rem" }}>
        <div className="content-card-head">
          <div>
            <h2>Bestehende Benutzer</h2>
            <p>{users.length} Konten</p>
          </div>
        </div>

        <div className="tracker-table-wrap">
          <table className="tracker-table">
            <thead>
              <tr>
                <th>Benutzer</th>
                <th>Apps</th>
                <th>Rechte</th>
                <th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const editing = editId === user.id;
                return (
                  <tr key={user.id}>
                    <td>
                      {editing ? (
                        <input
                          className="add-tech-input"
                          value={editDraft.displayName}
                          onChange={(e) =>
                            setEditDraft((d) => ({ ...d, displayName: e.target.value }))
                          }
                        />
                      ) : (
                        <>
                          <strong>{user.displayName}</strong>
                          <div className="muted-meta">@{user.username}</div>
                        </>
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <AppsChecks
                          value={editDraft.apps}
                          onChange={(apps) => setEditDraft((d) => ({ ...d, apps }))}
                        />
                      ) : (
                        <div className="user-apps-chips">
                          {user.apps.map((app) => (
                            <span key={app} className="user-app-chip">
                              {APP_LABELS[app]}
                            </span>
                          ))}
                          {!user.apps.length ? <span className="muted-meta">keine</span> : null}
                        </div>
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <div className="user-admin-flags">
                          <label className="user-app-check">
                            <input
                              type="checkbox"
                              checked={editDraft.canEdit}
                              onChange={(e) =>
                                setEditDraft((d) => ({ ...d, canEdit: e.target.checked }))
                              }
                            />
                            <span>Bearbeiten</span>
                          </label>
                          <label className="user-app-check">
                            <input
                              type="checkbox"
                              checked={editDraft.active}
                              onChange={(e) =>
                                setEditDraft((d) => ({ ...d, active: e.target.checked }))
                              }
                            />
                            <span>Aktiv</span>
                          </label>
                          <label>
                            <span className="sr-only">Neues Passwort</span>
                            <input
                              className="add-tech-input"
                              type="password"
                              placeholder="Neues Passwort (optional)"
                              value={editDraft.password}
                              onChange={(e) =>
                                setEditDraft((d) => ({ ...d, password: e.target.value }))
                              }
                            />
                          </label>
                        </div>
                      ) : (
                        <>
                          <div>{user.canEdit ? "Bearbeiten" : "Nur Ansicht"}</div>
                          <div className="muted-meta">{user.active ? "Aktiv" : "Gesperrt"}</div>
                        </>
                      )}
                    </td>
                    <td>
                      <div className="toolbar-actions-row">
                        {editing ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-date"
                              disabled={busy}
                              onClick={() => void saveEdit(user.id)}
                            >
                              Speichern
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => setEditId(null)}
                            >
                              Abbrechen
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="btn btn-date"
                              onClick={() => {
                                setEditId(user.id);
                                setEditDraft({
                                  username: user.username,
                                  displayName: user.displayName,
                                  password: "",
                                  apps: [...user.apps],
                                  canEdit: user.canEdit,
                                  active: user.active,
                                });
                              }}
                            >
                              Bearbeiten
                            </button>
                            <button
                              type="button"
                              className="btn btn-link-danger"
                              disabled={busy || user.id === me?.id}
                              onClick={() => void removeUser(user.id, user.username)}
                            >
                              Löschen
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
