# APM Servicetools / Fieldflow — Integration

Eine Next.js-Anwendung mit allen Apps in einem Projekt. Kein Monorepo, keine getrennten App-Ordner.

## Projektordner

```
C:\Users\Administrator\Documents\GitHub\New folder\Technikerauswertung
```

Produktion: [https://www.apm-servicetools.de](https://www.apm-servicetools.de) (Node auf Port 3002, IIS Reverse-Proxy).

| Pfad | Inhalt |
|------|--------|
| `src/app/` | Seiten (UI) und API-Routen |
| `src/components/` | UI der einzelnen Apps |
| `src/lib/` | Fachlogik, JSON-DBs, Auth |
| `src/sla/` | SLA-Auswertung |
| `data/` | Betriebsdaten (JSON) |
| `scripts/` | Server-Start (`run-server.cmd`) |
| `package.json` | Start: `npm run start` → Port 3002 |

Separates älteres Projekt (nicht das Gesamttableau): `C:\Users\Administrator\Documents\GitHub\techniker-finder`

## Apps (Module)

| App-ID | Name | UI-Pfad |
|--------|------|---------|
| `finder` | Techniker Finder | `/finder` |
| `auswertung` | Technikerauswertung | `/gefahren` |
| `sla` | SLA Auswertung | `/sla` |
| `meetings` | Meetings | `/meetings` |
| `wissen` | Wissensdatenbank | `/wissen` |
| `verwaltung` | Verwaltung Philipp | `/verwaltung/aufgaben` |
| `technikerverwaltung` | Technikerverwaltung | `/technikerverwaltung` |
| `urlaube` | Urlaube | `/urlaube/techniker` |
| `serviceboard` | Serviceboard | `/serviceboard` |
| `garantiefaelle` | Garantiefälle | `/garantiefaelle` |
| `admin` | Benutzerverwaltung | `/benutzer` |

App-IDs und Rechte: `src/lib/auth/types.ts` (`APP_IDS`). Login ist Pflicht; öffentliche Apps gibt es nicht.

## Einbindung in andere Software

**Empfohlen:** die laufende Instanz verlinken oder per iframe einbetten.

```
https://www.apm-servicetools.de/<ui-pfad>
```

Beispiel Finder: `https://www.apm-servicetools.de/finder`

Es gibt kein npm-Paket und keine Embed-SDK. Die andere Software spricht HTTP gegen diese Origin (Session-Cookie nach Login).

### API (gleiche Origin)

| Bereich | Basis |
|---------|--------|
| Session | `/api/auth/session`, `/api/auth/edit` |
| Benutzer | `/api/users` |
| Finder | `/api/finder/search`, `/api/finder/entries` |
| SLA | `/api/sla/state`, `/api/sla/health` |
| Serviceboard | `/api/serviceboard` |
| Urlaube | `/api/urlaube` |
| Verwaltung | `/api/aufgaben`, `/api/dienstreisen`, `/api/projekte` |
| Garantiefälle | `/api/garantiefaelle` |
| Technikerverwaltung | `/api/technikerverwaltung` |
| Wissen | `/api/wissen/docs`, `/api/wissen/chat` |
| Meetings / Mail | `/api/meetings/remind`, `/api/mail/smtp` |
| Backup | `/api/backup` |

Routen liegen unter `src/app/api/`.

## Daten

Aktuell speichern die Apps überwiegend JSON unter `data/` (kein Schema in MySQL). MySQL ist auf dem Server vorbereitet:

| | |
|---|---|
| Host | `db.apm-servicetools.de` |
| Port | `3306` |
| Datenbank | `FieldflowDB` |
| Bindung | lokal auf diesem Server (nicht öffentlich) |

## Weitere Docs

- [docs/AUFBAU.md](./docs/AUFBAU.md) — Schichten, Shell, Datenfluss
- [docs/ORDNERSTRUKTUR.md](./docs/ORDNERSTRUKTUR.md) — Verzeichnisse
- [docs/APPS.md](./docs/APPS.md) — Module, URLs, Dateien

## Lokal starten

```bash
cd "C:\Users\Administrator\Documents\GitHub\New folder\Technikerauswertung"
npm install
npm run build
npm run start
```

Erreichbar unter `http://localhost:3002`.
