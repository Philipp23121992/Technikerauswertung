import {
  distanceKm,
  drivingLegsFrom,
  geocodePlz,
  isValidPlz,
  normalizePlz,
} from "./geo";
import { listByKind, updateDb } from "./db";
import type { EntityKind, NearbyMatch, SearchResult } from "./types";

/** Candidates considered for routing before taking the top N by driving distance. */
const ROUTE_CANDIDATES = 20;

export async function findNearest(
  plzInput: string,
  kind: EntityKind,
  limit = 5,
): Promise<SearchResult> {
  const plz = normalizePlz(plzInput);
  if (!isValidPlz(plz)) {
    throw new Error("INVALID_PLZ");
  }

  let query: SearchResult["query"] | null = null;
  let matches: NearbyMatch[] = [];

  await updateDb(async (db) => {
    const geo = await geocodePlz(plz, db.plzCache);
    if (!geo) throw new Error("PLZ_NOT_FOUND");

    query = {
      plz: geo.plz,
      city: geo.city,
      lat: geo.lat,
      lon: geo.lon,
      kind,
    };

    const origin = { lat: geo.lat, lon: geo.lon };
    const pool = listByKind(db, kind).filter((e) => e.active);

    // Preselect nearest by air distance to keep OSRM requests small.
    const candidates = pool
      .map((entry) => ({
        entry,
        airKm: distanceKm(origin, { lat: entry.lat, lon: entry.lon }),
      }))
      .sort((a, b) => a.airKm - b.airKm)
      .slice(0, Math.max(limit, ROUTE_CANDIDATES));

    const legs = await drivingLegsFrom(
      origin,
      candidates.map((c) => ({ lat: c.entry.lat, lon: c.entry.lon })),
    );

    matches = candidates
      .map((candidate, index) => {
        const leg = legs[index];
        const distance =
          leg?.distanceKm ?? Math.round(candidate.airKm * 10) / 10;
        return {
          ...candidate.entry,
          distanceKm: distance,
          durationMin: leg?.durationMin,
          distanceMode: leg ? ("driving" as const) : ("air" as const),
        };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);
  });

  if (!query) throw new Error("PLZ_NOT_FOUND");

  return { query, matches };
}
