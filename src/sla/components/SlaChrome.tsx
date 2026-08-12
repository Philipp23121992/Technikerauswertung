"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CloudOff,
  CloudUpload,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { EditLockBanner } from "@/components/EditAccessControls";
import { getApiBaseUrl } from "@/sla/lib/api";
import { useAppStore } from "@/sla/store/useAppStore";

const LINKS = [
  { href: "/sla/kunden", label: "Kunden & SLA" },
  { href: "/sla", label: "Auswertung", exact: true },
  { href: "/sla/bearbeitungszeit", label: "Bearbeitungszeit" },
  { href: "/sla/techniker", label: "Techniker" },
  { href: "/sla/import", label: "CSV Import" },
  { href: "/sla/zuordnung", label: "Zuordnung" },
] as const;

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
      <Icon size={14} className={syncStatus === "connecting" ? "spin" : undefined} />
      <span>{label}</span>
    </div>
  );
}

export function SlaChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="sla-module">
      <header className="finder-subnav">
        <strong>SLA Auswertung</strong>
        <nav aria-label="SLA-Navigation">
          {LINKS.map((item) => {
            const exact = "exact" in item && item.exact;
            const active = exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? "is-active" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <SyncBadge />
      </header>
      <EditLockBanner />
      {children}
    </div>
  );
}
