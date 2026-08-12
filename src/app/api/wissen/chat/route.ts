import { NextResponse } from "next/server";
import { denyIfResponse, requireAppAccess } from "@/lib/auth/guards";
import { answerKnowledgeQuery } from "@/lib/wissen/chat";
import { readKnowledgeDb } from "@/lib/wissen/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const access = await requireAppAccess(req, "wissen");
  if (denyIfResponse(access)) return access;

  const body = (await req.json().catch(() => null)) as { message?: string } | null;
  const message = body?.message?.trim() ?? "";
  if (!message) {
    return NextResponse.json({ error: "Nachricht fehlt." }, { status: 400 });
  }

  const db = await readKnowledgeDb();
  if (!db.docs.some((doc) => doc.active)) {
    return NextResponse.json({
      answer:
        "Die Wissensdatenbank ist noch leer oder enthält keine aktiven Dokumente. Bitte zuerst Manuale oder Leitfäden unter Wissensdatenbank hochladen.",
      sources: [],
    });
  }

  return NextResponse.json(answerKnowledgeQuery(db, message));
}
