import { NextResponse } from "next/server";
import { denyIfResponse, requireAdmin } from "@/lib/auth/guards";
import { formatSmtpError, sendTestMailFromTemplate } from "@/lib/mail";
import { SAMPLE_TEMPLATE_VARS, MAIL_TEMPLATE_META } from "@/lib/mail-templates/defaults";
import {
  mergeMailTemplates,
  readMailTemplatesDb,
  writeMailTemplatesDb,
} from "@/lib/mail-templates/db";
import { MAIL_TEMPLATE_IDS, type MailTemplate, type MailTemplateId } from "@/lib/mail-templates/types";

export const runtime = "nodejs";

function isTemplateId(value: unknown): value is MailTemplateId {
  return typeof value === "string" && (MAIL_TEMPLATE_IDS as readonly string[]).includes(value);
}

export async function GET(req: Request) {
  const access = await requireAdmin(req);
  if (denyIfResponse(access)) return access;

  const db = await readMailTemplatesDb();
  return NextResponse.json({
    templates: db.templates,
    meta: MAIL_TEMPLATE_IDS.map((id) => MAIL_TEMPLATE_META[id]),
  });
}

export async function PUT(req: Request) {
  const access = await requireAdmin(req);
  if (denyIfResponse(access)) return access;

  const body = (await req.json().catch(() => null)) as {
    templates?: Partial<MailTemplate>[];
  } | null;

  if (!body || !Array.isArray(body.templates)) {
    return NextResponse.json({ error: "templates[] erforderlich." }, { status: 400 });
  }

  const saved = await writeMailTemplatesDb({
    version: 1,
    templates: mergeMailTemplates(body.templates as MailTemplate[]),
  });

  return NextResponse.json({
    templates: saved.templates,
    meta: MAIL_TEMPLATE_IDS.map((id) => MAIL_TEMPLATE_META[id]),
  });
}

export async function POST(req: Request) {
  const access = await requireAdmin(req);
  if (denyIfResponse(access)) return access;

  const body = (await req.json().catch(() => null)) as {
    id?: string;
    to?: string;
    subject?: string;
    bodyText?: string;
  } | null;

  const to = body?.to?.trim() ?? "";
  if (!to) {
    return NextResponse.json({ error: "Bitte Empfänger-E-Mail angeben." }, { status: 400 });
  }
  if (!isTemplateId(body?.id)) {
    return NextResponse.json({ error: "Unbekannte Vorlage." }, { status: 400 });
  }

  try {
    await sendTestMailFromTemplate({
      to,
      id: body.id,
      subject: body?.subject,
      bodyText: body?.bodyText,
      vars: SAMPLE_TEMPLATE_VARS[body.id],
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: formatSmtpError(error) },
      { status: 500 },
    );
  }
}
