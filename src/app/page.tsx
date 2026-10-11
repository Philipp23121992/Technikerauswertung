"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import type { AppId } from "@/lib/auth/types";

const APPS: {
  href: string;
  title: string;
  text: string;
  appId: AppId;
}[] = [
  {
    href: "/finder",
    title: "Techniker Finder",
    text: "PLZ-Suche, Standortkarte sowie Techniker- und Partner-Kontakte.",
    appId: "finder",
  },
  {
    href: "/gefahren",
    title: "Technikerauswertung",
    text: "Gefahrene Tickets, Offene Tickets, Touren, Techniker-DB und KPI Philipp.",
    appId: "auswertung",
  },
  {
    href: "/disposition",
    title: "Disposition",
    text: "Wochenauslastung, Kanban und Tourenplanung für Fieldservice-Techniker.",
    appId: "disposition",
  },
  {
    href: "/sla",
    title: "SLA Auswertung",
    text: "Kunden-SLA, Ticket-Auswertung, Bearbeitungszeit und CSV-Import.",
    appId: "sla",
  },
  {
    href: "/meetings",
    title: "Meetings",
    text: "Techniker Meeting, Ressourcenmeeting und Techniker-DB.",
    appId: "meetings",
  },
  {
    href: "/wissen",
    title: "Wissensassistent",
    text: "Alttickets, Manuale/Leitfäden und Chatbot.",
    appId: "wissen",
  },
  {
    href: "/verwaltung/aufgaben",
    title: "Verwaltung Philipp",
    text: "Aufgaben, Dienstreisen, Projekte und Telefonnummern.",
    appId: "verwaltung",
  },
  {
    href: "/mailverwaltung",
    title: "Mailverwaltung",
    text: "Mehrere Outlook-Postfächer, Absenderordner, KI-Priorisierung und wichtige Dateien.",
    appId: "mailverwaltung",
  },
  {
    href: "/benutzer",
    title: "Benutzerverwaltung",
    text: "Benutzer anlegen und App-Freigaben vergeben.",
    appId: "admin",
  },
];

export default function HubHomePage() {
  const { hasApp, user } = useAuth();
  const visible = APPS.filter((app) => user && hasApp(app.appId));

  return (
    <div className="page-panel">
      <header className="section-header">
        <div>
          <h1>APM Servicetools</h1>
          <p>
            {user
              ? `Angemeldet als ${user.displayName}. Dir stehen ${visible.length} Bereiche zur Verfügung.`
              : "Bitte anmelden, um die Servicetools zu nutzen."}
          </p>
        </div>
        {!user ? (
          <Link href="/login" className="btn btn-primary">
            Anmelden
          </Link>
        ) : null}
      </header>

      <div className="hub-grid">
        {visible.map((app) => (
          <Link key={app.href} href={app.href} className="hub-card">
            <h2>{app.title}</h2>
            <p>{app.text}</p>
            <span>Öffnen →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
