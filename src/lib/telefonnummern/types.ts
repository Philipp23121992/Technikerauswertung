import { createId } from "@/lib/id";

export const PHONE_CATEGORIES = [
  "intern",
  "hersteller",
  "partner",
  "notfall",
  "sonstige",
] as const;

export type PhoneCategory = (typeof PHONE_CATEGORIES)[number];

export const PHONE_CATEGORY_LABELS: Record<PhoneCategory, string> = {
  intern: "Intern",
  hersteller: "Hersteller",
  partner: "Partner",
  notfall: "Notfall",
  sonstige: "Sonstige",
};

export type PhoneContact = {
  id: string;
  name: string;
  company: string;
  role: string;
  phone: string;
  mobile: string;
  email: string;
  category: PhoneCategory;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type TelefonnummernDb = {
  version: 1;
  contacts: PhoneContact[];
};

export function createEmptyTelefonnummernDb(): TelefonnummernDb {
  return { version: 1, contacts: [] };
}

function isCategory(value: unknown): value is PhoneCategory {
  return typeof value === "string" && (PHONE_CATEGORIES as readonly string[]).includes(value);
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeContact(raw: Partial<PhoneContact>): PhoneContact | null {
  if (!raw?.id || typeof raw.id !== "string") return null;
  const name = asText(raw.name);
  if (!name) return null;
  const now = new Date().toISOString();
  return {
    id: raw.id,
    name,
    company: asText(raw.company),
    role: asText(raw.role),
    phone: asText(raw.phone),
    mobile: asText(raw.mobile),
    email: asText(raw.email),
    category: isCategory(raw.category) ? raw.category : "sonstige",
    notes: typeof raw.notes === "string" ? raw.notes : "",
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : now,
  };
}

export function createContact(input: {
  name: string;
  company?: string;
  role?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  category?: PhoneCategory;
  notes?: string;
}): PhoneContact {
  const now = new Date().toISOString();
  return {
    id: createId("tel"),
    name: input.name.trim(),
    company: input.company?.trim() ?? "",
    role: input.role?.trim() ?? "",
    phone: input.phone?.trim() ?? "",
    mobile: input.mobile?.trim() ?? "",
    email: input.email?.trim() ?? "",
    category: input.category ?? "sonstige",
    notes: input.notes ?? "",
    createdAt: now,
    updatedAt: now,
  };
}

export function telHref(value: string): string | null {
  const compact = value.replace(/[^\d+]/g, "");
  if (compact.replace(/\D/g, "").length < 3) return null;
  return `tel:${compact}`;
}

export function mailtoHref(value: string): string | null {
  const email = value.trim();
  if (!email.includes("@") || email.length < 5) return null;
  return `mailto:${email}`;
}
