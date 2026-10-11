# Ordnerstruktur

Wurzel:

`C:\Users\Administrator\Documents\GitHub\New folder\Technikerauswertung`

```
Technikerauswertung/
├── docs/                      Aufbau-Dokumentation (diese Dateien)
├── src/
│   ├── app/                   Next.js App Router
│   │   ├── layout.tsx         Root-Layout + AppShell
│   │   ├── page.tsx           Start nach Login
│   │   ├── login/
│   │   ├── globals.css
│   │   ├── api/               HTTP-JSON-APIs
│   │   └── <app>/             eine Route-Gruppe pro Tool
│   ├── components/            UI: Shell, Login, App-Seiten
│   ├── lib/                   Logik, Typen, JSON-Zugriff, Auth
│   └── sla/                   SLA-Modul (Pages, Store, Matching)
├── data/                      JSON-Datenbanken (Laufzeit)
├── public/                    statische Dateien, Snapshot-Kopie
├── scripts/
│   └── run-server.cmd         Produktion: npm start
├── package.json               next start --port 3002
├── next.config.ts
├── INTEGRATION.md             Einbindung in andere Software
└── README.md
```

## `src/app/` — URLs

Jede `page.tsx` ist eine sichtbare Seite. `route.ts` unter `api/` ist ein Server-Endpunkt.

## `src/components/`

| Datei / Ordner | Rolle |
|----------------|--------|
| `AppShell.tsx` | Provider, Sidebar, App-Chrome |
| `Sidebar.tsx` | Navigation, gruppiert nach Kunden / Techniker / Serviceleitung |
| `AuthProvider.tsx` / `AuthGate.tsx` / `LoginPage.tsx` | Login |
| `finder/` | Techniker Finder |
| `meetings/` | Meetings, SMTP |
| `serviceboard/` | Kanban |
| `urlaube/` | Urlaub |
| `verwaltung/` | Aufgaben, Dienstreisen, Projekte |
| `technikerverwaltung/` | Stammdaten Techniker |
| `garantiefaelle/` | Garantiefälle |
| `wissen/` | Manuale + Chat |
| `*Chrome.tsx` | Kopfzeile/Nav innerhalb einer App |

Auswertungs-UI liegt direkt in `components/` (`TourenPage`, `EvaluationTab`, …).

## `src/lib/`

Ein Unterordner pro Fachbereich, typisch `db.ts` + `types.ts`:

```
lib/auth/          Session, User-DB, Guards
lib/finder/        PLZ-Suche, Geo, Einträge
lib/aufgaben/      Verwaltung Aufgaben
lib/dienstreisen/
lib/projekte/
lib/urlaube/
lib/serviceboard/
lib/garantiefaelle/
lib/technikerverwaltung/
lib/wissen/
lib/meetings/
lib/tracker.ts     Technikerauswertung
lib/sla-db.ts      SLA-JSON
lib/atomic-write.ts
```

## `data/` — JSON-DBs

| Datei | App |
|-------|-----|
| `users-db.json` | Benutzer |
| `finder-db.json` | Finder |
| `tracker-db.json` / `tracker-snapshot.json` | Auswertung |
| `sla-db.json` | SLA |
| `meetings-*.json` | Meetings |
| `serviceboard-db.json` | Serviceboard |
| `urlaube-db.json` | Urlaube |
| `aufgaben-db.json` | Aufgaben |
| `dienstreisen-db.json` | Dienstreisen |
| `projekte-db.json` | Projekte |
| `technikerverwaltung-db.json` | Technikerverwaltung |
| `garantiefaelle-db.json` | Garantiefälle |
| `wissen-db.json` | Wissen |
| `smtp-config.json` | Mail |

MySQL-Datenbank auf dem Server: `FieldflowDB` (Host `db.apm-servicetools.de`). Die App liest/schreibt aktuell die JSON-Dateien oben.
