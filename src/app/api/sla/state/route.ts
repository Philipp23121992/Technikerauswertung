import { NextResponse } from "next/server";
import { denyIfResponse, requireAppAccess, requireAppWrite } from "@/lib/auth/guards";
import { readSlaDb, writeSlaDb } from "@/lib/sla-db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const access = await requireAppAccess(req, "sla");
  if (denyIfResponse(access)) return access;

  const db = await readSlaDb();
  const since = Number(new URL(req.url).searchParams.get("since") || 0);
  if (since && since >= db.revision) {
    return new NextResponse(null, { status: 304 });
  }
  return NextResponse.json(db);
}

export async function PUT(req: Request) {
  const access = await requireAppWrite(req, "sla");
  if (denyIfResponse(access)) return access;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const next = await writeSlaDb({
    customers: body.customers as never,
    technicians: body.technicians as never,
    tickets: body.tickets as never,
    imports: body.imports as never,
    timeTickets: body.timeTickets as never,
    timeImports: body.timeImports as never,
  });
  return NextResponse.json(next);
}
