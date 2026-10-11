import { inflateRawSync } from "zlib";

export type SpreadsheetSheet = {
  name: string;
  headers: string[];
  rows: string[][];
};

function readZip(buffer: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 30 <= buffer.length) {
    const sig = buffer.readUInt32LE(offset);
    if (sig !== 0x04034b50) break;
    const flags = buffer.readUInt16LE(offset + 6);
    const method = buffer.readUInt16LE(offset + 8);
    let compSize = buffer.readUInt32LE(offset + 18);
    const nameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = buffer.toString("utf8", nameStart, nameStart + nameLen).replace(/\\/g, "/");
    const dataStart = nameStart + nameLen + extraLen;
    if (flags & 0x8) {
      throw new Error("Excel-Datei mit Data-Descriptor wird nicht unterstützt. Bitte neu aus Lexmark exportieren.");
    }
    const compressed = buffer.subarray(dataStart, dataStart + compSize);
    let data: Buffer;
    if (method === 0) data = Buffer.from(compressed);
    else if (method === 8) data = inflateRawSync(compressed);
    else throw new Error("Diese Excel-Datei ist komprimiert in einem unbekannten Format.");
    files.set(name, data);
    offset = dataStart + compSize;
  }
  return files;
}

function unescapeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .trim();
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const match of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const texts = [...match[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((item) => unescapeXml(item[1]));
    out.push(texts.join(""));
  }
  return out;
}

function colIndex(ref: string): number {
  const letters = ref.replace(/\d+/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.toUpperCase().charCodeAt(0) - 64);
  return Math.max(0, n - 1);
}

function parseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2];
      const ref = attrs.match(/\br="([^"]+)"/)?.[1] ?? "";
      const type = attrs.match(/\bt="([^"]+)"/)?.[1] ?? "";
      let value = "";
      if (type === "inlineStr") {
        const text = body.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/);
        value = text ? unescapeXml(text[1]) : "";
      } else {
        const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
        if (type === "s") {
          const index = Number(raw);
          value = Number.isFinite(index) ? (shared[index] ?? "") : "";
        } else {
          value = unescapeXml(raw);
        }
      }
      const index = ref ? colIndex(ref) : cells.length;
      while (cells.length < index) cells.push("");
      cells[index] = value;
    }
    if (cells.some((cell) => cell.trim())) rows.push(cells);
  }
  return rows;
}

export function parseXlsxBuffer(buffer: Buffer | Uint8Array): SpreadsheetSheet[] {
  const zip = readZip(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer));
  const shared = parseSharedStrings(zip.get("xl/sharedStrings.xml")?.toString("utf8") ?? "");
  const workbook = zip.get("xl/workbook.xml")?.toString("utf8") ?? "";
  const names = [...workbook.matchAll(/<sheet\b[^>]*name="([^"]+)"/g)].map((match) => unescapeXml(match[1]));
  const sheetFiles = [...zip.keys()]
    .filter((name) => /xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const na = Number(a.match(/sheet(\d+)/i)?.[1] ?? 0);
      const nb = Number(b.match(/sheet(\d+)/i)?.[1] ?? 0);
      return na - nb;
    });

  return sheetFiles.map((file, index) => {
    const grid = parseSheet(zip.get(file)?.toString("utf8") ?? "", shared);
    const headers = (grid[0] ?? []).map((cell) => cell.trim());
    const rows = grid.slice(1).map((row) => {
      const next = headers.map((_, col) => (row[col] ?? "").trim());
      return next;
    });
    return {
      name: names[index] || `Tabelle ${index + 1}`,
      headers,
      rows,
    };
  });
}
