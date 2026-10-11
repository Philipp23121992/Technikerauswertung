"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { SmtpTemplatesPanel } from "./SmtpTemplatesPanel";

type SmtpPublic = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
  configured: boolean;
  hasPassword: boolean;
};

const ALIAS_LOCAL_PARTS = new Set([
  "postmaster",
  "webmaster",
  "hostmaster",
  "abuse",
  "noreply",
  "no-reply",
  "mailer-daemon",
]);

function isLikelyAliasMailbox(user: string): boolean {
  const local = user.trim().split("@")[0]?.toLowerCase() ?? "";
  return ALIAS_LOCAL_PARTS.has(local);
}

const PRESETS = [
  {
    id: "ovh",
    label: "OVH",
    host: "smtp.mail.ovh.net",
    port: 465,
    secure: true,
  },
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
  const { hasApp } = useAuth();
  const canManage = hasApp("admin");
  const [ready, setReady] = useState(false);
  const [host, setHost] = useState("");
  const [port, setPort] = useState(587);
  const [secure, setSecure] = useState(false);
  const [userName, setUserName] = useState("");
  const [pass, setPass] = useState("");
  const [from, setFrom] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"smtp" | "templates">("smtp");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/mail/smtp", { credentials: "same-origin" });
        const data = (await res.json()) as SmtpPublic;
        if (cancelled) return;
        setHost(data.host || "");
        setPort(data.port || 587);
        setSecure(Boolean(data.secure));
        setUserName(data.user || "");
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
    if (!canManage) return;
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
          user: userName,
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
      setMessage("SMTP-Einstellungen gespeichert. Gilt für alle Fälligkeiten im Tool.");
    } catch {
      setError("Speichern fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function onTest() {
    if (!canManage) return;
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

  async function onProcessNow() {
    if (!canManage) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/mail/process-reminders", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json()) as {
        error?: string;
        mailConfigured?: boolean;
        sent?: number;
        skipped?: number;
      };
      if (!res.ok) {
        setError(data.error || "Prüfung fehlgeschlagen.");
        return;
      }
      if (!data.mailConfigured) {
        setError("SMTP ist noch nicht vollständig konfiguriert.");
        return;
      }
      const sent = data.sent ?? 0;
      const skipped = data.skipped ?? 0;
      setMessage(
        sent
          ? `${sent} Fälligkeits-Mail${sent === 1 ? "" : "s"} gesendet${
              skipped ? `, ${skipped} ohne hinterlegte Adresse übersprungen` : ""
            }.`
          : skipped
            ? `Keine neuen Mails. ${skipped} Einträge ohne hinterlegte Adresse übersprungen.`
            : "Keine neuen Fälligkeiten.",
      );
    } catch {
      setError("Prüfung fehlgeschlagen.");
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
            Eine SMTP-Konfiguration für das gesamte Tool. Fällige Einträge aus
            Meetings, Aufgaben, Serviceboard, Projekten und Dienstreisen werden
            an hinterlegte Mailadressen geschickt. Wird eine Karte im Serviceboard
            einer Spalte mit Bearbeiter zugewiesen, geht zusätzlich eine Mail an
            diese Adresse. Vorlagen pflegst du in der Registerkarte
            „Mail-Vorlagen“. Zugangsdaten liegen lokal in{" "}
            <code>data/smtp-config.json</code>. Bei OVH muss der SMTP-Benutzer
            ein echtes Postfach sein (keine Alias-Adresse wie postmaster@), und
            der Absender dieselbe Adresse.
          </p>
        </div>
        <span className={`smtp-status-badge ${configured ? "is-ok" : ""}`}>
          {configured ? "SMTP bereit" : "Nicht konfiguriert"}
        </span>
      </header>

      <div className="entry-group-tabs smtp-tabs">
        <button
          type="button"
          className={`soft-tab ${tab === "smtp" ? "is-active" : ""}`}
          onClick={() => setTab("smtp")}
        >
          Verbindung
        </button>
        <button
          type="button"
          className={`soft-tab ${tab === "templates" ? "is-active" : ""}`}
          onClick={() => setTab("templates")}
        >
          Mail-Vorlagen
        </button>
      </div>

      {tab === "templates" ? (
        <SmtpTemplatesPanel canManage={canManage} testTo={testTo || userName} />
      ) : (
        <>
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
              disabled={!canManage}
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
        <p className="smtp-ok" style={{ marginTop: 12 }}>
          OVH: Host <code>smtp.mail.ovh.net</code>, Port 465, SSL an. Benutzer =
          vollständige Mailbox aus dem Kundencenter, nicht nur ein Alias.
        </p>
      </section>

      <section className="content-card smtp-card">
        <form className="smtp-form" onSubmit={onSave}>
          <label>
            <span>SMTP-Host</span>
            <input
              value={host}
              disabled={!canManage}
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
                disabled={!canManage}
                onChange={(event) => setPort(Number(event.target.value) || 587)}
                required
              />
            </label>
            <label className="smtp-check">
              <input
                type="checkbox"
                checked={secure}
                disabled={!canManage}
                onChange={(event) => setSecure(event.target.checked)}
              />
              <span>SSL/TLS (meist Port 465)</span>
            </label>
          </div>
          <label>
            <span>Benutzer (meist deine E-Mail)</span>
            <input
              value={userName}
              disabled={!canManage}
              onChange={(event) => setUserName(event.target.value)}
              placeholder="info@firma.de"
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
              disabled={!canManage}
              onChange={(event) => setPass(event.target.value)}
              placeholder={hasPassword ? "••••••••" : "SMTP-/App-Passwort"}
              autoComplete="new-password"
            />
          </label>
          <label>
            <span>Absender (From) – muss zum SMTP-Benutzer gehören</span>
            <input
              value={from}
              disabled={!canManage}
              onChange={(event) => setFrom(event.target.value)}
              placeholder="info@firma.de"
            />
          </label>
          {isLikelyAliasMailbox(userName) ? (
            <p className="smtp-error">
              Adressen wie postmaster@ sind bei OVH oft nur Weiterleitungen.
              SMTP verlangt ein echtes Postfach aus Web Cloud → E-Mails (z. B.
              info@…). Mit einem Alias kommt 535 Authentication failed.
            </p>
          ) : null}
          {from.trim() &&
          userName.trim() &&
          from.replace(/.*<|>.*/g, "").toLowerCase() !== userName.toLowerCase() ? (
            <p className="smtp-error">
              Absender weicht vom SMTP-Benutzer ab. OVH lehnt das in der Regel
              ab. Entweder From auf die Login-Adresse setzen oder mit dem
              gewünschten Postfach anmelden. Eine abweichende Adresse wird nur
              als Reply-To verwendet.
            </p>
          ) : null}

          {error ? <p className="smtp-error">{error}</p> : null}
          {message ? <p className="smtp-ok">{message}</p> : null}

          <div className="smtp-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!canManage || busy}
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
            disabled={!canManage}
            onChange={(event) => setTestTo(event.target.value)}
            placeholder="empfaenger@firma.de"
          />
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!canManage || busy || !testTo}
            onClick={() => void onTest()}
          >
            Test senden
          </button>
        </div>
      </section>

      <section className="content-card smtp-card">
        <div className="content-card-head">
          <div>
            <h2>Fälligkeiten jetzt prüfen</h2>
            <p>
              Sendet fällige Mails an hinterlegte Adressen (Meetings, Aufgaben,
              Serviceboard, Projekte, Dienstreisen). Zuweisungen im Serviceboard
              werden sofort beim Verschieben in eine Bearbeiter-Spalte verschickt.
              Der Lauf startet sonst automatisch, sobald jemand angemeldet ist.
            </p>
          </div>
        </div>
        <div className="smtp-actions">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!canManage || busy || !configured}
            onClick={() => void onProcessNow()}
          >
            Jetzt prüfen
          </button>
        </div>
      </section>
        </>
      )}
    </div>
  );
}
