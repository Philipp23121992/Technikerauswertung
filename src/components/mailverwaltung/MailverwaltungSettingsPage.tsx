"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useEditAccess } from "@/components/EditAccessProvider";
import { fetchMailState, formatWhen, type MailboxDto, type MailverwaltungState } from "./types";

function guessImapHost(email: string): string {
  const domain = email.split("@")[1]?.trim().toLowerCase() || "";
  if (
    domain === "acp.de" ||
    domain.endsWith(".onmicrosoft.com") ||
    domain === "outlook.com" ||
    domain === "hotmail.com" ||
    domain === "live.com"
  ) {
    return "outlook.office365.com";
  }
  if (domain.includes("ovh") || domain === "krsystems-techtools.de") {
    return "ssl0.ovh.net";
  }
  return "";
}

export function MailverwaltungSettingsPage() {
  const { hasApp } = useAuth();
  const { canEdit } = useEditAccess();
  const [state, setState] = useState<MailverwaltungState | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [tenantId, setTenantId] = useState("common");
  const [redirectUri, setRedirectUri] = useState("");
  const [staleHours, setStaleHours] = useState(8);
  const [escalateCritical, setEscalateCritical] = useState(true);
  const [copyToOneDrive, setCopyToOneDrive] = useState(false);
  const [imapOpen, setImapOpen] = useState<string | null>(null);
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState(993);
  const [imapUser, setImapUser] = useState("");
  const [imapPassword, setImapPassword] = useState("");
  const [imapSecure, setImapSecure] = useState(true);

  const load = useCallback(async () => {
    const next = await fetchMailState();
    setState(next);
    setClientId(next.settings.clientId);
    setTenantId(next.settings.tenantId);
    setRedirectUri(
      next.settings.redirectUri ||
        (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost"
          ? "https://www.apm-servicetools.de/api/mailverwaltung/oauth/callback"
          : `${window.location.origin}/api/mailverwaltung/oauth/callback`),
    );
    setStaleHours(next.settings.staleHours);
    setEscalateCritical(next.settings.escalateCritical);
    setCopyToOneDrive(next.settings.copyToOneDrive);
  }, []);

  useEffect(() => {
    if (!hasApp("mailverwaltung")) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth") === "ok") {
      setMessage("Outlook-Postfach ist verbunden. Als Nächstes „Jetzt synchronisieren“ auf Posteingang.");
    }
    const reason = params.get("reason");
    if (params.get("oauth") === "error") {
      setError(reason || "Outlook-Verbindung fehlgeschlagen.");
    }
    void load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Einstellungen konnten nicht geladen werden.");
    });
  }, [hasApp, load]);

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/mailverwaltung/settings", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          clientSecret,
          tenantId,
          redirectUri,
          staleHours,
          escalateCritical,
          copyToOneDrive,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Speichern fehlgeschlagen.");
        return;
      }
      setState(data);
      setClientSecret("");
      setMessage("Einstellungen gespeichert.");
    } finally {
      setBusy(false);
    }
  }

  async function addMailbox(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/mailverwaltung/mailboxes", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, displayName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Postfach konnte nicht angelegt werden.");
        return;
      }
      setState(data);
      setEmail("");
      setDisplayName("");
    } finally {
      setBusy(false);
    }
  }

  async function removeMailbox(id: string) {
    if (!canEdit) return;
    if (!window.confirm("Postfach wirklich entfernen? Mails dieses Fachs werden lokal gelöscht.")) {
      return;
    }
    const res = await fetch(`/api/mailverwaltung/mailboxes/${id}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Löschen fehlgeschlagen.");
      return;
    }
    setState(data);
  }

  function openImap(item: MailboxDto) {
    setError("");
    setMessage("");
    setImapOpen(item.id);
    setImapHost(item.imapHost || guessImapHost(item.email));
    setImapPort(item.imapPort || 993);
    setImapUser(item.imapUser || item.email);
    setImapPassword("");
    setImapSecure(item.imapSecure !== false);
  }

  async function saveImap(id: string, testOnly: boolean) {
    if (!canEdit) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/mailverwaltung/mailboxes/${id}/imap`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: imapHost,
          port: imapPort,
          secure: imapSecure,
          user: imapUser,
          password: imapPassword,
          testOnly,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "IMAP-Verbindung fehlgeschlagen.");
        return;
      }
      if (testOnly) {
        setMessage(data.message || "IMAP-Login erfolgreich.");
        return;
      }
      setState(data);
      setImapPassword("");
      setMessage("IMAP verbunden. Posteingang wird synchronisiert.");
    } finally {
      setBusy(false);
    }
  }

  async function resetDemo() {
    if (!canEdit) return;
    setBusy(true);
    try {
      const res = await fetch("/api/mailverwaltung/reset-demo", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Demo konnte nicht geladen werden.");
        return;
      }
      setState(data);
      setMessage("Beispieldaten neu geladen.");
    } finally {
      setBusy(false);
    }
  }

  if (!hasApp("mailverwaltung")) {
    return (
      <div className="page-panel">
        <h1>Keine Berechtigung</h1>
      </div>
    );
  }
  if (!state) return <div className="page-panel">Lade Einstellungen…</div>;

  const defaultRedirect =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/mailverwaltung/oauth/callback`
      : "";

  return (
    <div className="page-panel">
      <header className="section-header">
        <div>
          <h1>Postfächer verbinden</h1>
          <p>
            Microsoft Graph braucht eine Freigabe der Organisation. Ohne diese Freigabe
            Postfächer per <strong>IMAP</strong> anbinden (Benutzername + Passwort).
          </p>
        </div>
      </header>
      {error ? <p className="smtp-error">{error}</p> : null}
      {message ? <p className="smtp-ok">{message}</p> : null}

      <section className="content-card smtp-card">
        <h2>Microsoft Graph (optional)</h2>
        <p className="smtp-hint">
          Nur wenn die IT Graph für diese App freigibt. Sonst den Block ignorieren und
          unten IMAP nutzen.
        </p>
        <form className="smtp-form" onSubmit={saveSettings}>
          <label>
            <span>Tenant-ID (oder common)</span>
            <input value={tenantId} disabled={!canEdit} onChange={(event) => setTenantId(event.target.value)} />
          </label>
          <label>
            <span>Application (Client) ID</span>
            <input value={clientId} disabled={!canEdit} onChange={(event) => setClientId(event.target.value)} />
          </label>
          <label>
            <span>Client Secret (leer = behalten)</span>
            <input
              type="password"
              value={clientSecret}
              disabled={!canEdit}
              onChange={(event) => setClientSecret(event.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label>
            <span>Redirect URI (muss 1:1 in Azure stehen)</span>
            <input
              value={redirectUri}
              disabled={!canEdit}
              placeholder={defaultRedirect}
              onChange={(event) => setRedirectUri(event.target.value)}
            />
          </label>
          <label>
            <span>Warnung nach Stunden ohne Bearbeitung</span>
            <input
              type="number"
              min={1}
              value={staleHours}
              disabled={!canEdit}
              onChange={(event) => setStaleHours(Number(event.target.value) || 8)}
            />
          </label>
          <label className="smtp-check">
            <input
              type="checkbox"
              checked={escalateCritical}
              disabled={!canEdit}
              onChange={(event) => setEscalateCritical(event.target.checked)}
            />
            <span>Kritische Mails automatisch eskalieren</span>
          </label>
          <label className="smtp-check">
            <input
              type="checkbox"
              checked={copyToOneDrive}
              disabled={!canEdit}
              onChange={(event) => setCopyToOneDrive(event.target.checked)}
            />
            <span>Wichtige Dateien optional nach OneDrive/SharePoint kopieren (Vorbereitung)</span>
          </label>
          <div className="smtp-actions">
            <button type="submit" className="btn btn-primary" disabled={!canEdit || busy}>
              Speichern
            </button>
            <button type="button" className="btn btn-secondary" disabled={!canEdit || busy} onClick={() => void resetDemo()}>
              Beispieldaten neu laden
            </button>
          </div>
        </form>
      </section>

      <section className="content-card smtp-card">
        <h2>Postfächer per IMAP</h2>
        <p className="smtp-hint">
          Empfohlen, wenn Graph nicht freigegeben ist. Microsoft 365 sperrt IMAP oft
          genauso — dann den ACP-Posteingang an ein eigenes Postfach (z. B. OVH) weiterleiten
          und dieses hier verbinden. Host für Microsoft: <code>outlook.office365.com</code>,
          für OVH: <code>ssl0.ovh.net</code>, Port 993, SSL an.
        </p>
        <form className="smtp-form" onSubmit={addMailbox}>
          <label>
            <span>Anzeigename</span>
            <input value={displayName} disabled={!canEdit} onChange={(event) => setDisplayName(event.target.value)} />
          </label>
          <label>
            <span>E-Mail-Adresse</span>
            <input
              type="email"
              value={email}
              required
              disabled={!canEdit}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <div className="smtp-actions">
            <button type="submit" className="btn btn-primary" disabled={!canEdit || busy}>
              Postfach anlegen
            </button>
          </div>
        </form>
        <ul className="mv-log">
          {state.mailboxes.map((item) => (
            <li key={item.id}>
              <strong>{item.displayName}</strong>
              <span>{item.email}</span>
              <em>
                {item.provider === "imap"
                  ? "IMAP"
                  : item.provider === "graph"
                    ? "Microsoft Graph"
                    : "nicht verbunden"}
                {item.connected ? " · verbunden" : ""}
                {item.lastSyncAt ? ` · Sync ${formatWhen(item.lastSyncAt)}` : ""}
                {item.lastError ? ` · ${item.lastError}` : ""}
              </em>
              <div className="smtp-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!canEdit}
                  onClick={() => openImap(item)}
                >
                  Per IMAP verbinden
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!canEdit}
                  onClick={() => {
                    window.location.assign(
                      `/mailverwaltung/verbinden?mailboxId=${encodeURIComponent(item.id)}`,
                    );
                  }}
                >
                  Graph / Outlook
                </button>
                <button type="button" className="btn btn-secondary" disabled={!canEdit} onClick={() => void removeMailbox(item.id)}>
                  Entfernen
                </button>
              </div>
              {imapOpen === item.id ? (
                <form
                  className="smtp-form mv-mailbox-imap"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveImap(item.id, false);
                  }}
                >
                  <label>
                    <span>IMAP-Host</span>
                    <input value={imapHost} disabled={!canEdit} onChange={(event) => setImapHost(event.target.value)} />
                  </label>
                  <label>
                    <span>Port</span>
                    <input
                      type="number"
                      min={1}
                      value={imapPort}
                      disabled={!canEdit}
                      onChange={(event) => setImapPort(Number(event.target.value) || 993)}
                    />
                  </label>
                  <label>
                    <span>Benutzername</span>
                    <input value={imapUser} disabled={!canEdit} onChange={(event) => setImapUser(event.target.value)} />
                  </label>
                  <label>
                    <span>Passwort{item.hasImapPassword ? " (leer = behalten)" : ""}</span>
                    <input
                      type="password"
                      value={imapPassword}
                      disabled={!canEdit}
                      autoComplete="new-password"
                      onChange={(event) => setImapPassword(event.target.value)}
                    />
                  </label>
                  <label className="smtp-check">
                    <input
                      type="checkbox"
                      checked={imapSecure}
                      disabled={!canEdit}
                      onChange={(event) => setImapSecure(event.target.checked)}
                    />
                    <span>SSL/TLS (Port 993)</span>
                  </label>
                  <div className="smtp-actions">
                    <button type="submit" className="btn btn-primary" disabled={!canEdit || busy}>
                      Speichern und synchronisieren
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={!canEdit || busy}
                      onClick={() => void saveImap(item.id, true)}
                    >
                      Nur testen
                    </button>
                    <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setImapOpen(null)}>
                      Schließen
                    </button>
                  </div>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
