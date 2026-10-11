import { NextResponse } from "next/server";
import { denyIfResponse, requireAppAccess, requireAppWrite } from "@/lib/auth/guards";
import { createEntry, entryInputSchema } from "@/lib/finder/entries";
import { listByKind, readDb } from "@/lib/finder/db";
import type { EntityKind } from "@/lib/finder/types";

function parseKind(value: string | null): EntityKind | null {
  if (value === "TECHNICIAN" || value === "PARTNER") return value;
  return null;
}

export async function GET(req: Request) {
  const access = await requireAppAccess(req, "finder");
  if (denyIfResponse(access)) return access;

  const kind = parseKind(new URL(req.url).searchParams.get("kind"));
  if (!kind) {
    return NextResponse.json({ error: "kind fehlt." }, { status: 400 });
  }
  const db = await readDb();
  const items = listByKind(db, kind).sort((a, b) =>
    a.name.localeCompare(b.name, "de"),
  );
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const access = await requireAppWrite(req, "finder");
  if (denyIfResponse(access)) return access;

  const body = await req.json().catch(() => null);
  const kind = parseKind(body?.kind ?? null);
  if (!kind) {
    return NextResponse.json({ error: "kind fehlt." }, { status: 400 });
  }

  const parsed = entryInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Bitte Pflichtfelder korrekt ausfüllen." },
      { status: 400 },
    );
  }

  try {
    const item = await createEntry(kind, parsed.data);
    return NextResponse.json({ item }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "INVALID_PLZ" || msg === "PLZ_NOT_FOUND") {
      return NextResponse.json(
        { error: "PLZ ungültig oder nicht gefunden." },
        { status: 400 },
      );
    }
    throw e;
  }
}
