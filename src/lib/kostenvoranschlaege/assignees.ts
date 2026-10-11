import { createId } from "@/lib/id";

export type QuoteAssignee = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
};

export type QuoteAssigneesDb = {
  version: 1;
  assignees: QuoteAssignee[];
};

export function createEmptyAssigneesDb(): QuoteAssigneesDb {
  return { version: 1, assignees: [] };
}

export function createAssignee(partial?: Partial<QuoteAssignee>): QuoteAssignee {
  const now = new Date().toISOString();
  return {
    id: partial?.id?.trim() || createId("kvasg"),
    name: partial?.name?.trim() ?? "",
    email: partial?.email?.trim() ?? "",
    createdAt: partial?.createdAt ?? now,
    updatedAt: now,
  };
}

export function normalizeAssignee(raw: Partial<QuoteAssignee>): QuoteAssignee | null {
  if (!raw?.id || typeof raw.id !== "string") return null;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const email = typeof raw.email === "string" ? raw.email.trim() : "";
  if (!name) return null;
  return {
    id: raw.id,
    name,
    email,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}
