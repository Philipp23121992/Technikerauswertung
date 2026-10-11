"use client";

import { EditLockBanner } from "./EditAccessControls";

export function LexmarkChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="lexmark-module">
      <EditLockBanner />
      {children}
    </div>
  );
}
