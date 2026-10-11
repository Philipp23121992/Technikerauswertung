"use client";

import {
  CloudOff,
  CloudUpload,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { EditLockBanner } from "@/components/EditAccessControls";
import { getApiBaseUrl } from "@/sla/lib/api";
import { useAppStore } from "@/sla/store/useAppStore";

function SyncBadge() {
  const syncStatus = useAppStore((state) => state.syncStatus);
  const syncError = useAppStore((state) => state.syncError);
  const lastSyncedAt = useAppStore((state) => state.lastSyncedAt);

  const label =
    syncStatus === "online"
      ? "Sync online"
      : syncStatus === "saving"
        ? "Speichern…"
        : syncStatus === "connecting"
          ? "Verbinde…"
          : syncStatus === "offline"
            ? "Sync offline"
            : "Sync-Fehler";

  const Icon =
    syncStatus === "online"
      ? RefreshCw
      : syncStatus === "saving"
        ? CloudUpload
        : syncStatus === "connecting"
          ? LoaderCircle
          : CloudOff;

  return (
    <div
      className={`sync-badge sync-${syncStatus}`}
      title={
        syncError ||
        `API: ${getApiBaseUrl() || "/api/sla"}${
          lastSyncedAt
            ? ` · Stand ${new Date(lastSyncedAt).toLocaleString("de-DE")}`
            : ""
        }`
      }
    >
      <Icon size={18} className={syncStatus === "connecting" ? "spin" : undefined} />
      <span>{label}</span>
    </div>
  );
}

export function SlaChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="sla-module">
      <header className="finder-subnav">
        <strong>SLA Auswertung</strong>
        <SyncBadge />
      </header>
      <EditLockBanner />
      {children}
    </div>
  );
}
