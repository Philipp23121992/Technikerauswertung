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

Es gibt keine Server-Datenbank. Betriebsdaten liegen im Browser-`localStorage` und zusätzlich als Snapshot:

- `public/data/tracker-snapshot.json` – historische Daten (Seed)
- Beim Start: Snapshot + lokaler Stand werden **zusammengeführt** (Historie bleibt, neue Einträge/Importe werden angefügt)
- Techniker-DB → **Daten exportieren** aktualisiert den Snapshot für GitHub

Importe überschreiben nur die betroffenen Techniker/Datum-Zellen; alle anderen Tage bleiben erhalten.
