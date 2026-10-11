import { NextResponse } from "next/server";
import { denyIfResponse, forbiddenResponse, requireUser } from "@/lib/auth/guards";
import { userHasApp } from "@/lib/auth/types";
import { readSlaDb } from "@/lib/sla-db";
import type { Customer, SlaType } from "@/sla/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asSlaType(value: unknown): SlaType | null {
  return value === "NBD" || value === "2ND_NBD" ? value : null;
}

function normalizeCustomer(raw: unknown): Customer | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const slaType = asSlaType(row.slaType);
  if (!id || !name || !slaType) return null;
  const aliases = Array.isArray(row.aliases)
    ? row.aliases
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  return { id, name, aliases, slaType };
}

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (denyIfResponse(user)) return user;
  if (!userHasApp(user, "disposition") && !userHasApp(user, "sla")) {
    return forbiddenResponse("Für diesen Bereich fehlt die Freigabe.");
  }

  try {
    const db = await readSlaDb();
    const customers = (Array.isArray(db.customers) ? db.customers : [])
      .map((item) => normalizeCustomer(item))
      .filter((item): item is Customer => Boolean(item))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
    return NextResponse.json({ customers });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "SLA-Kunden konnten nicht geladen werden.",
      },
      { status: 500 },
    );
  }
}
