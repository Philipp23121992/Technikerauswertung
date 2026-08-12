"use client";

import { DatasetProvider } from "./DatasetProvider";
import { Sidebar } from "./Sidebar";
import { TrackerProvider } from "./TrackerProvider";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <DatasetProvider>
      <TrackerProvider>
        <div className="shell">
          <Sidebar />
          <main className="shell-main">{children}</main>
        </div>
      </TrackerProvider>
    </DatasetProvider>
  );
}
