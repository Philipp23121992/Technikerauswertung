"use client";

import { EditLockBanner } from "./EditAccessControls";

export function TechnikerverwaltungChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="technikerverwaltung-module">
      <EditLockBanner />
      {children}
    </div>
  );
}
