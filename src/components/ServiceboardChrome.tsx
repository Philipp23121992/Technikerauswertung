"use client";

import { EditLockBanner } from "./EditAccessControls";

export function ServiceboardChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="serviceboard-module">
      <EditLockBanner />
      {children}
    </div>
  );
}
