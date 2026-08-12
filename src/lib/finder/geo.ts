import type { GeoPoint } from "./types";

/** Approximate PLZ centroids for common German areas (offline fallback / seed). */
export const PLZ_FALLBACK: Record<string, GeoPoint & { city: string }> = {
  "10115": { lat: 52.532, lon: 13.384, city: "Berlin" },
  "20095": { lat: 53.551, lon: 9.994, city: "Hamburg" },
  "30159": { lat: 52.375, lon: 9.732, city: "Hannover" },
  "40213": { lat: 51.227, lon: 6.773, city: "Düsseldorf" },
  "50667": { lat: 50.938, lon: 6.96, city: "Köln" },
  "60311": { lat: 50.111, lon: 8.682, city: "Frankfurt am Main" },
  "70173": { lat: 48.778, lon: 9.18, city: "Stuttgart" },
  "80331": { lat: 48.137, lon: 11.575, city: "München" },
  "01067": { lat: 51.05, lon: 13.738, city: "Dresden" },
  "04109": { lat: 51.34, lon: 12.375, city: "Leipzig" },
  "86150": { lat: 48.366, lon: 10.898, city: "Augsburg" },
  "93047": { lat: 49.013, lon: 12.101, city: "Regensburg" },
  "90402": { lat: 49.453, lon: 11.077, city: "Nürnberg" },
  "55116": { lat: 49.999, lon: 8.273, city: "Mainz" },
  "44135": { lat: 51.514, lon: 7.466, city: "Dortmund" },
  "28195": { lat: 53.079, lon: 8.801, city: "Bremen" },
  "49074": { lat: 52.279, lon: 8.047, city: "Osnabrück" },
  "99084": { lat: 50.978, lon: 11.029, city: "Erfurt" },
  "24103": { lat: 54.323, lon: 10.139, city: "Kiel" },
  "72070": { lat: 48.521, lon: 9.057, city: "Tübingen" },
  "79104": { lat: 47.999, lon: 7.842, city: "Freiburg" },
  "97070": { lat: 49.794, lon: 9.929, city: "Würzburg" },
  "85049": { lat: 48.765, lon: 11.424, city: "Ingolstadt" },
  "87435": { lat: 47.727, lon: 10.314, city: "Kempten" },
  "35390": { lat: 50.587, lon: 8.675, city: "Gießen" },
};

export function normalizePlz(plz: string): string {
  return plz.replace(/\s+/g, "").padStart(5, "0").slice(0, 5);
}

export function isValidPlz(plz: string): boolean {
  return /^\d{5}$/.test(normalizePlz(plz));
}

/** Haversine distance in km. */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const dLat = deg2rad(b.lat - a.lat);
  const dLon = deg2rad(b.lon - a.lon);
  const lat1 = deg2rad(a.lat);
  const lat2 = deg2rad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function deg2rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export type DrivingLeg = {
  distanceKm: number;
  durationMin: number;
};

/**
 * Driving distances from one origin to many destinations via OSRM table API.
 * Returns null entries when a route is unavailable.
 */
export async function drivingLegsFrom(
  origin: GeoPoint,
  destinations: GeoPoint[],
): Promise<Array<DrivingLeg | null>> {
  if (destinations.length === 0) return [];

  const coords = [
    `${origin.lon},${origin.lat}`,
    ...destinations.map((d) => `${d.lon},${d.lat}`),
  ].join(";");

  try {
    const url =
      `https://router.project-osrm.org/table/v1/driving/${coords}` +
      `?sources=0&annotations=distance,duration`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return destinations.map(() => null);

    const data = (await res.json()) as {
      distances?: Array<Array<number | null>>;
      durations?: Array<Array<number | null>>;
    };
    const distances = data.distances?.[0] ?? [];
    const durations = data.durations?.[0] ?? [];

    return destinations.map((_, index) => {
      // index 0 in the matrix row is the origin itself; destinations start at 1
      const meters = distances[index + 1];
      const seconds = durations[index + 1];
      if (meters == null || !Number.isFinite(meters) || meters < 0) return null;
      return {
        distanceKm: Math.round((meters / 1000) * 10) / 10,
        durationMin:
          seconds != null && Number.isFinite(seconds)
            ? Math.max(1, Math.round(seconds / 60))
            : 0,
      };
    });
  } catch {
    return destinations.map(() => null);
  }
}

/** Rough Germany bounding box to reject broken geocoder results. */
function isPlausibleDeCoord(lat: number, lon: number): boolean {
  return lat >= 47 && lat <= 55.2 && lon >= 5.5 && lon <= 15.5;
}

export async function geocodePlz(
  plzInput: string,
  cache: Record<string, GeoPoint & { city?: string }>,
): Promise<(GeoPoint & { city?: string; plz: string }) | null> {
  const plz = normalizePlz(plzInput);
  if (!isValidPlz(plz)) return null;

  if (cache[plz] && isPlausibleDeCoord(cache[plz].lat, cache[plz].lon)) {
    return { ...cache[plz], plz };
  }
  if (cache[plz]) delete cache[plz];

  if (PLZ_FALLBACK[plz]) {
    const hit = PLZ_FALLBACK[plz];
    cache[plz] = { lat: hit.lat, lon: hit.lon, city: hit.city };
    return { ...hit, plz };
  }

  // Nominatim first – more reliable for German PLZ than zippopotam
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("postalcode", plz);
    url.searchParams.set("country", "Germany");
    url.searchParams.set("countrycodes", "de");
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "TechnikerFinder/1.0 (local app)",
      },
    });
    if (res.ok) {
      const rows = (await res.json()) as Array<{
        lat: string;
        lon: string;
        display_name?: string;
      }>;
      const row = rows?.[0];
      if (row) {
        const lat = Number(row.lat);
        const lon = Number(row.lon);
        if (isPlausibleDeCoord(lat, lon)) {
          const city = row.display_name?.split(",")[0];
          cache[plz] = { lat, lon, city };
          return { lat, lon, city, plz };
        }
      }
    }
  } catch {
    // continue
  }

  // zippopotam fallback (sometimes returns swapped/invalid lat/lon)
  try {
    const res = await fetch(`https://api.zippopotam.us/de/${plz}`, {
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const data = (await res.json()) as {
        places?: Array<{
          latitude?: string;
          longitude?: string;
          "place name"?: string;
        }>;
      };
      const place = data.places?.[0];
      let lat = Number(place?.latitude);
      let lon = Number(place?.longitude);
      // Some DE records come back swapped
      if (!isPlausibleDeCoord(lat, lon) && isPlausibleDeCoord(lon, lat)) {
        [lat, lon] = [lon, lat];
      }
      if (isPlausibleDeCoord(lat, lon)) {
        const city = place?.["place name"];
        cache[plz] = { lat, lon, city };
        return { lat, lon, city, plz };
      }
    }
  } catch {
    // ignore
  }

  return null;
}
