"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { EditLockBanner } from "./EditAccessControls";

const LINKS = [
  { href: "/meetings", label: "Techniker Meeting", exact: true },
  { href: "/meetings/ressourcen", label: "Ressourcenmeeting" },
  { href: "/meetings/techniker-db", label: "Techniker DB" },
  { href: "/meetings/smtp", label: "E-Mail / SMTP" },
] as const;

export function MeetingsChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="meetings-module">
      <header className="finder-subnav">
        <strong>Meetings</strong>
        <nav aria-label="Meetings-Navigation">
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
      </header>
      <EditLockBanner />
      {children}
    </div>
  );
}
