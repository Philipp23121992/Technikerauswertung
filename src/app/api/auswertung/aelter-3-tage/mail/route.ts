import { NextResponse } from "next/server";

import { denyIfResponse, requireAppAccess, requireAppWrite } from "@/lib/auth/guards";

import {

  planAelter3TechnicianMails,

  readAelter3TageMailTemplates,

  sendAelter3TechnicianMails,

  writeAelter3TageMailTemplates,

} from "@/lib/auswertung/aelter-3-tage-mail";

import { isAelter3MailTab, type Aelter3TageMailTemplate } from "@/lib/auswertung/aelter-3-tage-mail-types";



export const runtime = "nodejs";



function parseReferenceDate(raw: string | null | undefined): string {

  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  return new Date().toISOString().slice(0, 10);

}



export async function GET(req: Request) {

  const access = await requireAppAccess(req, "auswertung");

  if (denyIfResponse(access)) return access;



  const db = await readAelter3TageMailTemplates();

  return NextResponse.json(db);

}



export async function PUT(req: Request) {

  const access = await requireAppWrite(req, "auswertung");

  if (denyIfResponse(access)) return access;



  const body = (await req.json().catch(() => null)) as {

    templates?: Aelter3TageMailTemplate[];

  } | null;



  if (!body?.templates || !Array.isArray(body.templates)) {

    return NextResponse.json({ error: "templates erforderlich." }, { status: 400 });

  }



  const saved = await writeAelter3TageMailTemplates(body.templates);

  return NextResponse.json(saved);

}



export async function POST(req: Request) {

  const access = await requireAppWrite(req, "auswertung");

  if (denyIfResponse(access)) return access;



  const body = (await req.json().catch(() => null)) as {

    tab?: string;

    referenceDate?: string;

    onlyOlder?: boolean;

    subject?: string;

    bodyText?: string;

    send?: boolean;

    memberIds?: string[];

    cc?: string;

  } | null;



  if (!body?.tab || !isAelter3MailTab(body.tab)) {

    return NextResponse.json({ error: "Ungültige Registerkarte für E-Mail." }, { status: 400 });

  }



  const referenceDate = parseReferenceDate(body.referenceDate);

  const onlyOlder = body.onlyOlder !== false;

  const memberIds = Array.isArray(body.memberIds)

    ? body.memberIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim()))

    : undefined;



  const payload = {

    tab: body.tab,

    referenceDate,

    onlyOlder,

    subject: body.subject,

    body: body.bodyText,

    memberIds,

    cc: body.cc,

  };



  try {

    if (body.send === true) {

      const result = await sendAelter3TechnicianMails(payload);

      return NextResponse.json({

        sent: result.sent,

        plan: result.plan,

      });

    }

    const plan = await planAelter3TechnicianMails(payload);

    return NextResponse.json({ preview: true, plan });

  } catch (error) {

    return NextResponse.json(

      { error: error instanceof Error ? error.message : "E-Mail-Versand fehlgeschlagen." },

      { status: 400 },

    );

  }

}


