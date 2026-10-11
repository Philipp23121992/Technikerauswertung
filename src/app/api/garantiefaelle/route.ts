import { NextResponse } from "next/server";
import { denyIfResponse, requireAppAccess, requireAppWrite } from "@/lib/auth/guards";
import { readGarantiefaelleDb, writeGarantiefaelleDb } from "@/lib/garantiefaelle/db";
import {
  normalizeManufacturerPriceRule,
  normalizeWarrantyCase,
  type ManufacturerPriceRule,
  type WarrantyCase,
} from "@/lib/garantiefaelle/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const access = await requireAppAccess(req, "garantiefaelle");
  if (denyIfResponse(access)) return access;

  try {
    const db = await readGarantiefaelleDb();
    return NextResponse.json(db);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Garantiefälle konnten nicht geladen werden.",
      },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  const access = await requireAppWrite(req, "garantiefaelle");
  if (denyIfResponse(access)) return access;

  try {
    const body = (await req.json().catch(() => null)) as {
      cases?: Partial<WarrantyCase>[];
      manufacturerPrices?: Partial<ManufacturerPriceRule>[];
    } | null;

    if (!body || !Array.isArray(body.cases) || !Array.isArray(body.manufacturerPrices)) {
      return NextResponse.json(
        { error: "cases[] und manufacturerPrices[] erforderlich." },
        { status: 400 },
      );
    }

    const cases = body.cases
      .map((item, index) => normalizeWarrantyCase(item, index))
      .filter((item): item is WarrantyCase => Boolean(item));

    const manufacturerPrices = body.manufacturerPrices
      .map((item) => normalizeManufacturerPriceRule(item))
      .filter((item): item is ManufacturerPriceRule => Boolean(item));

    const saved = await writeGarantiefaelleDb({ version: 1, cases, manufacturerPrices });
    return NextResponse.json(saved);
  } catch (error) {
    console.error("[api/garantiefaelle] PUT failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Speichern fehlgeschlagen: ${error.message}`
            : "Speichern fehlgeschlagen.",
      },
      { status: 500 },
    );
  }
}
