import { personNameKeys } from "@/lib/ticket-import";
import { listByKind, readDb, writeDb } from "@/lib/finder/db";
import { geocodePlz, isValidPlz, normalizePlz } from "@/lib/finder/geo";
import type { GeoPoint } from "@/lib/finder/types";
import type { DispositionHome, DispositionTicket } from "./types";

type GeoCache = Record<string, GeoPoint & { city?: string }>;

function isPlausibleDeCoord(lat: number, lon: number): boolean {
  return lat >= 47 && lat <= 55.2 && lon >= 5.5 && lon <= 15.5;
}

function hasAddressParts(street?: string, plz?: string, city?: string): boolean {
  return Boolean((street || "").trim() || (plz || "").trim() || (city || "").trim());
}

function refineAddress(
  street: string,
  plzInput: string,
  city: string,
  fallbackLabel = "",
): { street: string; plz: string; city: string; query: string } {
  const plz = plzInput ? normalizePlz(plzInput) : "";
  let streetTrim = street.trim();
  let cityTrim = city.replace(/,?\s*DE\s*$/i, "").trim();

  const cityStreet = cityTrim.match(/^([^,]+),\s*(.+)$/);
  if (
    cityStreet &&
    !/\d/.test(streetTrim) &&
    /\d|\bstr(?:a(?:ss|ß)e)?\.?|\bweg\b|\ballee\b|\bplatz\b|\bring\b|\bgasse\b/i.test(cityStreet[2])
  ) {
    streetTrim = cityStreet[2].replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
    cityTrim = cityStreet[1].trim();
  }

  const query = [streetTrim, plz, cityTrim, fallbackLabel, "Germany"]
    .map((part) => part.trim())
    .filter((part, index, all) => part && all.indexOf(part) === index)
    .join(", ");

  return { street: streetTrim, plz, city: cityTrim, query };
}

async function nominatimSearch(
  params: Record<string, string>,
): Promise<{ lat: number; lon: number; city?: string } | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  url.searchParams.set("countrycodes", "de");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(8000),
    headers: {
      Accept: "application/json",
      "User-Agent": "APM-Servicetools/1.0 (disposition; local app)",
    },
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ lat: string; lon: string; display_name?: string }>;
  const row = rows?.[0];
  if (!row) return null;
  const lat = Number(row.lat);
  const lon = Number(row.lon);
  if (!isPlausibleDeCoord(lat, lon)) return null;
  return { lat, lon, city: row.display_name?.split(",")[0] };
}

export async function geocodeAddress(
  street: string,
  plzInput: string,
  city: string,
  cache: GeoCache,
  fallbackLabel = "",
): Promise<(GeoPoint & { city?: string; plz: string }) | null> {
  const refined = refineAddress(street, plzInput, city, fallbackLabel);
  const key = `addr:${refined.street}|${refined.plz}|${refined.city}|${refined.query}`.toLowerCase();
  if (cache[key] && isPlausibleDeCoord(cache[key].lat, cache[key].lon)) {
    return { ...cache[key], plz: refined.plz || cache[key].city || "" };
  }

  const remember = (geo: { lat: number; lon: number; city?: string }) => {
    const cityName = refined.city || geo.city;
    cache[key] = { lat: geo.lat, lon: geo.lon, city: cityName };
    return { lat: geo.lat, lon: geo.lon, city: cityName, plz: refined.plz };
  };

  try {
    if (refined.street) {
      const structured = await nominatimSearch({
        street: refined.street,
        postalcode: refined.plz && isValidPlz(refined.plz) ? refined.plz : "",
        city: refined.city,
        country: "Germany",
      });
      if (structured) return remember(structured);
    }
    if (refined.query && refined.query.replace(/,?\s*Germany$/i, "").trim()) {
      const free = await nominatimSearch({ q: refined.query });
      if (free) return remember(free);
    }
  } catch {
    // PLZ-Fallback
  }

  if (refined.plz && isValidPlz(refined.plz)) {
    const geo = await geocodePlz(refined.plz, cache);
    if (geo) return geo;
  }
  return null;
}

export async function geocodeTicketAddresses(
  tickets: DispositionTicket[],
): Promise<DispositionTicket[]> {
  const db = await readDb();
  const next = [...tickets];
  const deadline = Date.now() + 45_000;
  for (const ticket of next) {
    if (Date.now() > deadline) break;
    if (ticket.lat != null && ticket.lon != null) continue;
    if (!ticket.street && !ticket.plz && !ticket.city && !ticket.addressLabel) continue;
    const geo = await geocodeAddress(
      ticket.street,
      ticket.plz,
      ticket.city,
      db.plzCache,
      ticket.addressLabel,
    );
    if (!geo) continue;
    ticket.lat = geo.lat;
    ticket.lon = geo.lon;
    if (!ticket.city && geo.city) ticket.city = geo.city;
  }
  await writeDb(db);
  return next;
}

export async function geocodeHome(home: DispositionHome): Promise<DispositionHome> {
  const db = await readDb();
  let next = { ...home };
  if (next.lat == null || next.lon == null) {
    const geo = await geocodeAddress(next.street, next.plz, next.city, db.plzCache);
    if (geo) {
      next = {
        ...next,
        plz: next.plz || geo.plz,
        city: next.city || geo.city || "",
        lat: geo.lat,
        lon: geo.lon,
      };
    }
  }
  const hasEnd = Boolean(next.endStreet || next.endPlz || next.endCity);
  if (hasEnd && (next.endLat == null || next.endLon == null)) {
    const geo = await geocodeAddress(next.endStreet, next.endPlz, next.endCity, db.plzCache);
    if (geo) {
      next = {
        ...next,
        endPlz: next.endPlz || geo.plz,
        endCity: next.endCity || geo.city || "",
        endLat: geo.lat,
        endLon: geo.lon,
      };
    }
  }
  await writeDb(db);
  return next;
}

export type TechnicianLocation = {
  id: string;
  name: string;
  street?: string;
  plz?: string;
  city?: string;
  endStreet?: string;
  endPlz?: string;
  endCity?: string;
};

export async function homesFromTechnicians(
  technicians: TechnicianLocation[],
  existing: DispositionHome[],
): Promise<DispositionHome[]> {
  const current = new Map(existing.map((item) => [item.technicianId, item]));
  for (const tech of technicians) {
    const plz = (tech.plz || "").replace(/\D/g, "").slice(0, 5);
    if (!plz && !tech.street && !tech.city) continue;
    const prev = current.get(tech.id);
    const sameStart =
      prev &&
      prev.street === (tech.street || "").trim() &&
      prev.plz === plz &&
      prev.city === (tech.city || "").trim();
    const sameEnd =
      prev &&
      prev.endStreet === (tech.endStreet || "").trim() &&
      prev.endPlz === (tech.endPlz || "").replace(/\D/g, "").slice(0, 5) &&
      prev.endCity === (tech.endCity || "").trim();
    let home: DispositionHome = {
      technicianId: tech.id,
      technicianName: tech.name,
      street: (tech.street || "").trim(),
      plz,
      city: (tech.city || "").trim(),
      lat: sameStart ? prev?.lat ?? null : null,
      lon: sameStart ? prev?.lon ?? null : null,
      endStreet: (tech.endStreet || "").trim(),
      endPlz: (tech.endPlz || "").replace(/\D/g, "").slice(0, 5),
      endCity: (tech.endCity || "").trim(),
      endLat: sameEnd ? prev?.endLat ?? null : null,
      endLon: sameEnd ? prev?.endLon ?? null : null,
    };
    home = await geocodeHome(home);
    current.set(tech.id, home);
  }
  return [...current.values()];
}

export async function homesFromFinder(
  technicians: TechnicianLocation[],
  existing: DispositionHome[],
): Promise<DispositionHome[]> {
  const db = await readDb();
  const finderTechs = listByKind(db, "TECHNICIAN").filter((item) => item.active);
  const byKey = new Map<string, (typeof finderTechs)[number]>();
  for (const entry of finderTechs) {
    for (const key of personNameKeys(entry.name)) {
      if (!byKey.has(key)) byKey.set(key, entry);
    }
  }
  const current = new Map(existing.map((item) => [item.technicianId, item]));
  for (const tech of technicians) {
    let hit = null as (typeof finderTechs)[number] | null;
    for (const key of personNameKeys(tech.name)) {
      const found = byKey.get(key);
      if (found) {
        hit = found;
        break;
      }
    }
    const fromDb = hasAddressParts(tech.street, tech.plz, tech.city);
    const fromFinder = Boolean(hit && hasAddressParts(hit.street, hit.plz, hit.city));
    if (!fromDb && !fromFinder) continue;

    const prev = current.get(tech.id);
    const street = (fromDb ? tech.street || "" : hit?.street || "").trim();
    const plz = ((fromDb ? tech.plz || "" : hit?.plz || "") || "").replace(/\D/g, "").slice(0, 5);
    const city = (fromDb ? tech.city || "" : hit?.city || "").trim();
    const endFromDb = hasAddressParts(tech.endStreet, tech.endPlz, tech.endCity);
    const endStreet = (endFromDb ? tech.endStreet || "" : street).trim();
    const endPlz = ((endFromDb ? tech.endPlz || "" : plz) || "").replace(/\D/g, "").slice(0, 5);
    const endCity = (endFromDb ? tech.endCity || "" : city).trim();

    const sameStart =
      prev && prev.street === street && prev.plz === plz && prev.city === city;
    const sameEnd =
      prev && prev.endStreet === endStreet && prev.endPlz === endPlz && prev.endCity === endCity;

    const hitPlz = ((hit?.plz || "").replace(/\D/g, "")).slice(0, 5);
    const hitStreet = (hit?.street || "").trim();
    let lat =
      sameStart && prev?.lat != null
        ? prev.lat
        : hit && hitStreet === street && hitPlz === plz && hit.lat && hit.lat !== 0
          ? hit.lat
          : null;
    let lon =
      sameStart && prev?.lon != null
        ? prev.lon
        : hit && hitStreet === street && hitPlz === plz && hit.lon && hit.lon !== 0
          ? hit.lon
          : null;
    let endLat = sameEnd && prev?.endLat != null ? prev.endLat : lat;
    let endLon = sameEnd && prev?.endLon != null ? prev.endLon : lon;

    if ((lat == null || lon == null) && street + plz + city) {
      const geo = await geocodeAddress(street, plz, city, db.plzCache);
      if (geo) {
        lat = geo.lat;
        lon = geo.lon;
      }
    }
    if ((endLat == null || endLon == null) && endStreet + endPlz + endCity) {
      if (endStreet === street && endPlz === plz && endCity === city) {
        endLat = lat;
        endLon = lon;
      } else {
        const geo = await geocodeAddress(endStreet, endPlz, endCity, db.plzCache);
        if (geo) {
          endLat = geo.lat;
          endLon = geo.lon;
        }
      }
    }

    current.set(tech.id, {
      technicianId: tech.id,
      technicianName: tech.name,
      plz,
      city,
      street,
      lat,
      lon,
      endStreet,
      endPlz,
      endCity,
      endLat,
      endLon,
    });
  }
  await writeDb(db);
  return [...current.values()];
}
