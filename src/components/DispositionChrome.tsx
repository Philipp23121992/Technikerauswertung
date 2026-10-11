"use client";

import { EditLockBanner } from "./EditAccessControls";

export function DispositionChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="disposition-module">
      <EditLockBanner />
      {children}
    </div>
  );
}
