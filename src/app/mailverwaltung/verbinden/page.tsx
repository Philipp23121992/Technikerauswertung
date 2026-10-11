import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { MicrosoftJump } from "@/components/mailverwaltung/MicrosoftJump";
import { resolveOutlookConnectUrl } from "@/lib/mailverwaltung/oauth-start";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requestFromHeaders(headerList: Headers, mailboxId: string): Request {
  const forwardedHost = headerList.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = headerList.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const origin =
    forwardedHost && forwardedProto
      ? `${forwardedProto}://${forwardedHost}`
      : forwardedHost
        ? `https://${forwardedHost}`
        : "https://www.apm-servicetools.de";
  return new Request(
    `${origin}/mailverwaltung/verbinden?mailboxId=${encodeURIComponent(mailboxId)}`,
    { headers: headerList },
  );
}

export default async function OutlookConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ mailboxId?: string }>;
}) {
  const params = await searchParams;
  const mailboxId = params.mailboxId?.trim() || "";
  const headerList = await headers();
  const target = await resolveOutlookConnectUrl(
    requestFromHeaders(headerList, mailboxId),
    mailboxId,
  );
  if (target.startsWith("https://login.microsoftonline.com")) {
    return <MicrosoftJump url={target} />;
  }
  redirect(target);
}
