import { buildManualFromPages, OCR_CHAR_THRESHOLD } from "./extract";
import type { ExtractedPage, PdfExtractResult } from "./types";

const MAX_PAGE_CHARS = 20000;

type PdfjsModule = {
  getDocument: (src: { data: Uint8Array }) => { promise: Promise<PdfjsDocument> };
  GlobalWorkerOptions: { workerSrc: string };
};

type PdfjsDocument = {
  numPages: number;
  getPage: (num: number) => Promise<PdfjsPage>;
  destroy: () => Promise<void>;
};

type PdfjsPage = {
  getTextContent: () => Promise<{ items: unknown[] }>;
  cleanup: () => void;
};

let pdfjsPromise: Promise<PdfjsModule> | null = null;

async function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = (new Function("return import('/pdfjs/pdf.min.mjs')")() as Promise<PdfjsModule>).then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

function itemsToText(items: unknown[]): string {
  let lastY: number | null = null;
  const lines: string[] = [];
  let current = "";
  for (const raw of items) {
    if (!raw || typeof raw !== "object" || !("str" in raw)) continue;
    const item = raw as { str: string; transform?: number[] };
    const y: number | null = Array.isArray(item.transform) ? Number(item.transform[5]) : lastY;
    if (lastY != null && y != null && Math.abs(y - lastY) > 2.2) {
      if (current.trim()) lines.push(current.trimEnd());
      current = "";
    }
    const piece = item.str ?? "";
    if (!piece) continue;
    current += (current && !current.endsWith(" ") && !piece.startsWith(" ") ? " " : "") + piece;
    if (typeof y === "number") lastY = y;
  }
  if (current.trim()) lines.push(current.trimEnd());
  return lines.join("\n").trim();
}

function classifyBrowserPdfError(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  if (name === "PasswordException" || /password/i.test(message)) return "PDF ist passwortgeschützt.";
  if (name === "InvalidPDFException") return "PDF ist beschädigt oder kein gültiges PDF.";
  if (/encrypt/i.test(message)) return "PDF ist verschlüsselt.";
  return `PDF konnte nicht gelesen werden: ${message}`;
}

export async function extractPdfInBrowser(
  file: File,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<PdfExtractResult> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  let pdf: PdfjsDocument;
  try {
    pdf = await pdfjs.getDocument({ data }).promise;
  } catch (error) {
    throw new Error(classifyBrowserPdfError(error));
  }

  try {
    const pages: ExtractedPage[] = [];
    for (let num = 1; num <= pdf.numPages; num += 1) {
      if (signal?.aborted) {
        throw new DOMException("Analyse gestoppt.", "AbortError");
      }
      const page = await pdf.getPage(num);
      try {
        const content = await page.getTextContent();
        let text = itemsToText(content.items).replace(/\u0000/g, " ").trim();
        if (text.length > MAX_PAGE_CHARS) text = text.slice(0, MAX_PAGE_CHARS);
        pages.push({
          page: num,
          text,
          charCount: text.length,
          needsOcr: text.length < OCR_CHAR_THRESHOLD,
          tables: [],
        });
      } finally {
        page.cleanup();
      }
      onProgress?.(num, pdf.numPages);
    }
    if (!pages.length) {
      throw new Error("PDF enthält keine Seiten.");
    }
    return buildManualFromPages(pages, file.name);
  } finally {
    await pdf.destroy().catch(() => undefined);
  }
}

export function compactAnalyzePayload(extracted: PdfExtractResult, useAi: boolean) {
  const excerptLimit = 80000;
  let sourceExcerpt = "";
  if (useAi) {
    for (const page of extracted.pages) {
      if (sourceExcerpt.length >= excerptLimit) break;
      sourceExcerpt += `Seite ${page.page}\n${page.text}\n\n`;
    }
    sourceExcerpt = sourceExcerpt.slice(0, excerptLimit);
  }
  return {
    fileName: extracted.fileName,
    title: extracted.title,
    pageCount: extracted.pageCount,
    ocrNeeded: extracted.ocrNeeded,
    confidence: extracted.confidence,
    warnings: extracted.warnings,
    models: extracted.models,
    errorCodes: extracted.errorCodes,
    parts: extracted.parts,
    sections: extracted.sections.map((item) => ({ heading: item.heading, page: item.page, text: "" })),
    sourceExcerpt: sourceExcerpt || undefined,
    useAi,
  };
}
