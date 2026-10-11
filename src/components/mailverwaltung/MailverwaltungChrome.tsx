"use client";

import { EditLockBanner } from "@/components/EditAccessControls";

export function MailverwaltungChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="mailverwaltung-module">
      <EditLockBanner />
      {children}
    </div>
  );
}
