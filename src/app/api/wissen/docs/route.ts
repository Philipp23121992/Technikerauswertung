import { NextResponse } from "next/server";
import { denyIfResponse, requireAppAccess, requireAppWrite } from "@/lib/auth/guards";
import { readLexmarkDb } from "@/lib/lexmark/db";
import { readKnowledgeDb, writeKnowledgeDb } from "@/lib/wissen/db";
import { upsertKnowledgeDoc } from "@/lib/wissen/ingest";
import {
  lexmarkDocMeta,
  piecesFromLexmarkManual,
  piecesFromSpreadsheet,
} from "@/lib/wissen/lexmark-knowledge";
import { extractPdfText } from "@/lib/wissen/pdf";
import { chunkText, type KnowledgeDoc } from "@/lib/wissen/types";
import { parseXlsxBuffer } from "@/lib/wissen/xlsx-text";

export const runtime = "nodejs";
export const maxDuration = 120;

function guessCategory(fileName: string): KnowledgeDoc["category"] {
  const lower = fileName.toLowerCase();
  if (lower.includes("leitfaden") || lower.includes("guideline")) return "leitfaden";
  if (lower.includes("lexmark") || lower.includes("manual") || lower.includes("handbuch") || lower.includes("anleitung")) {
    return "manual";
  }
  return "sonstiges";
}

function isXlsx(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".xlsx") ||
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

async function extractPlainText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const isPdf = name.endsWith(".pdf") || file.type === "application/pdf";
  if (isPdf) {
    const buffer = Buffer.from(await file.arrayBuffer());
    return extractPdfText(buffer);
  }
  const raw = await file.text();
  if (
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".csv") ||
    name.endsWith(".log") ||
    file.type.startsWith("text/")
  ) {
    return raw;
  }
  if (raw && /[\p{L}]/u.test(raw) && !raw.includes("\u0000")) {
    return raw;
  }
  throw new Error("Dateityp nicht unterstützt. Bitte PDF, Excel, TXT, MD oder CSV hochladen.");
}

async function importLexmark(manualId?: string) {
  const lexmark = await readLexmarkDb();
  const manuals = manualId
    ? lexmark.manuals.filter((item) => item.id === manualId)
    : lexmark.manuals;
  if (!manuals.length) {
    throw new Error(manualId ? "Manual nicht gefunden." : "Keine Lexmark-Manuals zum Import.");
  }
  const db = await readKnowledgeDb();
  const docs: KnowledgeDoc[] = [];
  for (const manual of manuals) {
    const meta = lexmarkDocMeta(lexmark, manual.id);
    const pieces = piecesFromLexmarkManual(lexmark, manual.id);
    if (!meta || !pieces.length) continue;
    docs.push(
      upsertKnowledgeDoc(db, {
        key: meta.key,
        title: meta.title,
        fileName: meta.fileName,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        category: "manual",
        pieces,
      }),
    );
  }
  if (!docs.length) {
    throw new Error("In den Lexmark-Listen steckt kein importierbarer Text (Fehlercodes/FRUs).");
  }
  await writeKnowledgeDb(db);
  return docs;
}

export async function GET(req: Request) {
  const access = await requireAppAccess(req, "wissen");
  if (denyIfResponse(access)) return access;

  const db = await readKnowledgeDb();
  return NextResponse.json({
    docs: db.docs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    stats: {
      docs: db.docs.length,
      active: db.docs.filter((doc) => doc.active).length,
      chunks: db.chunks.length,
    },
  });
}

export async function POST(req: Request) {
  const access = await requireAppWrite(req, "wissen");
  if (denyIfResponse(access)) return access;

  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body = (await req.json().catch(() => null)) as { source?: string; manualId?: string } | null;
      if (body?.source !== "lexmark") {
        return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
      }
      const lexmarkAccess = await requireAppAccess(req, "lexmark");
      if (denyIfResponse(lexmarkAccess)) return lexmarkAccess;
      const docs = await importLexmark(body.manualId?.trim() || undefined);
      return NextResponse.json(
        {
          doc: docs[0],
          docs,
          imported: docs.length,
          chunks: docs.reduce((sum, doc) => sum + doc.chunkCount, 0),
        },
        { status: 201 },
      );
    }

    const form = await req.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Datei fehlt." }, { status: 400 });
    }

    const titleInput = String(form.get("title") || "").trim();
    const categoryInput = String(form.get("category") || "").trim();
    const title = titleInput || file.name.replace(/\.[^.]+$/, "");
    const category =
      categoryInput === "manual" || categoryInput === "leitfaden" || categoryInput === "sonstiges"
        ? categoryInput
        : guessCategory(file.name);

    const db = await readKnowledgeDb();
    if (isXlsx(file)) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const sheets = parseXlsxBuffer(buffer);
      const pieces = piecesFromSpreadsheet(sheets, title);
      if (!pieces.length) {
        return NextResponse.json({ error: "Die Excel-Datei enthält keine lesbaren Zeilen." }, { status: 400 });
      }
      const doc = upsertKnowledgeDoc(db, {
        key: file.name.toLowerCase(),
        title,
        fileName: file.name,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        category,
        pieces,
      });
      await writeKnowledgeDb(db);
      return NextResponse.json({ doc }, { status: 201 });
    }

    const text = await extractPlainText(file);
    const pieces = chunkText(text).map((piece, index) => ({ title: `${title} ${index + 1}`, text: piece }));
    if (!pieces.length) {
      return NextResponse.json({ error: "Datei enthält keinen lesbaren Text." }, { status: 400 });
    }

    const doc = upsertKnowledgeDoc(db, {
      key: file.name.toLowerCase(),
      title,
      fileName: file.name,
      mimeType: file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "text/plain"),
      category,
      pieces,
    });
    await writeKnowledgeDb(db);
    return NextResponse.json({ doc }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Upload fehlgeschlagen.",
      },
      { status: 400 },
    );
  }
}
