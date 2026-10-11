import { NextResponse } from "next/server";
import { denyIfResponse, requireAppAccess } from "@/lib/auth/guards";
import { syncAllMailboxes, syncMailbox } from "@/lib/mailverwaltung/sync";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const access = await requireAppAccess(req, "mailverwaltung");
  if (denyIfResponse(access)) return access;
  const body = (await req.json().catch(() => null)) as { mailboxId?: string } | null;
  try {
    if (body?.mailboxId) {
      const result = await syncMailbox(body.mailboxId);
      return NextResponse.json({ results: [result] });
    }
    return NextResponse.json(await syncAllMailboxes());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync fehlgeschlagen." },
      { status: 500 },
    );
  }
}
