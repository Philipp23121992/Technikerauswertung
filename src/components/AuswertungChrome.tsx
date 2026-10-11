"use client";

import { EditLockBanner } from "./EditAccessControls";

export function AuswertungChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="auswertung-module">
      <EditLockBanner />
      {children}
    </div>
  );
}
