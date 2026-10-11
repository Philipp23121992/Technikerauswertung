"use client";

import { EditLockBanner } from "./EditAccessControls";

export function UrlaubeChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="urlaube-module">
      <EditLockBanner />
      {children}
    </div>
  );
}
