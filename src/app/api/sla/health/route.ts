import { NextResponse } from "next/server";
import { readSlaDb } from "@/lib/sla-db";

export async function GET() {
  const db = await readSlaDb();
  return NextResponse.json({ ok: true, updatedAt: db.updatedAt });
}
