"use client";

import { FormEvent, useState } from "react";
import { useEditAccess } from "./EditAccessProvider";

export function EditAccessControls() {
  const { ready, canEdit, unlock, lock } = useEditAccess();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const result = await unlock(password);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPassword("");
    setOpen(false);
  }

  if (!ready) {
    return (
      <div className="edit-access-panel">
        <p className="edit-access-status">Schreibschutz…</p>
      </div>
    );
  }

  if (canEdit) {
    return (
      <div className="edit-access-panel is-unlocked">
        <p className="edit-access-status">Bearbeitung freigeschaltet</p>
        <button
          type="button"
          className="edit-access-btn"
          onClick={() => void lock()}
        >
          Sperren
        </button>
      </div>
    );
  }

  return (
    <div className="edit-access-panel">
      <p className="edit-access-status">Nur Ansicht · Bearbeitung gesperrt</p>
      {open ? (
        <form className="edit-access-form" onSubmit={onSubmit}>
          <label>
            <span className="sr-only">Passwort</span>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Passwort"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error ? <p className="edit-access-error">{error}</p> : null}
          <div className="edit-access-actions">
            <button type="submit" className="edit-access-btn is-primary" disabled={busy}>
              {busy ? "…" : "Freischalten"}
            </button>
            <button
              type="button"
              className="edit-access-btn"
              onClick={() => {
                setOpen(false);
                setPassword("");
                setError("");
              }}
            >
              Abbrechen
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="edit-access-btn is-primary"
          onClick={() => setOpen(true)}
        >
          Mit Passwort freischalten
        </button>
      )}
    </div>
  );
}

export function EditLockBanner() {
  const { ready, canEdit } = useEditAccess();
  if (!ready || canEdit) return null;
  return (
    <p className="edit-lock-banner" role="status">
      Nur Ansicht — dein Benutzerkonto hat kein Bearbeitungsrecht. Admin kann das unter
      Benutzer freischalten.
    </p>
  );
}
