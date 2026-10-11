import { NextResponse } from "next/server";
import { denyIfResponse, requireAppAccess } from "@/lib/auth/guards";
import { readLexmarkDb } from "@/lib/lexmark/db";
import { buildLexmarkXlsx } from "@/lib/lexmark/export-xlsx";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const access = await requireAppAccess(req, "lexmark");
  if (denyIfResponse(access)) return access;

  const url = new URL(req.url);
  const manualId = url.searchParams.get("manualId")?.trim() || undefined;
  const db = await readLexmarkDb();
  if (manualId && !db.manuals.some((item) => item.id === manualId)) {
    return NextResponse.json({ error: "Manual nicht gefunden." }, { status: 404 });
  }
  try {
    const { fileName, buffer } = buildLexmarkXlsx(db, manualId);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Excel-Export fehlgeschlagen." },
      { status: 400 },
    );
  }
}
