import { NextResponse } from "next/server";
import { denyIfResponse, requireAppWrite } from "@/lib/auth/guards";
import { MAIL_STATUSES } from "@/lib/mailverwaltung/types";
import { publicDb, setMessageStatus } from "@/lib/mailverwaltung/sync";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const access = await requireAppWrite(req, "mailverwaltung");
  if (denyIfResponse(access)) return access;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { status?: string } | null;
  const status = body?.status;
  if (!MAIL_STATUSES.includes(status as (typeof MAIL_STATUSES)[number])) {
    return NextResponse.json({ error: "Ungültiger Status." }, { status: 400 });
  }
  try {
    const db = await setMessageStatus(id, status as (typeof MAIL_STATUSES)[number]);
    return NextResponse.json(publicDb(db));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Status konnte nicht gespeichert werden." },
      { status: 400 },
    );
  }
}
