"use client";

import { useEffect, useState } from "react";
import { TRACKER_STORAGE_KEY } from "@/lib/tracker";
import { meetingStorageKey } from "@/lib/meetings/types";
import { MEETINGS_TECHNICIANS_KEY } from "@/lib/meetings/technicians";

function readJsonLocal(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function SyncLocalPage() {
  const [busy, setBusy] = useState(true);
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function run() {
      setBusy(true);
      setError("");
      try {
        const payload = {
          source: "sync-local-page",
          exportedAt: new Date().toISOString(),
          tracker:
            readJsonLocal(TRACKER_STORAGE_KEY) ??
            readJsonLocal("technikerauswertung.tracker.v3"),
          meetingsTechniker: readJsonLocal(meetingStorageKey("techniker")),
          meetingsRessourcen: readJsonLocal(meetingStorageKey("ressourcen")),
          meetingsTechnicians: readJsonLocal(MEETINGS_TECHNICIANS_KEY),
        };

        const res = await fetch("/api/backup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Sync fehlgeschlagen.");
          return;
        }
        setResult(
          `Gespeichert unter /data\n` +
            `• Tracker-Tickets: ${data.stats.trackerTickets}\n` +
            `• Tracker-Techniker: ${data.stats.trackerTechnicians}\n` +
            `• Meetings Techniker: ${data.stats.meetingsTechniker}\n` +
            `• Meetings Ressourcen: ${data.stats.meetingsRessourcen}\n` +
            `• Meeting-Techniker-DB: ${data.stats.meetingsTechnicians}\n\n` +
            `Diese Dateien können jetzt nach GitHub hochgeladen werden.`,
        );
      } catch {
        setError("Netzwerkfehler beim Sync.");
      } finally {
        setBusy(false);
      }
    }
    void run();
  }, []);

  return (
    <div className="page-panel">
      <header className="section-header">
        <div>
          <h1>Lokale Daten auf Server sichern</h1>
          <p>
            Überträgt Auswertung (Tickets) und Meetings aus diesem Browser nach{" "}
            <code>data/</code> für GitHub/Server.
          </p>
        </div>
      </header>
      <section className="content-card">
        {busy ? <p>Sichere lokale Einträge…</p> : null}
        {error ? <p className="wissen-error">{error}</p> : null}
        {result ? (
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{result}</pre>
        ) : null}
      </section>
    </div>
  );
}
