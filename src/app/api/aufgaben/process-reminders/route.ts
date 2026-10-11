import { NextResponse } from "next/server";
import { denyIfResponse, requireAppWrite } from "@/lib/auth/guards";
import { processAufgabenReminders } from "@/lib/aufgaben/reminders";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const access = await requireAppWrite(req, "verwaltung");
  if (denyIfResponse(access)) return access;

  try {
    const result = await processAufgabenReminders();
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
