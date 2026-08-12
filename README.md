# Technikerauswertung

Next.js-App zur Erfassung und Auswertung von Fieldservice-/Onsite-Tickets.

## Start

```bash
npm install
npm run build
npm run start
```

App läuft auf http://localhost:3002

## Daten

Es gibt keine klassische Server-Datenbank. Alle Betriebsdaten liegen im Browser-`localStorage` (`technikerauswertung.tracker.v4`).

Mitgelieferter Snapshot:

- `public/data/tracker-snapshot.json` – Seed beim ersten Start ohne localStorage
- `data/tracker-snapshot.json` – Kopie fürs Repo

In der Techniker-DB: **Daten exportieren** → JSON herunterladen und bei Bedarf wieder als Snapshot committen.
