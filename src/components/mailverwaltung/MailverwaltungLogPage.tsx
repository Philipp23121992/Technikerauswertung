"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { fetchMailState, formatWhen, type MailverwaltungState } from "./types";

export function MailverwaltungLogPage() {
  const { hasApp } = useAuth();
  const [state, setState] = useState<MailverwaltungState | null>(null);

  const load = useCallback(async () => {
    setState(await fetchMailState());
  }, []);

  useEffect(() => {
    if (hasApp("mailverwaltung")) void load();
  }, [hasApp, load]);

  if (!hasApp("mailverwaltung")) {
    return (
      <div className="page-panel">
        <h1>Keine Berechtigung</h1>
      </div>
    );
  }
  if (!state) return <div className="page-panel">Lade Protokoll…</div>;

  return (
    <div className="page-panel">
      <header className="section-header">
        <div>
          <h1>Protokoll</h1>
          <p>Sortierung, Archivierung, Datei-Handling, Priorisierung und API-Fehler.</p>
        </div>
      </header>
      <div className="content-card">
        <ul className="mv-log">
          {state.logs.map((item) => (
            <li key={item.id}>
              <span>{formatWhen(item.at)}</span>
              <strong>{item.action}</strong>
              <em>{item.message}</em>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
