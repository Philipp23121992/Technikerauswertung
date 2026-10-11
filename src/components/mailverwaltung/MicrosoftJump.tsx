"use client";

import { useEffect } from "react";

export function MicrosoftJump({ url }: { url: string }) {
  useEffect(() => {
    window.location.replace(url);
  }, [url]);

  return (
    <div className="page-panel">
      <h1>Weiterleitung zu Microsoft…</h1>
      <p>Outlook-Anmeldung wird geöffnet. Falls nichts passiert, den Link unten nutzen.</p>
      <p>
        <a className="btn btn-primary" href={url}>
          Bei Microsoft anmelden
        </a>
      </p>
    </div>
  );
}
