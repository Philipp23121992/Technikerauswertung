"use client";

import { EditLockBanner } from "./EditAccessControls";

export function GarantiefaelleChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="garantiefaelle-module">
      <EditLockBanner />
      {children}
    </div>
  );
}
