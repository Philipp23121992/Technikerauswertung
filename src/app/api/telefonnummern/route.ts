import { NextResponse } from "next/server";
import { denyIfResponse, requireAppAccess, requireAppWrite } from "@/lib/auth/guards";
import { readTelefonnummernDb, writeTelefonnummernDb } from "@/lib/telefonnummern/db";
import { normalizeContact, type PhoneContact } from "@/lib/telefonnummern/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const access = await requireAppAccess(req, "verwaltung");
  if (denyIfResponse(access)) return access;

  try {
    const db = await readTelefonnummernDb();
    return NextResponse.json({ contacts: db.contacts });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Telefonnummern konnten nicht geladen werden.",
      },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  const access = await requireAppWrite(req, "verwaltung");
  if (denyIfResponse(access)) return access;

  try {
    const body = (await req.json().catch(() => null)) as {
      contacts?: Partial<PhoneContact>[];
    } | null;

    if (!body || !Array.isArray(body.contacts)) {
      return NextResponse.json({ error: "contacts[] erforderlich." }, { status: 400 });
    }

    const contacts = body.contacts
      .map((item) => normalizeContact(item))
      .filter((item): item is PhoneContact => Boolean(item));

    const saved = await writeTelefonnummernDb({ version: 1, contacts });
    return NextResponse.json({ contacts: saved.contacts });
  } catch (error) {
    console.error("[api/telefonnummern] PUT failed", error);
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
