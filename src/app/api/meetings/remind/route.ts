import { NextResponse } from "next/server";
import { denyIfResponse, requireAppAccess, requireAppWrite } from "@/lib/auth/guards";
import { isMailConfigured, sendAgendaReminderMail } from "@/lib/mail";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const access = await requireAppAccess(req, "meetings");
  if (denyIfResponse(access)) return access;

  return NextResponse.json({
    configured: await isMailConfigured(),
  });
}

export async function POST(req: Request) {
  const access = await requireAppWrite(req, "meetings");
  if (denyIfResponse(access)) return access;

  const body = (await req.json().catch(() => null)) as {
    to?: string;
    assigneeName?: string;
    agendaText?: string;
    dueDate?: string;
    protocolTitle?: string;
    meetingKindLabel?: string;
  } | null;

  const to = body?.to?.trim() ?? "";
  const agendaText = body?.agendaText?.trim() ?? "";
  const dueDate = body?.dueDate?.trim() ?? "";
  const protocolTitle = body?.protocolTitle?.trim() ?? "Meeting-Protokoll";
  const meetingKindLabel = body?.meetingKindLabel?.trim() ?? "Meeting";
  const assigneeName = body?.assigneeName?.trim() ?? "";

  if (!to || !agendaText || !dueDate) {
    return NextResponse.json(
      { error: "to, agendaText und dueDate sind erforderlich." },
      { status: 400 },
    );
  }

  if (!(await isMailConfigured())) {
    return NextResponse.json(
      {
        error:
          "SMTP ist nicht konfiguriert. Bitte unter Meetings → E-Mail / SMTP einrichten.",
      },
      { status: 503 },
    );
  }

  try {
    await sendAgendaReminderMail({
      to,
      assigneeName,
      agendaText,
      dueDate,
      protocolTitle,
      meetingKindLabel,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "E-Mail konnte nicht gesendet werden.",
      },
      { status: 500 },
    );
  }
}
