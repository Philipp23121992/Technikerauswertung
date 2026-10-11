import { readLocalBackup } from "@/lib/local-backup";
import { readTechnikerverwaltungDb } from "@/lib/technikerverwaltung/db";

export type AddressBook = {
  byId: Map<string, string>;
  byName: Map<string, string>;
};

export function extractEmail(value: string): string | null {
  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : null;
}

function nameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function addAddress(
  book: AddressBook,
  id: string | null | undefined,
  name: string | undefined,
  emailRaw: string | undefined,
) {
  const email = emailRaw ? extractEmail(emailRaw) : null;
  if (!email) return;
  if (id) book.byId.set(id, email);
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return;
  const key = nameKey(trimmed);
  if (!book.byName.has(key)) book.byName.set(key, email);
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    const last = nameKey(parts[parts.length - 1]);
    if (!book.byName.has(last)) book.byName.set(last, email);
  }
}

export async function loadAddressBook(): Promise<AddressBook> {
  const book: AddressBook = {
    byId: new Map(),
    byName: new Map(),
  };

  const [team, backup] = await Promise.all([
    readTechnikerverwaltungDb(),
    readLocalBackup(),
  ]);

  for (const member of team.members) {
    addAddress(book, member.id, member.name, member.email);
    if (member.technicianId) {
      addAddress(book, member.technicianId, member.name, member.email);
    }
  }

  for (const tech of backup.meetingsTechnicians.technicians) {
    addAddress(book, tech.id, tech.name, tech.email);
  }

  for (const tech of backup.tracker?.technicians ?? []) {
    addAddress(book, tech.id, tech.name, tech.email);
  }

  return book;
}

export function lookupEmails(
  book: AddressBook,
  opts: { ids?: string[]; names?: string[]; emails?: string[] },
): string[] {
  const found = new Set<string>();

  for (const raw of opts.emails ?? []) {
    const email = extractEmail(raw);
    if (email) found.add(email);
  }

  for (const id of opts.ids ?? []) {
    const email = book.byId.get(id);
    if (email) found.add(email);
  }

  for (const name of opts.names ?? []) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    const email =
      book.byName.get(nameKey(trimmed)) ??
      book.byName.get(nameKey(trimmed.split(/\s+/).pop() ?? ""));
    if (email) found.add(email);
  }

  return [...found];
}
