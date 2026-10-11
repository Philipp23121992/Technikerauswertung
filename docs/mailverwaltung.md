# Mailverwaltung

Modul unter **Tools Philipp → Mailverwaltung**. Es hängt in der bestehenden Next.js-App (gleiche Auth, Sidebar, JSON-Daten wie die anderen Tools). Ein separates NestJS/PostgreSQL/Prisma-Projekt würde ein zweites Login, einen zweiten Prozess und keine gemeinsame Oberfläche bedeuten.

## Architektur

```
UI (React)
  → /api/mailverwaltung/*
    → services: sync, classify, imap, graph
    → data/mailverwaltung-db.json
    → data/mailverwaltung-secrets.json (IMAP-Passwörter / Graph-Secret, gitignored)
    → data/mailverwaltung-tokens.json (OAuth, gitignored)
```

| Schicht | Umsetzung |
|---|---|
| UI | `src/components/mailverwaltung/*` |
| API / Controller | `src/app/api/mailverwaltung/*` |
| Services | `src/lib/mailverwaltung/{sync,classify,imap,graph}.ts` |
| Models | `src/lib/mailverwaltung/types.ts` |
| Persistenz | JSON (`data/mailverwaltung-db.json`) |
| Worker | `MailverwaltungSync` alle 5 Minuten + Button „Jetzt synchronisieren“ |
| KI | Regelbasiertes Modell in `classify.ts` (Absenderrolle, Text, Anhänge, Historie) |
| Postfach | **IMAP** (Benutzername/Passwort) oder optional Microsoft Graph |

## Datenmodell

- **Mailbox** – Postfach, Sync-Status, IMAP- oder Graph-Verbindung
- **SenderFolder** – dynamischer Absenderordner je Postfach
- **MailMessage** – Status neu / in Bearbeitung / erledigt, KI-Priorität, Archivflag
- **MailFile** – klassifizierte Anhänge (Rechnung, Vertrag, Formular, Bild, Bericht, Sonstiges)
- **MailLog** – Sortierung, Archiv, Dateien, Priorität, Sync, Fehler

Erledigte Mails werden lokal archiviert und, wenn verbunden, nach `APM Mailverwaltung / {Absender} / Archiv` auf dem Mailserver verschoben.

## Postfach ohne Graph (empfohlen)

ACP/Microsoft 365 gibt Graph oft nicht frei. Dann IMAP nutzen:

1. Mailverwaltung → Einstellungen → **Per IMAP verbinden**
2. Host, Port, Benutzer, Passwort eintragen
3. Optional **Nur testen**, dann **Speichern und synchronisieren**
4. Posteingang → **Jetzt synchronisieren**

Typische Server:

| Anbieter | Host | Port |
|---|---|---|
| Microsoft 365 | `outlook.office365.com` | 993 SSL |
| OVH | `ssl0.ovh.net` | 993 SSL |

Wenn Microsoft 365 **auch IMAP** sperrt: ACP-Posteingang auf ein eigenes Postfach weiterleiten (z. B. OVH) und dieses per IMAP anbinden.

## Graph (optional, braucht IT-Freigabe)

1. Azure Portal → App-Registrierung (Multitenant oder eigener Tenant)
2. Redirect URI: `https://www.apm-servicetools.de/api/mailverwaltung/oauth/callback`
3. Geheimnis erzeugen
4. In Mailverwaltung → Einstellungen: Tenant, Client-ID, Secret, Redirect URI speichern
5. Pro Postfach **Graph / Outlook**

Ohne Verbindung laufen die **Beispieldaten** (zwei Postfächer) vollständig in der UI.

## Starten

```bat
cd "C:\Users\Administrator\Documents\GitHub\New folder\Technikerauswertung"
npm install
set NODE_OPTIONS=--max-old-space-size=4096
npm run build
```

Danach geplanten Task **APMServicetools** neu starten (Port 3002). Im Browser: **Tools Philipp → Mailverwaltung**.

Lokal zum Entwickeln: `npm run dev` (Port 3002).
