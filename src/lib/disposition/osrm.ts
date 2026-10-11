export type NavPoint = { lat: number; lon: number };

export type NavLeg = {
  distanceKm: number;
  durationMin: number;
};

export type NavRoute = {
  legs: NavLeg[];
  geometry: Array<[number, number]>;
  totalKm: number;
  totalMin: number;
};

const OSRM = "https://router.project-osrm.org";

async function fetchJson(url: string, timeoutMs = 15000): Promise<unknown | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function coord(point: NavPoint): string {
  return `${point.lon},${point.lat}`;
}

export async function drivingTable(points: NavPoint[]): Promise<Array<Array<NavLeg | null>> | null> {
  if (points.length < 2) return null;
  const url =
    `${OSRM}/table/v1/driving/${points.map(coord).join(";")}` +
    `?annotations=distance,duration`;
  const data = (await fetchJson(url)) as {
    distances?: Array<Array<number | null>>;
    durations?: Array<Array<number | null>>;
  } | null;
  if (!data?.distances || !data.durations) return null;

  return points.map((_, from) =>
    points.map((__, to) => {
      const meters = data.distances?.[from]?.[to];
      const seconds = data.durations?.[from]?.[to];
      if (meters == null || !Number.isFinite(meters) || meters < 0) return null;
      return {
        distanceKm: Math.round((meters / 1000) * 10) / 10,
        durationMin:
          seconds != null && Number.isFinite(seconds) ? Math.max(1, Math.round(seconds / 60)) : 1,
      };
    }),
  );
}

export async function drivingPath(points: NavPoint[]): Promise<NavRoute | null> {
  if (points.length < 2) return null;
  const url =
    `${OSRM}/route/v1/driving/${points.map(coord).join(";")}` +
    `?overview=full&geometries=geojson&steps=false`;
  const data = (await fetchJson(url, 20000)) as {
    routes?: Array<{
      distance?: number;
      duration?: number;
      geometry?: { coordinates?: Array<[number, number]> };
      legs?: Array<{ distance?: number; duration?: number }>;
    }>;
  } | null;
  const route = data?.routes?.[0];
  if (!route) return null;
  const geometry = (route.geometry?.coordinates ?? []).map(
    ([lon, lat]) => [lat, lon] as [number, number],
  );
  const legs: NavLeg[] = (route.legs ?? []).map((leg) => ({
    distanceKm: Math.round(((leg.distance ?? 0) / 1000) * 10) / 10,
    durationMin: Math.max(1, Math.round((leg.duration ?? 0) / 60)),
  }));
  return {
    legs,
    geometry,
    totalKm: Math.round(((route.distance ?? 0) / 1000) * 10) / 10,
    totalMin: Math.max(1, Math.round((route.duration ?? 0) / 60)),
  };
}
