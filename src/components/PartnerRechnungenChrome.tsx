"use client";

import { EditLockBanner } from "./EditAccessControls";

export function PartnerRechnungenChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="partner-rechnungen-module">
      <EditLockBanner />
      {children}
    </div>
  );
}
