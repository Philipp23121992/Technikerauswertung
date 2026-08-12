"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useTracker } from "./TrackerProvider";

const NAV_ITEMS = [
  {
    href: "/gefahren",
    label: "Gefahrene Tickets",
    description: "Erfassung & Auswertung",
    icon: "truck",
  },
  {
    href: "/offen",
    label: "Offene Tickets Gesamt",
    description: "Monatsübersicht & Import",
    icon: "bars",
  },
  {
    href: "/touren",
    label: "Geplante Touren Fieldservice",
    description: "Monatsübersicht & Import",
    icon: "clipboard",
  },
  {
    href: "/techniker-db",
    label: "Techniker DB",
    description: "Techniker verwalten",
    icon: "users",
  },
  {
    href: "/kpi",
    label: "KPI Philipp",
    description: "Multi-Monats-Übersicht",
    icon: "trend",
  },
] as const;

function NavIcon({ type }: { type: (typeof NAV_ITEMS)[number]["icon"] }) {
  if (type === "truck") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="nav-icon">
        <path
          fill="currentColor"
          d="M3 7h11v8H3V7zm12 2h3.5L21 12.5V15h-6V9zM6 17.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm11 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"
        />
      </svg>
    );
  }
  if (type === "users") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="nav-icon">
        <path
          fill="currentColor"
          d="M9 11a3.5 3.5 0 1 0-3.5-3.5A3.5 3.5 0 0 0 9 11zm7.5-1a3 3 0 1 0-3-3 3 3 0 0 0 3 3zM9 13c-3.4 0-6.5 1.7-6.5 3.8V19h13v-2.2C15.5 14.7 12.4 13 9 13zm7.5 0c-.5 0-1 .05-1.5.14 1.5.9 2.5 2.1 2.5 3.66V19H22v-1.8c0-1.8-2.3-3.2-5.5-3.2z"
        />
      </svg>
    );
  }
  if (type === "clipboard") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="nav-icon">
        <path
          fill="currentColor"
          d="M9 3h6a2 2 0 0 1 2 2h1a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1a2 2 0 0 1 2-2zm0 2v1h6V5H9zm1 5h4v2h-4v-2zm0 4h7v2h-7v-2z"
        />
      </svg>
    );
  }
  if (type === "bars") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="nav-icon">
        <path fill="currentColor" d="M5 19h3V9H5v10zm5 0h3V5h-3v14zm5 0h3v-7h-3v7z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="nav-icon">
      <path fill="currentColor" d="M4 18V6h2v10.5L18 5l1.4 1.4L7.4 18H20v2H4z" />
    </svg>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { year } = useTracker();
  const [open, setOpen] = useState(false);

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
          <p className="sidebar-brand-name">Techniker-Auswertung</p>
          <p className="sidebar-brand-meta">{year}</p>
        </div>

        <nav className="sidebar-nav" aria-label="Hauptnavigation">
          {NAV_ITEMS.map((item) => {
            const active =
              pathname === item.href ||
              pathname.startsWith(`${item.href}/`) ||
              (item.href === "/gefahren" && (pathname === "/" || pathname === "/eingabe"));

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch
                className={`sidebar-link ${active ? "is-active" : ""}`}
                onClick={() => setOpen(false)}
              >
                <NavIcon type={item.icon} />
                <span className="sidebar-link-text">
                  <span className="sidebar-link-label">{item.label}</span>
                  <span className="sidebar-link-desc">{item.description}</span>
                </span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
