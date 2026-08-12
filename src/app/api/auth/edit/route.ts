import { NextResponse } from "next/server";
import {
  EDIT_ACCESS_TOKEN,
  buildEditAccessCookie,
  clearEditAccessCookie,
  hasEditAccess,
  isValidEditPassword,
} from "@/lib/edit-access";

export const runtime = "nodejs";

/** One year — unlock once per browser until locked or cookie cleared. */
const MAX_AGE = 60 * 60 * 24 * 365;

export async function GET(req: Request) {
  return NextResponse.json({ unlocked: hasEditAccess(req) });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    password?: string;
    action?: "unlock" | "lock";
  } | null;

  if (body?.action === "lock") {
    const res = NextResponse.json({ unlocked: false });
    res.headers.set("Set-Cookie", clearEditAccessCookie());
    return res;
  }

  const password = typeof body?.password === "string" ? body.password : "";
  if (!isValidEditPassword(password)) {
    return NextResponse.json(
      { unlocked: false, error: "Falsches Passwort." },
      { status: 401 },
    );
  }

  const res = NextResponse.json({ unlocked: true });
  res.headers.set(
    "Set-Cookie",
    buildEditAccessCookie(EDIT_ACCESS_TOKEN, MAX_AGE),
  );
  return res;
}
