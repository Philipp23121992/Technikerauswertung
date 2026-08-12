"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { EditLockBanner } from "./EditAccessControls";

const LINKS = [
  { href: "/wissen", label: "Wissensdatenbank", exact: true },
  { href: "/wissen/chatbot", label: "Chatbot" },
] as const;

export function WissenChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="wissen-module">
      <header className="finder-subnav">
        <strong>Wissensassistent</strong>
        <nav aria-label="Wissens-Navigation">
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
