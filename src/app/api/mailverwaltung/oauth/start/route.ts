import { resolveOutlookConnectUrl } from "@/lib/mailverwaltung/oauth-start";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const mailboxId = new URL(req.url).searchParams.get("mailboxId")?.trim() || "";
  const target = await resolveOutlookConnectUrl(req, mailboxId);
  return new Response(null, {
    status: 302,
    headers: {
      Location: target,
      "Cache-Control": "no-store",
    },
  });
}
