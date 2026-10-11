import { NextResponse } from "next/server";
import { denyIfResponse, requireAppWrite } from "@/lib/auth/guards";
import { analyzeLexmarkExtract, analyzeLexmarkPdf, extractFromClientPayload } from "@/lib/lexmark/pipeline";
import type { LexmarkAnalyzePayload } from "@/lib/lexmark/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const access = await requireAppWrite(req, "lexmark");
  if (denyIfResponse(access)) return access;

  const contentType = req.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      const body = (await req.json()) as LexmarkAnalyzePayload;
      if (!body?.fileName) {
        return NextResponse.json({ error: "Analyse-Daten fehlen." }, { status: 400 });
      }
      const extracted = extractFromClientPayload(body);
      const source =
        typeof body.sourceExcerpt === "string" && body.sourceExcerpt.trim()
          ? body.sourceExcerpt.slice(0, 80000)
          : "";
      const result = await analyzeLexmarkExtract(extracted, {
        useAi: Boolean(body.useAi),
        sourceText: source,
      });
      return NextResponse.json(result, { status: result.ok ? 200 : 422 });
    }

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "PDF-Datei fehlt." }, { status: 400 });
    }
    const name = file.name.toLowerCase();
    if (!name.endsWith(".pdf") && file.type !== "application/pdf") {
      return NextResponse.json({ error: "Nur PDF-Dateien werden analysiert." }, { status: 400 });
    }
    const useAi = String(form?.get("useAi") ?? "") === "1";
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await analyzeLexmarkPdf(buffer, file.name, { useAi });
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (error) {
    return NextResponse.json(
      {
        fileName: "",
        ok: false,
        error: error instanceof Error ? error.message : "Analyse fehlgeschlagen.",
        log: [],
        stats: null,
        manualId: null,
      },
      { status: 400 },
    );
  }
}
