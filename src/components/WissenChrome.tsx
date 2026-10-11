"use client";

import { EditLockBanner } from "./EditAccessControls";

export function WissenChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="wissen-module">
      <EditLockBanner />
      {children}
    </div>
  );
}
