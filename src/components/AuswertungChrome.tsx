"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { EditLockBanner } from "./EditAccessControls";

const LINKS = [
  { href: "/gefahren", label: "Gefahrene Tickets" },
  { href: "/offen", label: "Offene Tickets" },
  { href: "/touren", label: "Geplante Touren" },
  { href: "/techniker-db", label: "Techniker DB" },
  { href: "/kpi", label: "KPI Philipp" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/gefahren") {
    return (
      pathname === "/gefahren" ||
      pathname === "/eingabe" ||
      pathname === "/auswertung" ||
      pathname === "/import"
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AuswertungChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="auswertung-module">
      <header className="finder-subnav">
        <strong>Technikerauswertung</strong>
        <nav aria-label="Auswertung-Navigation">
          {LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={isActive(pathname, item.href) ? "is-active" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <EditLockBanner />
      {children}
    </div>
  );
}
