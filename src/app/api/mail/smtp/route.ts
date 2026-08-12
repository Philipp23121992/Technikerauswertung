import { NextResponse } from "next/server";
import { denyIfResponse, requireAppAccess, requireAppWrite } from "@/lib/auth/guards";
import {
  readSmtpConfig,
  toPublicSmtpConfig,
  writeSmtpConfig,
} from "@/lib/smtp-config";
import { sendTestMail } from "@/lib/mail";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const access = await requireAppAccess(req, "meetings");
  if (denyIfResponse(access)) return access;

  const config = await readSmtpConfig();
  return NextResponse.json(toPublicSmtpConfig(config));
}

export async function PUT(req: Request) {
  const access = await requireAppWrite(req, "meetings");
  if (denyIfResponse(access)) return access;

  const body = (await req.json().catch(() => null)) as {
    host?: string;
    port?: number;
    secure?: boolean;
    user?: string;
    pass?: string;
    from?: string;
    keepPassword?: boolean;
  } | null;

  if (!body?.host?.trim() || !body?.user?.trim()) {
    return NextResponse.json(
      { error: "Host und Benutzer sind erforderlich." },
      { status: 400 },
    );
  }

  const current = await readSmtpConfig();
  const keepPassword = Boolean(body.keepPassword) || !body.pass;
  if (!keepPassword && !body.pass) {
    return NextResponse.json(
      { error: "Passwort fehlt." },
      { status: 400 },
    );
  }
  if (keepPassword && !current.pass && !body.pass) {
    return NextResponse.json(
      { error: "Bitte ein SMTP-Passwort hinterlegen." },
      { status: 400 },
    );
  }

  const saved = await writeSmtpConfig({
    host: body.host,
    port: body.port,
    secure: body.secure,
    user: body.user,
    pass: body.pass,
    from: body.from,
    keepPassword: keepPassword && !body.pass,
  });

  return NextResponse.json(toPublicSmtpConfig(saved));
}

export async function POST(req: Request) {
  const access = await requireAppWrite(req, "meetings");
  if (denyIfResponse(access)) return access;

  const body = (await req.json().catch(() => null)) as { to?: string } | null;
  const to = body?.to?.trim() ?? "";
  if (!to) {
    return NextResponse.json(
      { error: "Bitte Empfänger-E-Mail angeben." },
      { status: 400 },
    );
  }

  try {
    await sendTestMail(to);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Testmail konnte nicht gesendet werden.",
      },
      { status: 500 },
    );
  }
}
