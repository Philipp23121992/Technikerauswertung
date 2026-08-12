"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "./AuthProvider";
import { EditAccessControls } from "./EditAccessControls";
import { useEditAccess } from "./EditAccessProvider";
import { useTracker } from "./TrackerProvider";
import type { AppId } from "@/lib/auth/types";

const APPS: {
  href: string;
  match: (path: string) => boolean;
  label: string;
  description: string;
  icon: "map" | "truck" | "sla" | "meeting" | "wissen" | "users";
  appId: AppId;
}[] = [
  {
    href: "/finder",
    match: (path) => path.startsWith("/finder"),
    label: "Techniker Finder",
    description: "PLZ-Suche & Standorte",
    icon: "map",
    appId: "finder",
  },
  {
    href: "/gefahren",
    match: (path) =>
      path.startsWith("/gefahren") ||
      path.startsWith("/offen") ||
      path.startsWith("/touren") ||
      path.startsWith("/techniker-db") ||
      path.startsWith("/kpi") ||
      path.startsWith("/eingabe") ||
      path.startsWith("/auswertung") ||
      path.startsWith("/import"),
    label: "Technikerauswertung",
    description: "Tickets, Touren & KPI",
    icon: "truck",
    appId: "auswertung",
  },
  {
    href: "/sla",
    match: (path) => path.startsWith("/sla"),
    label: "SLA Auswertung",
    description: "Kunden, SLA & Import",
    icon: "sla",
    appId: "sla",
  },
  {
    href: "/meetings",
    match: (path) => path.startsWith("/meetings"),
    label: "Meetings",
    description: "Techniker & Ressourcen",
    icon: "meeting",
    appId: "meetings",
  },
  {
    href: "/wissen",
    match: (path) => path.startsWith("/wissen"),
    label: "Wissensassistent",
    description: "Manuale, Leitfäden & Chat",
    icon: "wissen",
    appId: "wissen",
  },
  {
    href: "/benutzer",
    match: (path) => path.startsWith("/benutzer"),
    label: "Benutzer",
    description: "Konten & Freigaben",
    icon: "users",
    appId: "admin",
  },
];

function NavIcon({ type }: { type: (typeof APPS)[number]["icon"] }) {
  if (type === "map") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="nav-icon">
        <path
          fill="currentColor"
          d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 14.5 9 2.5 2.5 0 0 1 12 11.5z"
        />
      </svg>
    );
  }
  if (type === "sla") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="nav-icon">
        <path
          fill="currentColor"
          d="M7 2h10v2h3v16H4V4h3V2zm2 2v2h6V4H9zm1 6h4v2h-4v-2zm0 4h7v2h-7v-2z"
        />
      </svg>
    );
  }
  if (type === "meeting") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="nav-icon">
        <path
          fill="currentColor"
          d="M8 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3zM2 19v-1c0-2.2 2.7-4 6-4s6 1.8 6 4v1H2zm12 0v-1c0-1.1.5-2.1 1.3-2.9A8.5 8.5 0 0 1 22 18v1H14z"
        />
      </svg>
    );
  }
  if (type === "wissen") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="nav-icon">
        <path
          fill="currentColor"
          d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 3.5 2.5 1.5L20 12l-1.5-1L13 14v2.5z"
        />
      </svg>
    );
  }
  if (type === "users") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="nav-icon">
        <path
          fill="currentColor"
          d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-7 8v-1c0-2.2 3.1-4 7-4s7 1.8 7 4v1H5zm14.5-9a2.5 2.5 0 1 0-2.5-2.5A2.5 2.5 0 0 0 19.5 11zM16 20v-.6c0-1-.3-1.9-.9-2.6A7.6 7.6 0 0 1 22 19.4V20h-6z"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="nav-icon">
      <path
        fill="currentColor"
        d="M3 7h11v8H3V7zm12 2h3.5L21 12.5V15h-6V9zM6 17.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm11 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"
      />
    </svg>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { year } = useTracker();
  const { user, hasApp, logout } = useAuth();
  const { canEdit } = useEditAccess();
  const [open, setOpen] = useState(false);
  const visibleApps = APPS.filter(
    (app) => app.appId === "finder" || (user && hasApp(app.appId)),
  );

  return (
    <>
      <button
        type="button"
        className="nav-toggle"
        aria-expanded={open}
        aria-controls="app-sidebar"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Menü schließen" : "Menü"}
      </button>

      {open ? (
        <button
          type="button"
          className="nav-backdrop"
          aria-label="Menü schließen"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside id="app-sidebar" className={`sidebar ${open ? "is-open" : ""}`}>
        <div className="sidebar-brand">
          <Link href="/finder" className="sidebar-brand-link" onClick={() => setOpen(false)}>
            <img
              src="/acp-logo.png"
              alt="ACP Print & Mobility"
              className="sidebar-brand-logo"
            />
            <span className="sidebar-brand-name">APM Servicetools</span>
          </Link>
          <p className="sidebar-brand-meta">
            {visibleApps.length} Apps · {year}
          </p>
        </div>

        <nav className="sidebar-nav" aria-label="Apps">
          {visibleApps.map((app) => {
            const active = app.match(pathname);
            return (
              <Link
                key={app.href}
                href={app.href}
                prefetch
                className={`sidebar-link ${active ? "is-active" : ""}`}
                onClick={() => setOpen(false)}
              >
                <NavIcon type={app.icon} />
                <span className="sidebar-link-text">
                  <span className="sidebar-link-label">{app.label}</span>
                  <span className="sidebar-link-desc">{app.description}</span>
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-user">
          {user ? (
            <>
              <p className="sidebar-user-name">{user.displayName}</p>
              <p className="sidebar-user-meta">
                @{user.username}
                {canEdit ? " · Bearbeiten" : " · Nur Ansicht"}
              </p>
              <button
                type="button"
                className="edit-access-btn"
                onClick={() => void logout()}
              >
                Abmelden
              </button>
            </>
          ) : (
            <>
              <p className="sidebar-user-name">Öffentlicher Zugang</p>
              <p className="sidebar-user-meta">Techniker Finder frei · Rest mit Login</p>
              <Link
                href="/login"
                className="edit-access-btn is-primary"
                onClick={() => setOpen(false)}
                style={{ textAlign: "center", textDecoration: "none" }}
              >
                Anmelden
              </Link>
            </>
          )}
        </div>

        {user && !canEdit ? <EditAccessControls /> : null}
      </aside>
    </>
  );
}
