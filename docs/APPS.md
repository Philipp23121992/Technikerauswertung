# Apps

Jedes Modul hat: **App-ID** (Rechte), **UI-Pfade**, **API**, **Code**, **JSON**.

## Finder — `finder`

| | |
|---|---|
| UI | `/finder`, `/finder/standorte`, `/finder/techniker`, `/finder/partner` |
| API | `/api/finder/search`, `/api/finder/entries` |
| UI-Code | `src/components/finder/` |
| Logik | `src/lib/finder/` |
| Daten | `data/finder-db.json` |

PLZ-Nähessuche, Karte, Techniker- und Partnerstammdaten.

## Technikerauswertung — `auswertung`

| | |
|---|---|
| UI | `/gefahren`, `/offen`, `/touren`, `/techniker-db`, `/kpi`, `/eingabe`, `/auswertung`, `/import` |
| UI-Code | `src/components/` (Touren, KPI, Import, Tabs) |
| Logik | `src/lib/tracker.ts`, `evaluate`, `ticket-import` |
| Daten | `data/tracker-db.json`, `data/tracker-snapshot.json`, Browser-localStorage |
| Chrome | `AuswertungChrome.tsx` |

Tickets, Touren, offene Fälle, KPI. State über `TrackerProvider`.

## SLA Auswertung — `sla`

| | |
|---|---|
| UI | `/sla`, `/sla/import`, `/sla/kunden`, `/sla/techniker`, `/sla/zuordnung`, `/sla/bearbeitungszeit` |
| API | `/api/sla/state`, `/api/sla/health` |
| Code | `src/sla/` (Pages, Store, Matching) |
| Daten | `data/sla-db.json` |

Eigenes Mini-Frontend im gleichen Next-Prozess.

## Meetings — `meetings`

| | |
|---|---|
| UI | `/meetings`, `/meetings/ressourcen`, `/meetings/techniker-db`, `/meetings/smtp` |
| API | `/api/meetings/remind`, `/api/mail/smtp` |
| UI-Code | `src/components/meetings/` |
| Logik | `src/lib/meetings/`, `src/lib/mail.ts` |
| Daten | `data/meetings-*.json`, `data/smtp-config.json` |

## Serviceboard — `serviceboard`

| | |
|---|---|
| UI | `/serviceboard` |
| API | `/api/serviceboard`, `/api/serviceboard/process-reminders` |
| Code | `src/components/serviceboard/`, `src/lib/serviceboard/` |
| Daten | `data/serviceboard-db.json` |

## Urlaube — `urlaube`

| | |
|---|---|
| UI | `/urlaube/techniker`, `/urlaube/serviceleitung` |
| API | `/api/urlaube` |
| Code | `src/components/urlaube/`, `src/lib/urlaube/` |
| Daten | `data/urlaube-db.json` |

## Technikerverwaltung — `technikerverwaltung`

| | |
|---|---|
| UI | `/technikerverwaltung` |
| API | `/api/technikerverwaltung` |
| Code | `src/components/technikerverwaltung/`, `src/lib/technikerverwaltung/` |
| Daten | `data/technikerverwaltung-db.json` |

## Garantiefälle — `garantiefaelle`

| | |
|---|---|
| UI | `/garantiefaelle` |
| API | `/api/garantiefaelle` |
| Code | `src/components/garantiefaelle/`, `src/lib/garantiefaelle/` |
| Daten | `data/garantiefaelle-db.json` |

## Verwaltung Philipp — `verwaltung`

| | |
|---|---|
| UI | `/verwaltung/aufgaben`, `/verwaltung/dienstreisen`, `/verwaltung/projekte` |
| API | `/api/aufgaben`, `/api/dienstreisen`, `/api/projekte` |
| Code | `src/components/verwaltung/`, `src/lib/aufgaben/`, `dienstreisen/`, `projekte/` |
| Daten | `data/aufgaben-db.json`, `dienstreisen-db.json`, `projekte-db.json` |

## Wissensdatenbank — `wissen`

| | |
|---|---|
| UI | `/wissen`, `/wissen/chatbot` |
| API | `/api/wissen/docs`, `/api/wissen/chat` |
| Code | `src/components/wissen/`, `src/lib/wissen/` |
| Daten | `data/wissen-db.json` |

## Benutzer — `admin`

| | |
|---|---|
| UI | `/benutzer` |
| API | `/api/users`, `/api/auth/session`, `/api/auth/edit` |
| Code | `src/components/UsersAdminPage.tsx`, `src/lib/auth/` |
| Daten | `data/users-db.json` |

## Querschnitt

- Backup: `/api/backup` → `src/app/api/backup/route.ts`
- Login: `/login`
- Sync-Hilfeseite: `/sync-local`
