"use client";

import { EditLockBanner } from "./EditAccessControls";

export function VerwaltungChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="verwaltung-module">
      <EditLockBanner />
      {children}
    </div>
  );
}
