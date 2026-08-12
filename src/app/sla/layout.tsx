"use client";

import { SyncBootstrap } from "@/sla/components/SyncBootstrap";

/** Persistenter SLA-Sync über alle /sla-Routen hinweg. */
export default function SlaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SyncBootstrap />
      {children}
    </>
  );
}
