import { NextResponse } from "next/server";
import { denyIfResponse, requireAppAccess, requireAppWrite } from "@/lib/auth/guards";
import { readKnowledgeDb, writeKnowledgeDb } from "@/lib/wissen/db";
import { extractPdfText } from "@/lib/wissen/pdf";
import {
  chunkText,
  createId,
  type KnowledgeChunk,
  type KnowledgeDoc,
} from "@/lib/wissen/types";

export const runtime = "nodejs";

function guessCategory(fileName: string): KnowledgeDoc["category"] {
  const lower = fileName.toLowerCase();
  if (lower.includes("leitfaden") || lower.includes("guideline")) return "leitfaden";
  if (lower.includes("manual") || lower.includes("handbuch") || lower.includes("anleitung")) {
    return "manual";
  }
  return "sonstiges";
}

async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const isPdf =
    name.endsWith(".pdf") || file.type === "application/pdf";

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
  throw new Error(
    "Dateityp nicht unterstützt. Bitte PDF, TXT, MD oder CSV hochladen.",
  );
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

  try {
    const text = await extractText(file);
    const pieces = chunkText(text);
    if (!pieces.length) {
      return NextResponse.json(
        { error: "Datei enthält keinen lesbaren Text." },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const id = createId("doc");
    const title = titleInput || file.name.replace(/\.[^.]+$/, "");
    const category =
      categoryInput === "manual" ||
      categoryInput === "leitfaden" ||
      categoryInput === "sonstiges"
        ? categoryInput
        : guessCategory(file.name);

    const doc: KnowledgeDoc = {
      id,
      title,
      fileName: file.name,
      mimeType: file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "text/plain"),
      category,
      active: true,
      charCount: text.length,
      chunkCount: pieces.length,
      createdAt: now,
      updatedAt: now,
    };

    const chunks: KnowledgeChunk[] = pieces.map((piece, index) => ({
      id: createId("chunk"),
      docId: id,
      title,
      text: piece,
      index,
    }));

    const db = await readKnowledgeDb();
    db.docs.unshift(doc);
    db.chunks.push(...chunks);
    await writeKnowledgeDb(db);

    return NextResponse.json({ doc }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Upload fehlgeschlagen.",
      },
      { status: 400 },
    );
  }
}
