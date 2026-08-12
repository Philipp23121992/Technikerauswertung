"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { EditLockBanner } from "@/components/EditAccessControls";

const LINKS = [
  { href: "/finder", label: "PLZ-Suche", exact: true },
  { href: "/finder/standorte", label: "Standorte" },
  { href: "/finder/techniker", label: "Techniker-DB" },
  { href: "/finder/partner", label: "Partner-DB" },
] as const;

export function FinderChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <div className="finder-module">
      <header className="finder-subnav">
        <strong>Techniker Finder</strong>
        <nav aria-label="Finder-Navigation">
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
      {user ? <EditLockBanner /> : null}
      {children}
    </div>
  );
}
