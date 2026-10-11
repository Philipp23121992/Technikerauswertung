"use client";

import { EditLockBanner } from "./EditAccessControls";

export function HpRechnungenChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="hp-rechnungen-module">
      <EditLockBanner />
      {children}
    </div>
  );
}
