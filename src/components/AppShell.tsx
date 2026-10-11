"use client";

import { usePathname } from "next/navigation";
import { AppHeader } from "./AppHeader";
import { AuthGate } from "./AuthGate";
import { AuthProvider, useAuth } from "./AuthProvider";
import { ReleaseFlagsProvider } from "./ReleaseFlagsProvider";
import { AuswertungChrome } from "./AuswertungChrome";
import { DispositionChrome } from "./DispositionChrome";
import { DatasetProvider } from "./DatasetProvider";
import { EditAccessProvider } from "./EditAccessProvider";
import { LocalDataSync } from "./LocalDataSync";
import { MailReminderSync } from "./MailReminderSync";
import { MeetingsChrome } from "./MeetingsChrome";
import { GarantiefaelleChrome } from "./GarantiefaelleChrome";
import { HpRechnungenChrome } from "./HpRechnungenChrome";
import { PartnerRechnungenChrome } from "./PartnerRechnungenChrome";
import { KostenvoranschlaegeChrome } from "./KostenvoranschlaegeChrome";
import { ServiceboardChrome } from "./ServiceboardChrome";
import { Sidebar } from "./Sidebar";
import { TrackerProvider } from "./TrackerProvider";
import { TechnikerverwaltungChrome } from "./TechnikerverwaltungChrome";
import { UrlaubeChrome } from "./UrlaubeChrome";
import { VerwaltungChrome } from "./VerwaltungChrome";
import { WissenChrome } from "./WissenChrome";
import { LexmarkChrome } from "./LexmarkChrome";
import { MailverwaltungChrome } from "./mailverwaltung/MailverwaltungChrome";
import { MailverwaltungSync } from "./mailverwaltung/MailverwaltungSync";

function isAuswertungPath(pathname: string): boolean {
  return (
    pathname.startsWith("/gefahren") ||
    pathname.startsWith("/offen") ||
    pathname.startsWith("/touren") ||
    pathname.startsWith("/techniker-db") ||
    pathname.startsWith("/kpi") ||
    pathname.startsWith("/eingabe") ||
    pathname.startsWith("/auswertung") ||
    pathname.startsWith("/import") ||
    pathname.startsWith("/aelter-als-3-tage")
  );
}

function AppContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (isAuswertungPath(pathname)) {
    return <AuswertungChrome>{children}</AuswertungChrome>;
  }
  if (pathname.startsWith("/disposition")) {
    return <DispositionChrome>{children}</DispositionChrome>;
  }
  if (pathname.startsWith("/meetings")) {
    return <MeetingsChrome>{children}</MeetingsChrome>;
  }
  if (pathname.startsWith("/wissen")) {
    return <WissenChrome>{children}</WissenChrome>;
  }
  if (pathname.startsWith("/verwaltung")) {
    return <VerwaltungChrome>{children}</VerwaltungChrome>;
  }
  if (pathname.startsWith("/technikerverwaltung")) {
    return <TechnikerverwaltungChrome>{children}</TechnikerverwaltungChrome>;
  }
  if (pathname.startsWith("/urlaube")) {
    return <UrlaubeChrome>{children}</UrlaubeChrome>;
  }
  if (pathname.startsWith("/serviceboard")) {
    return <ServiceboardChrome>{children}</ServiceboardChrome>;
  }
  if (pathname.startsWith("/garantiefaelle")) {
    return <GarantiefaelleChrome>{children}</GarantiefaelleChrome>;
  }
  if (pathname.startsWith("/hp-rechnungen")) {
    return <HpRechnungenChrome>{children}</HpRechnungenChrome>;
  }
  if (pathname.startsWith("/partner-rechnungen")) {
    return <PartnerRechnungenChrome>{children}</PartnerRechnungenChrome>;
  }
  if (pathname.startsWith("/kostenvoranschlaege")) {
    return <KostenvoranschlaegeChrome>{children}</KostenvoranschlaegeChrome>;
  }
  if (pathname.startsWith("/mailverwaltung")) {
    return <MailverwaltungChrome>{children}</MailverwaltungChrome>;
  }
  if (pathname.startsWith("/lexmark")) {
    return <LexmarkChrome>{children}</LexmarkChrome>;
  }
  return children;
}

function ShellFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const { user } = useAuth();
  const isLogin = pathname === "/login";
  const showShell = !isLogin && Boolean(user);

  if (!showShell) {
    return <>{children}</>;
  }

  return (
    <div className="shell">
      <Sidebar />
      <div className="shell-body">
        <AppHeader />
        <main className="shell-main">
          <LocalDataSync />
          <MailReminderSync />
          <MailverwaltungSync />
          <AppContent>{children}</AppContent>
        </main>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <EditAccessProvider>
        <ReleaseFlagsProvider>
          <DatasetProvider>
            <TrackerProvider>
              <AuthGate>
                <ShellFrame>{children}</ShellFrame>
              </AuthGate>
            </TrackerProvider>
          </DatasetProvider>
        </ReleaseFlagsProvider>
      </EditAccessProvider>
    </AuthProvider>
  );
}
