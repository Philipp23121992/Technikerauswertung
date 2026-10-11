import { NextResponse } from "next/server";
import { denyIfResponse, requireAppWrite } from "@/lib/auth/guards";
import {
  MAIL_IMPORT_MAX_BYTES,
  MAIL_IMPORT_MAX_FILES,
  parseMailBytesToTaskDraft,
  parseMailTextToTaskDraft,
  type MailTaskDraft,
} from "@/lib/aufgaben/mail-import";

export const runtime = "nodejs";
export const maxDuration = 60;

function asDraftList(drafts: MailTaskDraft[]) {
  return NextResponse.json({ drafts });
}

export async function POST(req: Request) {
  const access = await requireAppWrite(req, "verwaltung");
  if (denyIfResponse(access)) return access;

  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await req.json().catch(() => null)) as {
        text?: string;
        html?: string;
        fileName?: string;
      } | null;
      const draft = parseMailTextToTaskDraft({
        text: body?.text,
        html: body?.html,
        fileName: body?.fileName,
      });
      return asDraftList([draft]);
    }

    const form = await req.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ error: "Mail-Datei fehlt." }, { status: 400 });
    }

    const files = [
      ...form.getAll("file"),
      ...form.getAll("files"),
    ].filter((item): item is File => item instanceof File);
    if (!files.length) {
      return NextResponse.json({ error: "Bitte eine E-Mail (.eml / .msg) ablegen." }, { status: 400 });
    }
    if (files.length > MAIL_IMPORT_MAX_FILES) {
      return NextResponse.json(
        { error: `Maximal ${MAIL_IMPORT_MAX_FILES} Mails auf einmal.` },
        { status: 400 },
      );
    }

    const drafts: MailTaskDraft[] = [];
    for (const file of files) {
      if (file.size > MAIL_IMPORT_MAX_BYTES) {
        return NextResponse.json(
          { error: `${file.name || "Mail"} ist größer als 8 MB.` },
          { status: 400 },
        );
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      drafts.push(await parseMailBytesToTaskDraft(bytes, file.name || "mail.eml"));
    }
    return asDraftList(drafts);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Die Mail konnte nicht gelesen werden.",
      },
      { status: 400 },
    );
  }
}
