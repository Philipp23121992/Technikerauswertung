import {
  getMailboxToken,
  readGraphSecrets,
  saveMailboxToken,
  type MailboxToken,
} from "./tokens";
import type { MailverwaltungSettings } from "./types";

const GRAPH = "https://graph.microsoft.com/v1.0";

export const GRAPH_SCOPES = [
  "openid",
  "profile",
  "offline_access",
  "User.Read",
  "Mail.ReadWrite",
  "MailboxSettings.Read",
].join(" ");

export function graphAuthUrl(
  settings: MailverwaltungSettings,
  state: string,
  loginHint?: string,
): string {
  const tenant = settings.tenantId.trim() || "common";
  const params = new URLSearchParams({
    client_id: settings.clientId.trim(),
    response_type: "code",
    redirect_uri: settings.redirectUri.trim(),
    response_mode: "query",
    scope: GRAPH_SCOPES,
    state,
    prompt: "select_account",
  });
  if (loginHint?.includes("@")) {
    params.set("login_hint", loginHint);
  }
  return `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize?${params.toString()}`;
}

async function tokenRequest(
  settings: MailverwaltungSettings,
  body: URLSearchParams,
): Promise<MailboxToken & { graphUserId?: string }> {
  const secrets = await readGraphSecrets();
  if (!settings.clientId.trim() || !secrets.clientSecret) {
    throw new Error("Microsoft-Graph-App ist nicht vollständig konfiguriert (Client-ID/Secret).");
  }
  body.set("client_id", settings.clientId.trim());
  body.set("client_secret", secrets.clientSecret);
  const tenant = settings.tenantId.trim() || "common";
  const res = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || "OAuth-Token konnte nicht geholt werden.");
  }
  return {
    mailboxId: "",
    accessToken: data.access_token,
    refreshToken: data.refresh_token || "",
    expiresAt: Date.now() + Math.max(60, Number(data.expires_in) || 3600) * 1000,
  };
}

export async function exchangeAuthCode(
  settings: MailverwaltungSettings,
  mailboxId: string,
  code: string,
): Promise<MailboxToken> {
  const token = await tokenRequest(
    settings,
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: settings.redirectUri.trim(),
      scope: GRAPH_SCOPES,
    }),
  );
  const withId = { ...token, mailboxId };
  await saveMailboxToken(withId);
  return withId;
}

async function refreshAccessToken(
  settings: MailverwaltungSettings,
  current: MailboxToken,
): Promise<MailboxToken> {
  if (!current.refreshToken) {
    throw new Error("Kein Refresh-Token vorhanden. Postfach bitte neu verbinden.");
  }
  const token = await tokenRequest(
    settings,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: current.refreshToken,
      scope: GRAPH_SCOPES,
    }),
  );
  const next = {
    ...current,
    accessToken: token.accessToken,
    refreshToken: token.refreshToken || current.refreshToken,
    expiresAt: token.expiresAt,
  };
  await saveMailboxToken(next);
  return next;
}

export async function getValidAccessToken(
  settings: MailverwaltungSettings,
  mailboxId: string,
): Promise<string> {
  const current = await getMailboxToken(mailboxId);
  if (!current) {
    throw new Error("Postfach ist nicht mit Outlook verbunden.");
  }
  if (current.expiresAt - 60_000 > Date.now()) {
    return current.accessToken;
  }
  const refreshed = await refreshAccessToken(settings, current);
  return refreshed.accessToken;
}

export type GraphMail = {
  id: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  body?: { content?: string; contentType?: string };
  from?: { emailAddress?: { address?: string; name?: string } };
  toRecipients?: Array<{ emailAddress?: { address?: string } }>;
  receivedDateTime?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
  importance?: string;
};

export type GraphAttachment = {
  id: string;
  name?: string;
  contentType?: string;
  size?: number;
  "@odata.type"?: string;
};

async function graphFetch<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 204) return {} as T;
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) {
    throw new Error(data.error?.message || `Graph-Fehler ${res.status}`);
  }
  return data;
}

export async function graphMe(accessToken: string): Promise<{ id: string; mail?: string; userPrincipalName?: string; displayName?: string }> {
  return graphFetch(accessToken, "/me?$select=id,mail,userPrincipalName,displayName");
}

export async function graphListMessages(accessToken: string): Promise<GraphMail[]> {
  const data = await graphFetch<{ value?: GraphMail[] }>(
    accessToken,
    "/me/messages?$top=40&$orderby=receivedDateTime desc&$select=id,conversationId,subject,bodyPreview,from,toRecipients,receivedDateTime,isRead,hasAttachments,importance",
  );
  return data.value ?? [];
}

export async function graphMessageBody(
  accessToken: string,
  graphId: string,
): Promise<string> {
  const data = await graphFetch<GraphMail>(
    accessToken,
    `/me/messages/${encodeURIComponent(graphId)}?$select=body`,
  );
  const html = data.body?.content || "";
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function graphListAttachments(
  accessToken: string,
  graphId: string,
): Promise<GraphAttachment[]> {
  const data = await graphFetch<{ value?: GraphAttachment[] }>(
    accessToken,
    `/me/messages/${encodeURIComponent(graphId)}/attachments?$select=id,name,contentType,size`,
  );
  return data.value ?? [];
}

export async function graphMarkRead(
  accessToken: string,
  graphId: string,
  isRead: boolean,
): Promise<void> {
  await graphFetch(accessToken, `/me/messages/${encodeURIComponent(graphId)}`, {
    method: "PATCH",
    body: JSON.stringify({ isRead }),
  });
}

type GraphFolder = { id: string; displayName?: string };

async function ensureChildFolder(
  accessToken: string,
  parentId: string | null,
  name: string,
): Promise<string> {
  const listPath = parentId
    ? `/me/mailFolders/${encodeURIComponent(parentId)}/childFolders?$top=50`
    : "/me/mailFolders?$top=80";
  const listed = await graphFetch<{ value?: GraphFolder[] }>(accessToken, listPath);
  const existing = listed.value?.find(
    (item) => (item.displayName || "").toLowerCase() === name.toLowerCase(),
  );
  if (existing?.id) return existing.id;
  const created = await graphFetch<GraphFolder>(
    accessToken,
    parentId
      ? `/me/mailFolders/${encodeURIComponent(parentId)}/childFolders`
      : "/me/mailFolders",
    {
      method: "POST",
      body: JSON.stringify({ displayName: name }),
    },
  );
  if (!created.id) throw new Error(`Ordner „${name}“ konnte nicht angelegt werden.`);
  return created.id;
}

export async function graphArchiveMessage(
  accessToken: string,
  graphId: string,
  senderName: string,
): Promise<void> {
  const rootId = await ensureChildFolder(accessToken, null, "APM Mailverwaltung");
  const senderId = await ensureChildFolder(accessToken, rootId, senderName.slice(0, 64) || "Absender");
  const archiveId = await ensureChildFolder(accessToken, senderId, "Archiv");
  await graphFetch(accessToken, `/me/messages/${encodeURIComponent(graphId)}/move`, {
    method: "POST",
    body: JSON.stringify({ destinationId: archiveId }),
  });
}
