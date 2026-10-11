export type ParsedQuoteFields = {
  quoteNumber: string;
  processingNumber: string;
  quoteDate: string | null;
  validUntil: string | null;
  amount: string;
  currency: string;
  customer: string;
  contact: string;
  device: string;
  serialNumber: string;
  description: string;
  assignee: string;
  warnings: string[];
};

const MONTHS: Record<string, string> = {
  jan: "01",
  januar: "01",
  january: "01",
  feb: "02",
  februar: "02",
  february: "02",
  mar: "03",
  märz: "03",
  maerz: "03",
  march: "03",
  apr: "04",
  april: "04",
  mai: "05",
  may: "05",
  jun: "06",
  juni: "06",
  june: "06",
  jul: "07",
  juli: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  okt: "10",
  oct: "10",
  oktober: "10",
  october: "10",
  nov: "11",
  november: "11",
  dez: "12",
  dec: "12",
  dezember: "12",
  december: "12",
};

const TVDAU_RE = /\bTVDAU[A-Z0-9][A-Z0-9./-]{1,30}\b/i;
const TICKET_RE = /\b(20\d{2}-\d{3,8})\b/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function valueAfterLabels(text: string, labels: string[]): string {
  for (const label of labels) {
    const re = new RegExp(
      `${escapeRegExp(label)}\\s*[.:#\\-]*\\s*\\n?\\s*([^\\n]{1,180})`,
      "i",
    );
    const match = text.match(re);
    const value = match?.[1]?.replace(/\s{2,}/g, " ").trim() ?? "";
    if (value) return value;
  }
  return "";
}

function blockAfterLabels(text: string, labels: string[], maxChars = 280): string {
  for (const label of labels) {
    const re = new RegExp(
      `${escapeRegExp(label)}\\s*[.:#\\-]*\\s*([\\s\\S]{0,${maxChars}})`,
      "i",
    );
    const match = text.match(re);
    if (match?.[1]?.trim()) return match[1];
  }
  return "";
}

function parseAnyDate(value: string): string | null {
  if (!value) return null;
  const iso = value.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const de = value.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{2,4})\b/);
  if (de) {
    const day = de[1].padStart(2, "0");
    const month = de[2].padStart(2, "0");
    const year = de[3].length === 2 ? `20${de[3]}` : de[3];
    return `${year}-${month}-${day}`;
  }

  const named = value.match(
    /\b(\d{1,2})[.\-\s]+([A-Za-zÄÖÜäöüß]{3,9})[.\-\s,]+(\d{2,4})\b/,
  );
  if (named) {
    const month = MONTHS[named[2].toLowerCase()];
    if (month) {
      const day = named[1].padStart(2, "0");
      const year = named[3].length === 2 ? `20${named[3]}` : named[3];
      return `${year}-${month}-${day}`;
    }
  }

  return null;
}

function addDays(isoDate: string, days: number): string | null {
  const parsed = Date.parse(`${isoDate}T00:00:00`);
  if (!Number.isFinite(parsed)) return null;
  const next = new Date(parsed);
  next.setDate(next.getDate() + days);
  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, "0");
  const d = String(next.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function firstTicketReference(source: string): string {
  const matches = [...source.matchAll(TICKET_RE)].map((item) => item[1]);
  return matches.find((item) => !/^\d{4}-\d{2}-\d{2}$/.test(item)) ?? "";
}

/** Bearbeitungsnummer = „Ihre Referenz“, z. B. 2026-101332. */
function extractProcessingNumber(text: string, fileName: string): string {
  const block = blockAfterLabels(text, [
    "Ihre Anfrage / Ihre Referenz",
    "Ihre Referenz",
    "Ihre Anfrage",
    "Your Reference",
    "Your Ref",
  ]);
  return (
    firstTicketReference(block) ||
    firstTicketReference(text) ||
    firstTicketReference(fileName)
  );
}

/** KV- / Auftragsnummer = TVDAU… (Angebotsnummer). */
function extractQuoteNumber(text: string, fileName: string): string {
  const labeled = valueAfterLabels(text, [
    "Angebotsnummer",
    "Auftragsnummer",
    "Kostenvoranschlagsnummer",
    "Kostenvoranschlag-Nr.",
    "KV-Nummer",
    "KV-Nr.",
  ]);
  const fromLabel = labeled.match(TVDAU_RE)?.[0];
  if (fromLabel) return fromLabel.toUpperCase();

  const inText = text.match(TVDAU_RE);
  if (inText) return inText[0].toUpperCase();

  const inName = fileName.match(TVDAU_RE);
  return inName ? inName[0].toUpperCase() : "";
}

function extractQuoteDate(text: string): string | null {
  return parseAnyDate(
    blockAfterLabels(text, [
      "Angebotsdatum",
      "Kostenvoranschlagsdatum",
      "Angebot vom",
      "Datum des Angebots",
      "Quote Date",
      "Belegdatum",
      "Dokumentdatum",
    ]),
  );
}

function extractValidUntil(text: string, quoteDate: string | null): string | null {
  const labeled = parseAnyDate(
    blockAfterLabels(text, [
      "Angebot gültig bis",
      "Gültigkeitsdatum",
      "Gültig bis",
      "gültig bis",
      "Gültigkeit bis",
      "Valid until",
      "Valid to",
    ]),
  );
  if (labeled) return labeled;

  const daysMatch = text.match(
    /gültig(?:keitsdauer)?\s*(?:für|:)?\s*(\d{1,3})\s*(?:Tage|Tag|days?)/i,
  );
  if (daysMatch && quoteDate) {
    return addDays(quoteDate, Number(daysMatch[1]));
  }
  return null;
}

function extractAmount(text: string): { amount: string; currency: string } {
  const labeled = valueAfterLabels(text, [
    "Angebotsbetrag",
    "Gesamtbetrag",
    "Endbetrag",
    "Kostenvoranschlagssumme",
    "Summe brutto",
    "Bruttobetrag",
    "Total Amount",
    "Grand Total",
    "Total",
  ]);
  const source = labeled || text;
  const match = source.match(
    /(?:EUR|€|USD|\$)?\s*(\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})|\d+[.,]\d{2})\s*(?:EUR|€)?/i,
  );
  if (!match) return { amount: "", currency: "EUR" };
  const currency = /USD|\$/i.test(source) ? "USD" : "EUR";
  return { amount: match[1].replace(/\s/g, ""), currency };
}

/** Kundenname oben links, z. B. Rudolph Holding GmbH. */
function extractCustomerTopLeft(text: string): string {
  const stop = /^(kundennummer|angebotsnummer|angebotsdatum|ansprechpartner|ihre anfrage|ihre referenz)\b/i;
  const skip =
    /^(de|deutschland|germany|im auftragsfall|angebot|kostenvoranschlag|seite\b|acp print|print & mobility|apm servicetools)\b/i;
  const address =
    /^(d-\d{4,5}|[a-z]-\d{4,5}|\d{4,5}\s+\S+|.*\bstr\.|.*straße|.*strasse|.*weg\b|.*platz\b)/i;

  for (const raw of text.split("\n").slice(0, 16)) {
    const line = raw.replace(/\s{2,}/g, " ").trim();
    if (!line) continue;
    if (stop.test(line)) break;
    if (skip.test(line) || address.test(line) || line.length < 3) continue;
    if (/^https?:\/\//i.test(line) || /^tel\b/i.test(line)) continue;
    return line.slice(0, 140);
  }
  return "";
}

export function parseKostenvoranschlagText(
  rawText: string,
  fileName = "",
): ParsedQuoteFields {
  const text = rawText.replace(/\u0000/g, " ").replace(/\r/g, "\n");
  const warnings: string[] = [];
  const processingNumber = extractProcessingNumber(text, fileName);
  const quoteNumber = extractQuoteNumber(text, fileName);
  const quoteDate = extractQuoteDate(text);
  const validUntil = extractValidUntil(text, quoteDate);
  const { amount, currency } = extractAmount(text);
  const customer = extractCustomerTopLeft(text);

  if (!processingNumber) {
    warnings.push("Ihre Referenz (2026-…) konnte nicht erkannt werden.");
  }
  if (!quoteNumber) {
    warnings.push("TVDAU-Nummer konnte nicht erkannt werden.");
  }
  if (!customer) warnings.push("Kunde oben links konnte nicht erkannt werden.");
  if (!validUntil) warnings.push("Gültigkeitsdatum konnte nicht erkannt werden.");

  return {
    quoteNumber,
    processingNumber,
    quoteDate,
    validUntil,
    amount,
    currency,
    customer,
    contact: "",
    device: "",
    serialNumber: "",
    description: "",
    assignee: "",
    warnings,
  };
}
