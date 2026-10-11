import { promises as fs } from "fs";
import path from "path";
import { writeJsonAtomic } from "@/lib/atomic-write";

const DATA_DIR = path.join(process.cwd(), "data");
export const MAILVERWALTUNG_SECRETS_PATH = path.join(
  DATA_DIR,
  "mailverwaltung-secrets.json",
);
export const MAILVERWALTUNG_TOKENS_PATH = path.join(
  DATA_DIR,
  "mailverwaltung-tokens.json",
);

export type GraphSecrets = {
  clientSecret: string;
  imapPasswords: Record<string, string>;
};

export type MailboxToken = {
  mailboxId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  graphUserId?: string;
};

type TokenStore = {
  version: 1;
  tokens: MailboxToken[];
};

function normalizeImapPasswords(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const next: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string" && entry.trim()) next[key] = entry;
  }
  return next;
}

export async function readGraphSecrets(): Promise<GraphSecrets> {
  try {
    const raw = await fs.readFile(MAILVERWALTUNG_SECRETS_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<GraphSecrets> & { imapPasswords?: unknown };
    return {
      clientSecret: typeof parsed.clientSecret === "string" ? parsed.clientSecret : "",
      imapPasswords: normalizeImapPasswords(parsed.imapPasswords),
    };
  } catch {
    return {
      clientSecret: process.env.MS_GRAPH_CLIENT_SECRET?.trim() || "",
      imapPasswords: {},
    };
  }
}

export async function writeGraphSecrets(secrets: Pick<GraphSecrets, "clientSecret">): Promise<void> {
  const current = await readGraphSecrets();
  await writeJsonAtomic(MAILVERWALTUNG_SECRETS_PATH, {
    clientSecret: secrets.clientSecret,
    imapPasswords: current.imapPasswords,
  });
}

export async function getImapPassword(mailboxId: string): Promise<string> {
  const secrets = await readGraphSecrets();
  return secrets.imapPasswords[mailboxId] || "";
}

export async function saveImapPassword(mailboxId: string, password: string): Promise<void> {
  const current = await readGraphSecrets();
  const imapPasswords = { ...current.imapPasswords };
  if (password.trim()) imapPasswords[mailboxId] = password.trim();
  else delete imapPasswords[mailboxId];
  await writeJsonAtomic(MAILVERWALTUNG_SECRETS_PATH, {
    clientSecret: current.clientSecret,
    imapPasswords,
  });
}

export async function deleteImapPassword(mailboxId: string): Promise<void> {
  await saveImapPassword(mailboxId, "");
}

async function readTokenStore(): Promise<TokenStore> {
  try {
    const raw = await fs.readFile(MAILVERWALTUNG_TOKENS_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<TokenStore>;
    return {
      version: 1,
      tokens: Array.isArray(parsed.tokens) ? (parsed.tokens as MailboxToken[]) : [],
    };
  } catch {
    return { version: 1, tokens: [] };
  }
}

export async function getMailboxToken(mailboxId: string): Promise<MailboxToken | null> {
  const store = await readTokenStore();
  return store.tokens.find((item) => item.mailboxId === mailboxId) ?? null;
}

export async function saveMailboxToken(token: MailboxToken): Promise<void> {
  const store = await readTokenStore();
  const tokens = store.tokens.filter((item) => item.mailboxId !== token.mailboxId);
  tokens.push(token);
  await writeJsonAtomic(MAILVERWALTUNG_TOKENS_PATH, { version: 1, tokens });
}

export async function deleteMailboxToken(mailboxId: string): Promise<void> {
  const store = await readTokenStore();
  await writeJsonAtomic(MAILVERWALTUNG_TOKENS_PATH, {
    version: 1,
    tokens: store.tokens.filter((item) => item.mailboxId !== mailboxId),
  });
  await deleteImapPassword(mailboxId);
}
