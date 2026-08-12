"use client";

import { usePathname } from "next/navigation";
import { AuthGate } from "./AuthGate";
import { AuthProvider, useAuth } from "./AuthProvider";
import { AuswertungChrome } from "./AuswertungChrome";
import { DatasetProvider } from "./DatasetProvider";
import { EditAccessProvider } from "./EditAccessProvider";
import { MeetingsChrome } from "./MeetingsChrome";
import { Sidebar } from "./Sidebar";
import { TrackerProvider } from "./TrackerProvider";
import { WissenChrome } from "./WissenChrome";

function isAuswertungPath(pathname: string): boolean {
  return (
    pathname.startsWith("/gefahren") ||
    pathname.startsWith("/offen") ||
    pathname.startsWith("/touren") ||
    pathname.startsWith("/techniker-db") ||
    pathname.startsWith("/kpi") ||
    pathname.startsWith("/eingabe") ||
    pathname.startsWith("/auswertung") ||
    pathname.startsWith("/import")
  );
}

function AppContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (isAuswertungPath(pathname)) {
    return <AuswertungChrome>{children}</AuswertungChrome>;
  }
  if (pathname.startsWith("/meetings")) {
    return <MeetingsChrome>{children}</MeetingsChrome>;
  }
  if (pathname.startsWith("/wissen")) {
    return <WissenChrome>{children}</WissenChrome>;
  }
  return children;
}

function ShellFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const { user } = useAuth();
  const isLogin = pathname === "/login";
  const showShell =
    !isLogin &&
    (Boolean(user) ||
      pathname === "/" ||
      pathname === "" ||
      pathname.startsWith("/finder"));

  if (!showShell) {
    return <>{children}</>;
  }

  return (
    <div className="shell">
      <Sidebar />
      <main className="shell-main">
        <AppContent>{children}</AppContent>
      </main>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <EditAccessProvider>
        <DatasetProvider>
          <TrackerProvider>
            <AuthGate>
              <ShellFrame>{children}</ShellFrame>
            </AuthGate>
          </TrackerProvider>
        </DatasetProvider>
      </EditAccessProvider>
    </AuthProvider>
  );
}
