import { NextResponse } from "next/server";
import { denyIfResponse, requireUser } from "@/lib/auth/guards";
import { processAllReminders } from "@/lib/mail-reminders/process-all";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const access = await requireUser(req);
  if (denyIfResponse(access)) return access;

  try {
    const result = await processAllReminders();
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
