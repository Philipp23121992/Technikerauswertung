import { PDFParse } from "pdf-parse";

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    const text = (result.text || "").replace(/\u0000/g, " ").trim();
    if (!text) {
      throw new Error(
        "PDF enthält keinen extrahierbaren Text (ggf. nur gescannt/Bild).",
      );
    }
    return text;
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}
