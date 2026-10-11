import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanMailSubject,
  htmlToText,
  isMailDragTypes,
  isMailFileName,
  parseMailBytesToTaskDraft,
  parseMailTextToTaskDraft,
} from "./mail-import";

const SAMPLE_EML = `From: Max Mustermann <max@example.com>
To: Philipp Heyser <philipp@example.com>
Subject: Re: CX725 wird nicht warm
Date: Wed, 24 Sep 2026 10:15:00 +0200
MIME-Version: 1.0
Importance: high
X-Priority: 1
Content-Type: text/plain; charset=UTF-8

Hallo,
bitte den Fuser prüfen. Fällig: 30.09.2026
Viele Grüße
Max
`;

test("erkennt Mail-Dateien und Drag-Types", () => {
  assert.equal(isMailFileName("ticket.eml"), true);
  assert.equal(isMailFileName("ticket.msg"), true);
  assert.equal(isMailFileName("foto.png"), false);
  assert.equal(isMailFileName("ohne", "message/rfc822"), true);
  assert.equal(isMailDragTypes(["Files", "text/plain"]), true);
  assert.equal(isMailDragTypes(["text/html", "text/plain"]), true);
  assert.equal(isMailDragTypes(["text/plain"]), false);
});

test("Betreff ohne Re/Fwd und HTML ohne Tags", () => {
  assert.equal(cleanMailSubject("AW: WG: Papierstau"), "Papierstau");
  assert.match(htmlToText("<p>Zeile 1</p><br>Zeile 2"), /Zeile 1/);
  assert.match(htmlToText("<p>Zeile 1</p><br>Zeile 2"), /Zeile 2/);
});

test("EML wird zu Aufgabe mit Betreff, Absender und Fälligkeit", async () => {
  const draft = await parseMailBytesToTaskDraft(Buffer.from(SAMPLE_EML), "cx725.eml");
  assert.equal(draft.title, "CX725 wird nicht warm");
  assert.match(draft.description, /Max Mustermann/);
  assert.match(draft.description, /Fuser prüfen/);
  assert.equal(draft.dueDate, "2026-09-30");
  assert.equal(draft.priority, "sehr-hoch");
});

test("HTML-Mail nutzt den Textkörper", async () => {
  const eml = `From: service@example.com
Subject: Papierstau CX725
MIME-Version: 1.0
Content-Type: text/html; charset=UTF-8

<p>Stau in <b>Kassette 1</b>.</p>
`;
  const draft = await parseMailBytesToTaskDraft(Buffer.from(eml), "stau.eml");
  assert.equal(draft.title, "Papierstau CX725");
  assert.match(draft.description, /Kassette 1/);
});

test("Outlook-Text ohne Datei wird trotzdem zur Aufgabe", () => {
  const draft = parseMailTextToTaskDraft({
    text: "Subject: Toner leer\nFrom: lager@example.com\n\nBitte Toner nachbestellen.",
    fileName: "Outlook",
  });
  assert.equal(draft.title, "Toner leer");
  assert.match(draft.description, /Toner nachbestellen/);
});
