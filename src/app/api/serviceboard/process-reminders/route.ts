import { NextResponse } from "next/server";
import { denyIfResponse, requireAppAccess } from "@/lib/auth/guards";
import { processServiceboardReminders } from "@/lib/serviceboard/reminders";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const access = await requireAppAccess(req, "serviceboard");
  if (denyIfResponse(access)) return access;

  try {
    const result = await processServiceboardReminders();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erinnerungen konnten nicht verarbeitet werden.",
      },
      { status: 500 },
    );
  }
}
