import type { LexmarkDb } from "./types";
import { partBezeichnung } from "./extract";

function crcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = crcTable();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u16(value: number): Uint8Array {
  const buf = new Uint8Array(2);
  buf[0] = value & 0xff;
  buf[1] = (value >>> 8) & 0xff;
  return buf;
}

function u32(value: number): Uint8Array {
  const buf = new Uint8Array(4);
  buf[0] = value & 0xff;
  buf[1] = (value >>> 8) & 0xff;
  buf[2] = (value >>> 16) & 0xff;
  buf[3] = (value >>> 24) & 0xff;
  return buf;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function zipStore(files: { name: string; data: Uint8Array }[]): Buffer {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = new TextEncoder().encode(file.name);
    const crc = crc32(file.data);
    const local = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(file.data.length),
      u32(file.data.length),
      u16(name.length),
      u16(0),
      name,
      file.data,
    ]);
    const central = concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(file.data.length),
      u32(file.data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralDir = concat(centrals);
  const eocd = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);
  return Buffer.from(concat([...locals, centralDir, eocd]));
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function colName(index: number): string {
  let n = index;
  let name = "";
  while (n >= 0) {
    name = String.fromCharCode((n % 26) + 65) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
}

function sheetXml(headers: string[], rows: string[][]): string {
  const lines: string[] = [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>`,
  ];
  const all = [headers, ...rows];
  all.forEach((row, rowIndex) => {
    const r = rowIndex + 1;
    const cells = row.map((value, col) => {
      const ref = `${colName(col)}${r}`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value ?? "")}</t></is></c>`;
    });
    lines.push(`<row r="${r}">${cells.join("")}</row>`);
  });
  lines.push(`</sheetData></worksheet>`);
  return lines.join("");
}

function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function sanitizeWorkbookName(fileName: string): string {
  const base = fileName.replace(/\.pdf$/i, "").replace(/[^\w.-]+/g, "_").slice(0, 80);
  return `${base || "Manual"}.xlsx`;
}

export function buildLexmarkXlsx(db: LexmarkDb, manualId?: string): { fileName: string; buffer: Buffer } {
  const manuals = manualId ? db.manuals.filter((item) => item.id === manualId) : db.manuals;
  const ids = new Set(manuals.map((item) => item.id));
  const models = db.printer_models.filter((item) => ids.has(item.manualId));
  const errors = db.error_codes.filter((item) => ids.has(item.manualId));
  const parts = db.replacement_parts.filter((item) => ids.has(item.manualId));
  const relations = db.error_part_relations.filter((item) => ids.has(item.manualId));
  const review = db.review_queue.filter((item) => ids.has(item.manualId));
  const sourceById = new Map(manuals.map((item) => [item.id, item.fileName]));

  const sheets: { name: string; headers: string[]; rows: string[][] }[] = [
    {
      name: "Modelle",
      headers: ["Modell", "Serie", "Maschinentyp", "Quelle"],
      rows: models.map((item) => [
        item.model,
        item.series,
        item.machineType ?? "",
        sourceById.get(item.manualId) ?? item.source,
      ]),
    },
    {
      name: "Fehlercodes",
      headers: ["Modell", "Fehlercode", "Beschreibung", "Customer Resolution", "Remote Resolution", "Seite"],
      rows: errors.flatMap((item) => {
        const related = relations.filter((rel) => rel.errorCode === item.code && rel.manualId === item.manualId);
        const modelNames = related.length
          ? [...new Set(related.map((rel) => rel.model))]
          : models.filter((model) => model.manualId === item.manualId).map((model) => model.model);
        const labels = modelNames.length ? modelNames : [""];
        return labels.map((model) => [
          model,
          item.code,
          item.description ?? "",
          item.customerResolution ?? "",
          item.remoteResolution ?? "",
          item.page != null ? String(item.page) : "",
        ]);
      }),
    },
    {
      name: "Ersatzteile",
      headers: ["Modell", "FRU", "Bezeichnung", "Baugruppe", "Ausbau", "Seite"],
      rows: parts.flatMap((item) => {
        const related = db.model_part_relations.filter(
          (rel) => rel.manualId === item.manualId && rel.fru === item.fru,
        );
        const modelNames = related.length
          ? related.map((rel) => rel.model)
          : models.filter((model) => model.manualId === item.manualId).map((model) => model.model);
        const labels = modelNames.length ? modelNames : [""];
        return labels.map((model) => [
          model,
          item.fru,
          partBezeichnung(item) || item.name || item.description || "",
          item.assembly ?? "",
          item.removal ?? "",
          item.page != null ? String(item.page) : "",
        ]);
      }),
    },
    {
      name: "Beziehungen",
      headers: ["Modell", "Fehlercode", "FRU", "Beschreibung"],
      rows: relations.map((item) => [item.model, item.errorCode, item.fru, item.description ?? ""]),
    },
    {
      name: "Review Queue",
      headers: ["Typ", "Wert", "Confidence", "Grund"],
      rows: review.map((item) => [item.type, item.value, String(item.confidence), item.reason]),
    },
  ];

  const contentTypes = encodeUtf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
</Types>`);

  const rels = encodeUtf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);

  const workbook = encodeUtf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>
${sheets.map((sheet, i) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}
</sheets>
</workbook>`);

  const workbookRels = encodeUtf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}
</Relationships>`);

  const files = [
    { name: "[Content_Types].xml", data: contentTypes },
    { name: "_rels/.rels", data: rels },
    { name: "xl/workbook.xml", data: workbook },
    { name: "xl/_rels/workbook.xml.rels", data: workbookRels },
    ...sheets.map((sheet, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: encodeUtf8(sheetXml(sheet.headers, sheet.rows)),
    })),
  ];

  const fileName = manuals.length === 1 ? sanitizeWorkbookName(manuals[0].fileName) : "Lexmark-Knowledge.xlsx";
  return { fileName, buffer: zipStore(files) };
}
