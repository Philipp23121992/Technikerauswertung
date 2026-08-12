"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import type { NearbyMatch, SearchResult } from "@/lib/finder/types";

const originIcon = L.divIcon({
  className: "",
  html: `<div style="width:16px;height:16px;border-radius:999px;background:#c62828;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const matchIcon = (rank: number) =>
  L.divIcon({
    className: "",
    html: `<div style="width:28px;height:28px;border-radius:999px;background:#8e0000;color:#fff;display:flex;align-items:center;justify-content:center;font:700 13px/1 Syne,sans-serif;border:2px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.35)">${rank}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });

const ROUTE_COLORS = ["#c62828", "#e53935", "#8e0000"];

function FitBounds({
  origin,
  matches,
}: {
  origin: { lat: number; lon: number };
  matches: NearbyMatch[];
}) {
  const map = useMap();
  useEffect(() => {
    const points: [number, number][] = [
      [origin.lat, origin.lon],
      ...matches.map((m) => [m.lat, m.lon] as [number, number]),
    ];
    if (points.length === 1) {
      map.setView(points[0], 8);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
  }, [map, origin, matches]);
  return null;
}

async function fetchRoute(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
): Promise<[number, number][] | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const coords = data?.routes?.[0]?.geometry?.coordinates as
      | [number, number][]
      | undefined;
    if (!coords?.length) return null;
    return coords.map(([lon, lat]) => [lat, lon]);
  } catch {
    return null;
  }
}

export default function GermanyMap({ result }: { result: SearchResult }) {
  const [routes, setRoutes] = useState<[number, number][][]>([]);

  const origin = useMemo(
    () => ({ lat: result.query.lat, lon: result.query.lon }),
    [result.query.lat, result.query.lon],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await Promise.all(
        result.matches.map(async (match) => {
          const route = await fetchRoute(origin, match);
          if (route) return route;
          return [
            [origin.lat, origin.lon],
            [match.lat, match.lon],
          ] as [number, number][];
        }),
      );
      if (!cancelled) setRoutes(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [origin, result.matches]);

  return (
    <div className="map-frame">
      <MapContainer
        center={[51.16, 10.45]}
        zoom={6}
        className="h-full w-full"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds origin={origin} matches={result.matches} />
        <Marker position={[origin.lat, origin.lon]} icon={originIcon}>
          <Popup>
            Such-PLZ {result.query.plz}
            {result.query.city ? ` · ${result.query.city}` : ""}
          </Popup>
        </Marker>
        {result.matches.map((match, index) => (
          <Marker
            key={match.id}
            position={[match.lat, match.lon]}
            icon={matchIcon(index + 1)}
          >
            <Popup>
              <strong>
                {index + 1}. {match.name}
              </strong>
              <br />
              {match.plz} {match.city}
              <br />
              {match.distanceKm.toFixed(1)} km Fahrt
              {match.durationMin ? ` · ca. ${match.durationMin} min` : ""}
            </Popup>
          </Marker>
        ))}
        {routes.map((path, index) => (
          <Polyline
            key={`route-${index}`}
            positions={path}
            pathOptions={{
              color: ROUTE_COLORS[index % ROUTE_COLORS.length],
              weight: 4,
              opacity: 0.85,
            }}
          />
        ))}
      </MapContainer>
    </div>
  );
}
