"use client";

import { FormEvent, useEffect, useState } from "react";
import { useEditAccess } from "@/components/EditAccessProvider";

type SmtpPublic = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
  configured: boolean;
  hasPassword: boolean;
};

const PRESETS = [
  {
    id: "office365",
    label: "Microsoft 365 / Outlook",
    host: "smtp.office365.com",
    port: 587,
    secure: false,
  },
  {
    id: "gmail",
    label: "Gmail (App-Passwort)",
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
  },
  {
    id: "ionos",
    label: "IONOS",
    host: "smtp.ionos.de",
    port: 587,
    secure: false,
  },
] as const;

export function SmtpSettingsPage() {
  const { canEdit } = useEditAccess();
  const [ready, setReady] = useState(false);
  const [host, setHost] = useState("");
  const [port, setPort] = useState(587);
  const [secure, setSecure] = useState(false);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [from, setFrom] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/mail/smtp");
        const data = (await res.json()) as SmtpPublic;
        if (cancelled) return;
        setHost(data.host || "");
        setPort(data.port || 587);
        setSecure(Boolean(data.secure));
        setUser(data.user || "");
        setFrom(data.from || "");
        setHasPassword(Boolean(data.hasPassword));
        setConfigured(Boolean(data.configured));
        setTestTo(data.user || "");
      } catch {
        if (!cancelled) setError("SMTP-Einstellungen konnten nicht geladen werden.");
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/mail/smtp", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host,
          port,
          secure,
          user,
          from,
          pass,
          keepPassword: !pass && hasPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Speichern fehlgeschlagen.");
        return;
      }
      setHasPassword(Boolean(data.hasPassword));
      setConfigured(Boolean(data.configured));
      setPass("");
      setMessage("SMTP-Einstellungen gespeichert.");
    } catch {
      setError("Speichern fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function onTest() {
    if (!canEdit) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/mail/smtp", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testTo }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Testmail fehlgeschlagen.");
        return;
      }
      setMessage(`Testmail an ${testTo} gesendet.`);
    } catch {
      setError("Testmail fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return <div className="meeting-loading">Lade SMTP-Einstellungen…</div>;
  }

  return (
    <div className="page-panel">
      <header className="section-header">
        <div>
          <h1>E-Mail / SMTP</h1>
          <p>
            Für Agenda-Erinnerungen. Zugangsdaten werden lokal in{" "}
            <code>data/smtp-config.json</code> gespeichert (nicht in Git).
          </p>
        </div>
        <span className={`smtp-status-badge ${configured ? "is-ok" : ""}`}>
          {configured ? "SMTP bereit" : "Nicht konfiguriert"}
        </span>
      </header>

      <section className="content-card smtp-card">
        <div className="content-card-head">
          <div>
            <h2>Anbieter-Vorlage</h2>
            <p>Preset wählen und danach Benutzer/Passwort eintragen</p>
          </div>
        </div>
        <div className="smtp-presets">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="btn btn-secondary"
              disabled={!canEdit}
              onClick={() => {
                setHost(preset.host);
                setPort(preset.port);
                setSecure(preset.secure);
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </section>

      <section className="content-card smtp-card">
        <form className="smtp-form" onSubmit={onSave}>
          <label>
            <span>SMTP-Host</span>
            <input
              value={host}
              disabled={!canEdit}
              onChange={(event) => setHost(event.target.value)}
              placeholder="smtp.office365.com"
              required
            />
          </label>
          <div className="smtp-row">
            <label>
              <span>Port</span>
              <input
                type="number"
                value={port}
                disabled={!canEdit}
                onChange={(event) => setPort(Number(event.target.value) || 587)}
                required
              />
            </label>
            <label className="smtp-check">
              <input
                type="checkbox"
                checked={secure}
                disabled={!canEdit}
                onChange={(event) => setSecure(event.target.checked)}
              />
              <span>SSL/TLS (meist Port 465)</span>
            </label>
          </div>
          <label>
            <span>Benutzer (meist deine E-Mail)</span>
            <input
              value={user}
              disabled={!canEdit}
              onChange={(event) => setUser(event.target.value)}
              placeholder="philipp@firma.de"
              required
            />
          </label>
          <label>
            <span>
              Passwort
              {hasPassword ? " (leer lassen = bestehendes behalten)" : ""}
            </span>
            <input
              type="password"
              value={pass}
              disabled={!canEdit}
              onChange={(event) => setPass(event.target.value)}
              placeholder={hasPassword ? "••••••••" : "SMTP-/App-Passwort"}
              autoComplete="new-password"
            />
          </label>
          <label>
            <span>Absender (From)</span>
            <input
              value={from}
              disabled={!canEdit}
              onChange={(event) => setFrom(event.target.value)}
              placeholder='APM Servicetools <philipp@firma.de>'
            />
          </label>

          {error ? <p className="smtp-error">{error}</p> : null}
          {message ? <p className="smtp-ok">{message}</p> : null}

          <div className="smtp-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!canEdit || busy}
            >
              Speichern
            </button>
          </div>
        </form>
      </section>

      <section className="content-card smtp-card">
        <div className="content-card-head">
          <div>
            <h2>Testmail</h2>
            <p>Prüft Verbindung und Versand</p>
          </div>
        </div>
        <div className="smtp-test-row">
          <input
            type="email"
            value={testTo}
            disabled={!canEdit}
            onChange={(event) => setTestTo(event.target.value)}
            placeholder="empfaenger@firma.de"
          />
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!canEdit || busy || !testTo}
            onClick={() => void onTest()}
          >
            Test senden
          </button>
        </div>
      </section>
    </div>
  );
}
