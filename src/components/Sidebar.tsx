"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "./AuthProvider";
import { EditAccessControls } from "./EditAccessControls";
import { useEditAccess } from "./EditAccessProvider";
import { SETTINGS_GROUP } from "./app-nav";
import { NavIcon } from "./NavIcon";

export function Sidebar() {
  const pathname = usePathname();
  const { user, hasApp, logout, homeHref } = useAuth();
  const { canEdit } = useEditAccess();
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
        {open ? "Menü schließen" : "Einstellungen"}
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
          <Link href={homeHref || "/"} className="sidebar-brand-link" onClick={() => setOpen(false)}>
            <img src="/acp-logo.png" alt="ACP Print & Mobility" className="sidebar-brand-logo" />
            <span className="sidebar-brand-name">APM</span>
          </Link>
        </div>

        <nav className="sidebar-nav" aria-label="Einstellungen">
          {SETTINGS_GROUP.items.map((item) => {
            const allowed = Boolean(user && hasApp(item.appId));
            const active = item.match(pathname);
            const className = `sidebar-icon-link${active ? " is-active" : ""}${allowed ? "" : " is-disabled"}`;
            const title = allowed
              ? `${item.label} · ${item.description}`
              : `${item.label} · keine Freigabe`;
            if (!allowed) {
              return (
                <span key={item.href} className={className} title={title} aria-disabled="true">
                  <NavIcon type={item.icon} />
                  <span className="sidebar-icon-label">{item.shortLabel || item.label}</span>
                </span>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch
                className={className}
                title={title}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                <NavIcon type={item.icon} />
                <span className="sidebar-icon-label">{item.shortLabel || item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-user">
          {user ? (
            <>
              <p className="sidebar-user-name" title={user.displayName}>
                {user.displayName}
              </p>
              <p className="sidebar-user-meta">
                {canEdit ? "Bearbeiten" : "Ansicht"}
              </p>
              <button type="button" className="edit-access-btn" onClick={() => void logout()}>
                Abmelden
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="edit-access-btn is-primary"
              onClick={() => setOpen(false)}
              style={{ textAlign: "center", textDecoration: "none" }}
            >
              Anmelden
            </Link>
          )}
        </div>

        {user && !canEdit ? <EditAccessControls /> : null}
      </aside>
    </>
  );
}
