import { NextResponse } from "next/server";
import { findNearest } from "@/lib/finder/search";
import type { EntityKind } from "@/lib/finder/types";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const plz = searchParams.get("plz") ?? "";
  const kind = (searchParams.get("kind") ?? "TECHNICIAN") as EntityKind;
  if (kind !== "TECHNICIAN" && kind !== "PARTNER") {
    return NextResponse.json({ error: "Ungültiger Typ." }, { status: 400 });
  }

  try {
    const result = await findNearest(plz, kind, 5);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "INVALID_PLZ") {
      return NextResponse.json(
        { error: "Bitte eine gültige 5-stellige PLZ eingeben." },
        { status: 400 },
      );
    }
    if (msg === "PLZ_NOT_FOUND") {
      return NextResponse.json(
        { error: "PLZ konnte nicht gefunden werden." },
        { status: 404 },
      );
    }
    throw e;
  }
}
