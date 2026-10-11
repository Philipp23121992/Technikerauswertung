"use client";

import { EditLockBanner } from "./EditAccessControls";

export function KostenvoranschlaegeChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="kostenvoranschlaege-module">
      <EditLockBanner />
      {children}
    </div>
  );
}
