# Aufbau

APM Servicetools (Fieldflow) ist **eine** Next.js-App. Alle Tools sind Module derselben Anwendung, nicht eigenständige Programme.

```
Browser
  └── AppShell (Auth, Sidebar, App-Chrome)
        └── Seite unter src/app/...
              └── API unter src/app/api/...
                    └── src/lib/...  +  JSON in data/
```

Produktion: Next.js auf Port **3002**, davor IIS auf **https://www.apm-servicetools.de**.

## Schichten

| Schicht | Ort | Aufgabe |
|---------|-----|---------|
| Routing / UI-Seiten | `src/app/` | App Router: eine `page.tsx` pro URL |
| API | `src/app/api/` | JSON-Endpunkte, Session, CRUD |
| Oberfläche | `src/components/` | Seiten, Sidebar, Login, App-Chrome |
| SLA-Modul | `src/sla/` | eigenes Store/UI, Daten über `/api/sla` |
| Fachlogik | `src/lib/` | Typen, JSON-DB, Auth, Importe |
| Daten | `data/` | eine JSON-Datei pro Fachbereich |
| Start | `scripts/run-server.cmd` | `npm start` nach Reboot |

## Shell

`src/app/layout.tsx` umhüllt alles mit `AppShell`:

1. `AuthProvider` — Login, Cookie `apm_session`
2. `EditAccessProvider` — Schreibrechte
3. `DatasetProvider` / `TrackerProvider` — Auswertung lokal im Browser
4. `AuthGate` — unbekannte App-Pfade → Login
5. Nach Login: `Sidebar` + App-spezifisches Chrome (z. B. `AuswertungChrome`)

Welche App ein Pfad ist, steht in `src/lib/auth/types.ts` (`pathToAppId`, `APP_IDS`).

## Datenfluss

Die meisten Apps arbeiten so:

```
UI-Komponente  →  fetch /api/...  →  route.ts  →  src/lib/<modul>/db.ts  →  data/<modul>-db.json
```

JSON wird über `src/lib/atomic-write.ts` geschrieben.

Ausnahmen:

- **Technikerauswertung** (`TrackerProvider`): zusätzlich Browser-`localStorage` und Snapshot `data/tracker-snapshot.json`
- **SLA**: Zustand in `data/sla-db.json` über `/api/sla/state`, UI-Store in `src/sla/store/`
- **MySQL `FieldflowDB`**: auf dem Server vorbereitet, von den Apps noch nicht als Hauptspeicher genutzt

## Auth

- Benutzer: `data/users-db.json`
- Passwort: Salt + Hash in `src/lib/auth/password.ts`
- Session: HMAC-Cookie, 30 Tage (`src/lib/auth/session.ts`)
- Pro Benutzer: Liste von `AppId` + Flag `canEdit`

## Weitere Docs

- [ORDNERSTRUKTUR.md](./ORDNERSTRUKTUR.md) — Verzeichnisse und Dateien
- [APPS.md](./APPS.md) — Module, URLs, Dateien
- [../INTEGRATION.md](../INTEGRATION.md) — Einbindung in andere Software
