import assert from "node:assert/strict";
import test from "node:test";
import { applyAelter3MailTemplate, formatAelter3TicketLine } from "./aelter-3-tage-mail";
import type { Aelter3TageStoredTicket } from "./aelter-3-tage-types";

function ticket(partial: Partial<Aelter3TageStoredTicket>): Aelter3TageStoredTicket {
  return {
    id: "a3-1",
    ticketNo: "T-1",
    technician: "Max",
    customer: "Kunde A",
    status: "",
    kennzeichen: "",
    lastAction: "",
    createdAt: "2026-10-01",
    zieltermin: "2026-10-05",
    wunschtermin: null,
    hasZieltermin: true,
    zielterminOverdue: true,
    wunschterminOverdue: false,
    ageDays: 7,
    ageWorkdays: 5,
    olderThanThreshold: true,
    overdueDays: 2,
    overdueZielWorkdays: 2,
    slaType: null,
    slaCustomerName: null,
    slaOverdueWorkdays: null,
    ersatzteileAngekommen: false,
    lidlBerechnen: false,
    umzugUmbauInstallation: false,
    skippedClosed: false,
    note: "",
    firstSeenAt: "",
    updatedAt: "",
    listStatus: "active",
    abgeschlossenSince: null,
    ...partial,
  };
}

test("formatAelter3TicketLine enthält Ticket, Kunde, Alter und Termine", () => {
  const line = formatAelter3TicketLine(ticket({}));
  assert.match(line, /T-1/);
  assert.match(line, /Kunde A/);
  assert.match(line, /5 AT/);
  assert.match(line, /Ziel:/);
});

test("applyAelter3MailTemplate ersetzt Platzhalter", () => {
  const out = applyAelter3MailTemplate("Hallo {{technicianName}}, {{ticketCount}}", {
    technicianName: "Erika",
    ticketCount: "3",
  });
  assert.equal(out, "Hallo Erika, 3");
});
