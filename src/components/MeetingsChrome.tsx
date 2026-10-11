"use client";

import { EditLockBanner } from "./EditAccessControls";

export function MeetingsChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="meetings-module">
      <EditLockBanner />
      {children}
    </div>
  );
}
