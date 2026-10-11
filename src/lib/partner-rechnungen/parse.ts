export type ParsedInvoiceFields = {
  invoiceNumber: string;
  creditNoteNumber: string;
  invoiceDate: string | null;
  dueDate: string | null;
  amount: string;
  currency: string;
  customer: string;
  ticketNumber: string;
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function valueAfterLabels(text: string, labels: string[]): string {
  for (const label of labels) {
    const re = new RegExp(
      `${escapeRegExp(label)}\\s*[:#\\-]?\\s*\\n?\\s*([^\\n]{1,160})`,
      "i",
    );
    const match = text.match(re);
    const value = match?.[1]?.replace(/\s{2,}/g, " ").trim() ?? "";
    if (value) return value;
  }
  return "";
}

function blockAfterLabels(text: string, labels: string[], maxChars = 220): string {
  for (const label of labels) {
    const re = new RegExp(
      `${escapeRegExp(label)}\\s*[:#\\-]?\\s*([\\s\\S]{0,${maxChars}})`,
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

  const namedUs = value.match(
    /\b([A-Za-zÄÖÜäöüß]{3,9})[.\-\s]+(\d{1,2}),?\s+(\d{2,4})\b/,
  );
  if (namedUs) {
    const month = MONTHS[namedUs[1].toLowerCase()];
    if (month) {
      const day = namedUs[2].padStart(2, "0");
      const year = namedUs[3].length === 2 ? `20${namedUs[3]}` : namedUs[3];
      return `${year}-${month}-${day}`;
    }
  }

  return null;
}

function extractInvoiceNumber(text: string): string {
  const labeled = valueAfterLabels(text, [
    "Rechnungsnummer",
    "Rechnungsnr.",
    "Rechnungsnr",
    "Rechnung-Nr.",
    "Rechnung Nr",
    "Invoice Number",
    "Invoice No.",
    "Invoice No",
    "Invoice #",
    "Belegnummer",
    "Document Number",
    "Doc Number",
  ]);
  const fromLabel = labeled.match(/[A-Z0-9][A-Z0-9./-]{4,24}/i)?.[0];
  if (fromLabel) return fromLabel.toUpperCase();

  const hp = text.match(/\b9\d{9,11}\b/);
  if (hp) return hp[0];
  return "";
}

function extractCreditNoteNumber(text: string): string {
  const labeled = valueAfterLabels(text, [
    "Gutschriftsnummer",
    "Gutschriftsnr.",
    "Gutschriftsnr",
    "Gutschrift-Nr.",
    "Gutschrift Nr",
    "Gutschriftnummer",
    "Credit Note Number",
    "Credit Note No",
    "Credit Note #",
    "Credit Memo",
  ]);
  const fromLabel = labeled.match(/[A-Z0-9][A-Z0-9./-]{3,24}/i)?.[0];
  return fromLabel ? fromLabel.toUpperCase() : "";
}

function extractInvoiceDate(text: string): string | null {
  const block = blockAfterLabels(text, [
    "Rechnungsdatum",
    "Invoice Date",
    "Invoice date",
    "Date of invoice",
    "Belegdatum",
    "Document Date",
  ]);
  return parseAnyDate(block);
}

function extractTicketAndAssignee(text: string): { ticket: string; assignee: string } {
  const ticket = valueAfterLabels(text, [
    "Kundenauftragsnummer",
    "Kundenauftragsnr.",
    "Kundenauftragsnr",
    "Kundenauftrags-Nr.",
    "Kundenauftrag-Nr.",
    "Kundenauftrag",
    "Customer order number",
    "Customer Order Number",
    "Customer Order No",
    "Customer PO",
    "Internes Ticket",
    "Ticketnummer",
    "Ihre Referenz",
    "Your Reference",
    "Kundenreferenz",
    "Bestellnummer",
    "PO Number",
  ]);

  const assignee = valueAfterLabels(text, [
    "Bearbeiter",
    "Zuständig",
    "Assigned To",
    "Assigned",
    "Technician",
    "Techniker",
  ]);

  return {
    ticket: ticket.replace(/^[:#\-\s]+/, "").trim(),
    assignee: assignee.replace(/^[:#\-\s]+/, "").trim(),
  };
}

function extractAmount(text: string): { amount: string; currency: string } {
  const labeled = valueAfterLabels(text, [
    "Gesamtbetrag",
    "Rechnungsbetrag",
    "Amount Due",
    "Total Amount",
    "Grand Total",
    "Invoice Total",
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

function extractCustomer(text: string): string {
  return valueAfterLabels(text, [
    "Rechnungsempfänger",
    "Bill To",
    "Sold To",
    "Kunde",
    "Customer",
    "Firma",
  ]).slice(0, 120);
}

export function parsePartnerInvoiceText(rawText: string): ParsedInvoiceFields {
  const text = rawText.replace(/\u0000/g, " ").replace(/\r/g, "\n");
  const warnings: string[] = [];
  const invoiceNumber = extractInvoiceNumber(text);
  const creditNoteNumber = extractCreditNoteNumber(text);
  const { ticket, assignee } = extractTicketAndAssignee(text);
  const { amount, currency } = extractAmount(text);
  const invoiceDate = extractInvoiceDate(text);
  const dueDate = parseAnyDate(
    blockAfterLabels(text, [
      "Fälligkeitsdatum",
      "Due Date",
      "Zahlbar bis",
      "Payment Due",
    ]),
  );
  const customer = extractCustomer(text);

  if (!invoiceNumber) warnings.push("Rechnungsnummer konnte nicht erkannt werden.");
  if (!invoiceDate) warnings.push("Rechnungsdatum konnte nicht erkannt werden.");
  if (!ticket) warnings.push("Kundenauftragsnummer konnte nicht erkannt werden.");

  return {
    invoiceNumber,
    creditNoteNumber,
    invoiceDate,
    dueDate,
    amount,
    currency,
    customer,
    ticketNumber: ticket,
    assignee,
    warnings,
  };
}
