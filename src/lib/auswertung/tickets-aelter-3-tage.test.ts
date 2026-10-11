import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyAelter3TageDb } from "./aelter-3-tage-types";
import { mergeTicketImport } from "./aelter-3-tage-db";
import {
  analyzeTicketsOlderThan,
  calendarDayDiff,
  DEFAULT_AGE_THRESHOLD_DAYS,
  kennzeichenHasLidlBerechnen,
  kennzeichenHasUmzugUmbauInstallation,
} from "./tickets-aelter-3-tage";
import type { ImportedDataset } from "@/lib/types";

function dataset(rows: Record<string, string>[]): ImportedDataset {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return {
    id: "test",
    fileName: "test.csv",
    importedAt: new Date(0).toISOString(),
    headers,
    rows,
    delimiter: ";",
  };
}

test("calendarDayDiff zählt Kalendertage", () => {
  assert.equal(calendarDayDiff("2026-10-01", "2026-10-05"), 4);
  assert.equal(calendarDayDiff("2026-10-01", "2026-10-04"), 3);
});

test("CSV-Auswertung markiert Tickets älter als 3 AT", () => {
  const result = analyzeTicketsOlderThan(
    dataset([
      {
        Ticketnummer: "T-100",
        Bearbeiter: "Max Mustermann",
        Kunde: "Firma A",
        Erstellt: "01.10.2026",
      },
      {
        Ticketnummer: "T-200",
        Bearbeiter: "Erika Muster",
        Kunde: "Firma B",
        Erstellt: "06.10.2026",
      },
      {
        Ticketnummer: "T-300",
        Bearbeiter: "Max Mustermann",
        Kunde: "Firma C",
        Erstellt: "06.10.2026",
        Status: "Geschlossen",
      },
    ]),
    "2026-10-07",
    DEFAULT_AGE_THRESHOLD_DAYS,
  );

  assert.equal(result.parsedRows, 2);
  assert.equal(result.skippedClosedRows, 1);
  assert.equal(result.olderCount, 1);
  assert.equal(result.withinCount, 1);
  const old = result.rows.find((row) => row.ticketNo === "T-100");
  const fresh = result.rows.find((row) => row.ticketNo === "T-200");
  assert.ok(old?.olderThanThreshold);
  assert.equal(old?.ageWorkdays, 4);
  assert.ok(fresh && !fresh.olderThanThreshold);
});

test("Kennzeichen und Zieltermin werden erkannt", () => {
  const result = analyzeTicketsOlderThan(
    dataset([
      {
        Ticketnummer: "T-1",
        Erstellt: "01.10.2026",
        Zieltermin: "03.10.2026",
        Kennzeichen: "Ersatzteile angekommen, Lidl Berechnen",
      },
      {
        Ticketnummer: "T-2",
        Erstellt: "01.10.2026",
        Kennzeichen: "Umzug Filiale",
      },
    ]),
    "2026-10-07",
    DEFAULT_AGE_THRESHOLD_DAYS,
  );

  const first = result.rows.find((row) => row.ticketNo === "T-1");
  const second = result.rows.find((row) => row.ticketNo === "T-2");
  assert.ok(first?.hasZieltermin);
  assert.ok(first?.zielterminOverdue);
  assert.ok(first?.ersatzteileAngekommen);
  assert.ok(first?.lidlBerechnen);
  assert.ok(second?.umzugUmbauInstallation);
});

test("Wunschtermin wird erkannt wenn kein Zieltermin gesetzt ist", () => {
  const result = analyzeTicketsOlderThan(
    dataset([
      {
        Ticketnummer: "T-8",
        Erstellt: "01.10.2026",
        Wunschtermin: "10.10.2026",
      },
    ]),
    "2026-10-07",
    DEFAULT_AGE_THRESHOLD_DAYS,
  );
  assert.equal(result.wunschterminColumn, "Wunschtermin");
  assert.equal(result.rows[0]?.wunschtermin, "2026-10-10");
  assert.equal(result.rows[0]?.hasZieltermin, false);
  assert.equal(result.rows[0]?.wunschterminOverdue, false);
});

test("Wunschtermin überschritten ohne Zieltermin", () => {
  const result = analyzeTicketsOlderThan(
    dataset([
      {
        Ticketnummer: "T-10",
        Erstellt: "01.10.2026",
        Wunschtermin: "05.10.2026",
      },
    ]),
    "2026-10-07",
    DEFAULT_AGE_THRESHOLD_DAYS,
  );
  const row = result.rows[0];
  assert.ok(row?.wunschterminOverdue);
  assert.equal(row?.zielterminOverdue, false);
});

test("Letzte Aktion wird aus Spaltenname erkannt", () => {
  const result = analyzeTicketsOlderThan(
    dataset([
      {
        Ticketnummer: "T-9",
        Erstellt: "01.10.2026",
        "Letzte Aktion": "Techniker vor Ort",
      },
    ]),
    "2026-10-07",
    DEFAULT_AGE_THRESHOLD_DAYS,
  );
  assert.equal(result.lastActionColumn, "Letzte Aktion");
  assert.equal(result.rows[0]?.lastAction, "Techniker vor Ort");
});

test("Kennzeichen-Helfer", () => {
  assert.ok(kennzeichenHasLidlBerechnen("Lidl Berechnen"));
  assert.ok(kennzeichenHasUmzugUmbauInstallation("Installation Drucker"));
});

test("Import-Merge: fehlende Tickets zuerst Abgeschlossen, dann löschen", () => {
  const db = createEmptyAelter3TageDb();
  const first = analyzeTicketsOlderThan(
    dataset([
      { Ticketnummer: "A", Erstellt: "01.10.2026" },
      { Ticketnummer: "B", Erstellt: "01.10.2026" },
    ]),
    "2026-10-07",
    DEFAULT_AGE_THRESHOLD_DAYS,
  );
  const merged1 = mergeTicketImport(db, first.rows, { fileName: "a.csv", now: "2026-10-07T10:00:00.000Z" });
  assert.equal(merged1.stats.active, 2);

  const second = analyzeTicketsOlderThan(
    dataset([
      { Ticketnummer: "B", Erstellt: "01.10.2026" },
      { Ticketnummer: "C", Erstellt: "01.10.2026" },
    ]),
    "2026-10-07",
    DEFAULT_AGE_THRESHOLD_DAYS,
  );
  const merged2 = mergeTicketImport(merged1.db, second.rows, { fileName: "b.csv", now: "2026-10-08T10:00:00.000Z" });
  assert.equal(merged2.stats.added, 1);
  assert.equal(merged2.stats.movedToAbgeschlossen, 1);
  assert.equal(merged2.stats.removed, 0);
  assert.equal(merged2.stats.active, 2);
  assert.equal(merged2.stats.abgeschlossen, 1);
  const a = merged2.db.tickets.find((item) => item.ticketNo === "A");
  assert.equal(a?.listStatus, "abgeschlossen");

  const third = analyzeTicketsOlderThan(
    dataset([
      { Ticketnummer: "B", Erstellt: "01.10.2026" },
      { Ticketnummer: "C", Erstellt: "01.10.2026" },
    ]),
    "2026-10-07",
    DEFAULT_AGE_THRESHOLD_DAYS,
  );
  const merged3 = mergeTicketImport(merged2.db, third.rows, { fileName: "c.csv", now: "2026-10-09T10:00:00.000Z" });
  assert.equal(merged3.stats.removed, 1);
  assert.equal(merged3.db.tickets.some((item) => item.ticketNo === "A"), false);
});
