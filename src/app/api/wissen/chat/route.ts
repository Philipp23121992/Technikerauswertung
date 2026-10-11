import { NextResponse } from "next/server";
import { denyIfResponse, requireAppAccess } from "@/lib/auth/guards";
import { readLexmarkDb } from "@/lib/lexmark/db";
import { readKnowledgeDb } from "@/lib/wissen/db";
import { answerTechnicianChat, listChatModels, type TechnicianChatMessage } from "@/lib/wissen/technician-chat";
import { readWissenTicketsDb } from "@/lib/wissen/ticket-db";

export const runtime = "nodejs";
export const maxDuration = 60;

function parseMessages(body: {
  message?: string;
  messages?: Array<{ role?: string; content?: string }>;
}): TechnicianChatMessage[] {
  const out: TechnicianChatMessage[] = [];
  if (Array.isArray(body.messages)) {
    for (const item of body.messages) {
      const content = item.content?.trim() ?? "";
      if (!content) continue;
      if (item.role !== "user" && item.role !== "assistant") continue;
      out.push({ role: item.role, content });
    }
  }
  const last = body.message?.trim() ?? "";
  if (last && out.at(-1)?.content !== last) {
    out.push({ role: "user", content: last });
  }
  return out.slice(-16);
}

export async function GET(req: Request) {
  const access = await requireAppAccess(req, "wissen");
  if (denyIfResponse(access)) return access;
  const lexmark = await readLexmarkDb();
  return NextResponse.json({ models: listChatModels(lexmark) });
}

export async function POST(req: Request) {
  const access = await requireAppAccess(req, "wissen");
  if (denyIfResponse(access)) return access;

  const body = (await req.json().catch(() => null)) as
    | { message?: string; messages?: Array<{ role?: string; content?: string }> }
    | null;
  const messages = parseMessages(body ?? {});
  if (!messages.length) {
    return NextResponse.json({ error: "Nachricht fehlt." }, { status: 400 });
  }

  const [lexmark, ticketsDb, knowledge] = await Promise.all([
    readLexmarkDb(),
    readWissenTicketsDb(),
    readKnowledgeDb(),
  ]);
  const hasDocs = knowledge.docs.some((doc) => doc.active);
  const hasTickets = ticketsDb.tickets.length > 0;
  if (!hasDocs && !hasTickets && !lexmark.manuals.length) {
    return NextResponse.json({
      answer:
        "Noch kein Wissen hinterlegt. Unter Lexmark „Zum Chatbot“ drücken oder unter Wissen Excel-Listen/Manuale hochladen.",
      sources: [],
    });
  }

  const result = await answerTechnicianChat({
    lexmark,
    tickets: ticketsDb.tickets,
    knowledge,
    messages,
  });
  return NextResponse.json(result);
}
