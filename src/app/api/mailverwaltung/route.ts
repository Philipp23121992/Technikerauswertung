import { NextResponse } from "next/server";
import { denyIfResponse, requireAppAccess } from "@/lib/auth/guards";
import { readMailverwaltungDb } from "@/lib/mailverwaltung/db";
import { publicDb } from "@/lib/mailverwaltung/sync";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const access = await requireAppAccess(req, "mailverwaltung");
  if (denyIfResponse(access)) return access;
  const db = await readMailverwaltungDb();
  return NextResponse.json(publicDb(db));
}
