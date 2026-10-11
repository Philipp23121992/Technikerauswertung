import {
  InvalidPDFException,
  PasswordException,
  PDFParse,
} from "pdf-parse";
import type { ExtractedPage, PdfExtractResult } from "./types";
import { buildManualFromPages, OCR_CHAR_THRESHOLD } from "./extract";

function classifyPdfError(error: unknown): string {
  if (error instanceof PasswordException) {
    return "PDF ist passwortgeschützt.";
  }
  if (error instanceof InvalidPDFException) {
    return "PDF ist beschädigt oder kein gültiges PDF.";
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/password/i.test(message)) return "PDF ist passwortgeschützt.";
  if (/encrypt/i.test(message)) return "PDF ist verschlüsselt.";
  return `PDF konnte nicht gelesen werden: ${message}`;
}

async function readTables(parser: PDFParse): Promise<Map<number, string[][][]>> {
  const byPage = new Map<number, string[][][]>();
  try {
    const tables = await parser.getTable({});
    for (const page of tables.pages ?? []) {
      const rows = (page.tables ?? []).filter((table) => table.length > 0);
      if (rows.length) byPage.set(page.num, rows);
    }
  } catch {
    /* Tabellenerkennung ist optional */
  }
  return byPage;
}

export async function extractPdfManual(buffer: Buffer, fileName: string): Promise<PdfExtractResult> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    let textResult;
    try {
      textResult = await parser.getText({});
    } catch (error) {
      throw new Error(classifyPdfError(error));
    }

    const tableMap = await readTables(parser);
    const pages: ExtractedPage[] = (textResult.pages.length
      ? textResult.pages
      : [{ num: 1, text: textResult.text ?? "" }]
    ).map((page) => {
      const text = (page.text || "").replace(/\u0000/g, " ").trim();
      return {
        page: page.num,
        text,
        charCount: text.length,
        needsOcr: text.length < OCR_CHAR_THRESHOLD,
        tables: tableMap.get(page.num) ?? [],
      };
    });

    if (!pages.length) {
      throw new Error("PDF enthält keine Seiten.");
    }

    return buildManualFromPages(pages, fileName);
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}
