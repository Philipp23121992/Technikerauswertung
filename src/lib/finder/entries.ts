import { z } from "zod";
import { geocodePlz, isValidPlz, normalizePlz } from "./geo";
import { listByKind, uid, updateDb } from "./db";
import type { ContactEntry, EntityKind } from "./types";

export const entryInputSchema = z.object({
  name: z.string().min(2),
  company: z.string().optional().default(""),
  plz: z.string().min(4),
  city: z.string().optional().default(""),
  street: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  email: z.string().optional().default(""),
  notes: z.string().optional().default(""),
  active: z.boolean().optional().default(true),
});

export type EntryInput = z.infer<typeof entryInputSchema>;

export async function createEntry(
  kind: EntityKind,
  input: EntryInput,
): Promise<ContactEntry> {
  const plz = normalizePlz(input.plz);
  if (!isValidPlz(plz)) throw new Error("INVALID_PLZ");

  let created: ContactEntry | null = null;
  await updateDb(async (db) => {
    const geo = await geocodePlz(plz, db.plzCache);
    if (!geo) throw new Error("PLZ_NOT_FOUND");
    const now = new Date().toISOString();
    created = {
      id: uid(kind === "TECHNICIAN" ? "tec" : "par"),
      kind,
      name: input.name.trim(),
      company: input.company.trim(),
      plz,
      city: (input.city || geo.city || "").trim(),
      street: input.street.trim(),
      phone: input.phone.trim(),
      email: input.email.trim(),
      notes: input.notes.trim(),
      lat: geo.lat,
      lon: geo.lon,
      active: input.active ?? true,
      createdAt: now,
      updatedAt: now,
    };
    listByKind(db, kind).push(created);
  });
  return created!;
}

export async function updateEntry(
  kind: EntityKind,
  id: string,
  input: EntryInput,
): Promise<ContactEntry> {
  const plz = normalizePlz(input.plz);
  if (!isValidPlz(plz)) throw new Error("INVALID_PLZ");

  let updated: ContactEntry | null = null;
  await updateDb(async (db) => {
    const list = listByKind(db, kind);
    const item = list.find((e) => e.id === id);
    if (!item) throw new Error("NOT_FOUND");

    const geo = await geocodePlz(plz, db.plzCache);
    if (!geo) throw new Error("PLZ_NOT_FOUND");

    Object.assign(item, {
      name: input.name.trim(),
      company: input.company.trim(),
      plz,
      city: (input.city || geo.city || "").trim(),
      street: input.street.trim(),
      phone: input.phone.trim(),
      email: input.email.trim(),
      notes: input.notes.trim(),
      lat: geo.lat,
      lon: geo.lon,
      active: input.active ?? true,
      updatedAt: new Date().toISOString(),
    });
    updated = item;
  });
  return updated!;
}

export async function deleteEntry(kind: EntityKind, id: string): Promise<void> {
  await updateDb((db) => {
    if (kind === "TECHNICIAN") {
      db.technicians = db.technicians.filter((e) => e.id !== id);
    } else {
      db.partners = db.partners.filter((e) => e.id !== id);
    }
  });
}
