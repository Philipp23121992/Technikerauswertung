import { NextResponse } from "next/server";
import { denyIfResponse, requireAppWrite } from "@/lib/auth/guards";
import { resetMailverwaltungDemo } from "@/lib/mailverwaltung/db";
import { publicDb } from "@/lib/mailverwaltung/sync";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const access = await requireAppWrite(req, "mailverwaltung");
  if (denyIfResponse(access)) return access;
  const db = await resetMailverwaltungDemo();
  return NextResponse.json(publicDb(db));
}
