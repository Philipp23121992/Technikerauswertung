"use client";

import { useEffect, useRef, useState } from "react";
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

/**
 * Schreibt alle Browser-Einträge (Auswertung + Meetings) auf den Server nach /data,
 * damit sie in GitHub und auf dem späteren Server verfügbar sind.
 */
export function LocalDataSync() {
  const ran = useRef(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    async function sync() {
      try {
        const payload = {
          source: "browser-autosync",
          exportedAt: new Date().toISOString(),
          tracker: readJsonLocal(TRACKER_STORAGE_KEY) ??
            readJsonLocal("technikerauswertung.tracker.v3"),
          meetingsTechniker: readJsonLocal(meetingStorageKey("techniker")),
          meetingsRessourcen: readJsonLocal(meetingStorageKey("ressourcen")),
          meetingsTechnicians: readJsonLocal(MEETINGS_TECHNICIANS_KEY),
        };

        const hasAnything =
          Boolean(payload.tracker) ||
          Boolean(payload.meetingsTechniker) ||
          Boolean(payload.meetingsRessourcen) ||
          Boolean(payload.meetingsTechnicians);

        if (!hasAnything) {
          // Server → Browser: falls lokal leer, Serverdaten laden
          const res = await fetch("/api/backup", { cache: "no-store" });
          if (!res.ok) return;
          const data = await res.json();
          if (data.tracker && !window.localStorage.getItem(TRACKER_STORAGE_KEY)) {
            window.localStorage.setItem(
              TRACKER_STORAGE_KEY,
              JSON.stringify(data.tracker),
            );
          }
          if (
            data.meetingsTechniker &&
            !window.localStorage.getItem(meetingStorageKey("techniker"))
          ) {
            window.localStorage.setItem(
              meetingStorageKey("techniker"),
              JSON.stringify(data.meetingsTechniker),
            );
          }
          if (
            data.meetingsRessourcen &&
            !window.localStorage.getItem(meetingStorageKey("ressourcen"))
          ) {
            window.localStorage.setItem(
              meetingStorageKey("ressourcen"),
              JSON.stringify(data.meetingsRessourcen),
            );
          }
          if (
            data.meetingsTechnicians &&
            !window.localStorage.getItem(MEETINGS_TECHNICIANS_KEY)
          ) {
            window.localStorage.setItem(
              MEETINGS_TECHNICIANS_KEY,
              JSON.stringify(data.meetingsTechnicians),
            );
          }
          return;
        }

        const res = await fetch("/api/backup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) return;
        const data = await res.json();
        setStatus(
          `Daten gesichert: ${data.stats?.trackerTickets ?? 0} Tickets, ${data.stats?.meetingsTechniker ?? 0}/${data.stats?.meetingsRessourcen ?? 0} Meetings`,
        );
        window.setTimeout(() => setStatus(null), 6000);
      } catch {
        /* ignore */
      }
    }

    void sync();
  }, []);

  if (!status) return null;
  return (
    <div className="local-sync-toast" role="status">
      {status}
    </div>
  );
}
