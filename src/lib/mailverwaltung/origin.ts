const PRODUCTION_ORIGIN = "https://www.apm-servicetools.de";

export function publicOrigin(req: Request): string {
  const url = new URL(req.url);
  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedHost) {
    const proto =
      forwardedProto ||
      (forwardedHost.startsWith("localhost") || forwardedHost.startsWith("127.")
        ? "http"
        : "https");
    return `${proto}://${forwardedHost}`;
  }
  if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
    return PRODUCTION_ORIGIN;
  }
  return url.origin;
}

export function graphRedirectUri(req: Request, configured: string): string {
  const trimmed = configured.trim();
  if (trimmed) return trimmed;
  return `${publicOrigin(req)}/api/mailverwaltung/oauth/callback`;
}

export const DEFAULT_GRAPH_REDIRECT_URI = `${PRODUCTION_ORIGIN}/api/mailverwaltung/oauth/callback`;
