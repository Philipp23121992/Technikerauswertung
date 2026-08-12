import { NextResponse } from "next/server";
import { denyIfResponse, requireAppWrite } from "@/lib/auth/guards";
import { deleteEntry, entryInputSchema, updateEntry } from "@/lib/finder/entries";
import type { EntityKind } from "@/lib/finder/types";

function parseKind(value: string | null): EntityKind | null {
  if (value === "TECHNICIAN" || value === "PARTNER") return value;
  return null;
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const access = await requireAppWrite(req, "finder");
  if (denyIfResponse(access)) return access;

  const { id } = await ctx.params;
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
    const item = await updateEntry(kind, id, parsed.data);
    return NextResponse.json({ item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "NOT_FOUND") {
      return NextResponse.json({ error: "Eintrag nicht gefunden." }, { status: 404 });
    }
    if (msg === "INVALID_PLZ" || msg === "PLZ_NOT_FOUND") {
      return NextResponse.json(
        { error: "PLZ ungültig oder nicht gefunden." },
        { status: 400 },
      );
    }
    throw e;
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const access = await requireAppWrite(req, "finder");
  if (denyIfResponse(access)) return access;

  const { id } = await ctx.params;
  const kind = parseKind(new URL(req.url).searchParams.get("kind"));
  if (!kind) {
    return NextResponse.json({ error: "kind fehlt." }, { status: 400 });
  }

  await deleteEntry(kind, id);
  return NextResponse.json({ ok: true });
}
