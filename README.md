# Technikerauswertung (APM Servicetools / Fieldflow)

Next.js-App mit allen Service-Tools in **einem** Projektordner.

Produktion: https://www.apm-servicetools.de

**Einbindung in andere Software:** [INTEGRATION.md](./INTEGRATION.md)

**Aufbau (Ordner, Schichten, Apps):** [docs/AUFBAU.md](./docs/AUFBAU.md) · [docs/ORDNERSTRUKTUR.md](./docs/ORDNERSTRUKTUR.md) · [docs/APPS.md](./docs/APPS.md)

## Start

```bash
npm install
npm run build
npm run start
```

App läuft auf http://localhost:3002

## Daten

Betriebsdaten liegen primär als JSON unter `data/` (teilweise plus Browser-`localStorage`). Snapshot:

- `public/data/tracker-snapshot.json` – historische Daten (Seed)
- Beim Start: Snapshot + lokaler Stand werden **zusammengeführt** (Historie bleibt, neue Einträge/Importe werden angefügt)
- Techniker-DB → **Daten exportieren** aktualisiert den Snapshot für GitHub

Importe überschreiben nur die betroffenen Techniker/Datum-Zellen; alle anderen Tage bleiben erhalten.
