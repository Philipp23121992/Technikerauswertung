"use client";

import { Fragment, useEffect, useMemo } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import type { ContactEntry, EntityKind } from "@/lib/finder/types";

const COLORS = {
  TECHNICIAN: "#c62828",
  PARTNER: "#1565c0",
} as const;

function makePinIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:14px;height:14px;border-radius:999px;background:${color};border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function FitToPoints({
  points,
  radiusKm,
}: {
  points: Array<{ lat: number; lon: number }>;
  radiusKm: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) {
      map.setView([51.16, 10.45], 6);
      return;
    }

    const latPad = radiusKm / 111;
    const bounds = L.latLngBounds(
      points
        .map((p) => {
          const lonPad =
            radiusKm / (111 * Math.cos((p.lat * Math.PI) / 180) || 1);
          return [
            [p.lat - latPad, p.lon - lonPad] as [number, number],
            [p.lat + latPad, p.lon + lonPad] as [number, number],
          ];
        })
        .flat(),
    );
    map.fitBounds(bounds, { padding: [36, 36] });
  }, [map, points, radiusKm]);

  return null;
}

function colorFor(kind: EntityKind | string | undefined): string {
  return kind === "PARTNER" ? COLORS.PARTNER : COLORS.TECHNICIAN;
}

export default function CoverageMap({
  items,
  radiusKm,
  kind = "TECHNICIAN",
}: {
  items: ContactEntry[];
  radiusKm: number;
  kind?: EntityKind;
}) {
  const mapColor = colorFor(kind);
  const pinIcon = useMemo(() => makePinIcon(mapColor), [mapColor]);

  const points = useMemo(
    () =>
      items
        .filter(
          (i) =>
            Number.isFinite(i.lat) &&
            Number.isFinite(i.lon) &&
            Math.abs(i.lat) <= 90 &&
            Math.abs(i.lon) <= 180,
        )
        .map((i) => ({
          lat: i.lat,
          lon: i.lon,
          item: i,
          color: colorFor(i.kind || kind),
        })),
    [items, kind],
  );

  const radiusMeters = Math.max(1, radiusKm) * 1000;

  return (
    <div className="map-frame map-frame--tall">
      {/* key forces a full remount so marker/circle colors update */}
      <MapContainer
        key={`coverage-${kind}-${mapColor}`}
        center={[51.16, 10.45]}
        zoom={6}
        className="h-full w-full"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitToPoints
          points={points.map((p) => ({ lat: p.lat, lon: p.lon }))}
          radiusKm={radiusKm}
        />
        {points.map(({ item, lat, lon, color }) => (
          <Fragment key={`${item.id}-${color}`}>
            <Circle
              center={[lat, lon]}
              radius={radiusMeters}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: 0.14,
                weight: 2,
                opacity: 0.85,
                interactive: false,
              }}
            />
            <Marker position={[lat, lon]} icon={pinIcon}>
              <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                <div style={{ lineHeight: 1.35, minWidth: 140 }}>
                  <strong>{item.name}</strong>
                  {item.company ? (
                    <>
                      <br />
                      {item.company}
                    </>
                  ) : null}
                  <br />
                  {item.street ? `${item.street}, ` : ""}
                  {item.plz} {item.city}
                </div>
              </Tooltip>
              <Popup>
                <strong>{item.name}</strong>
                {item.company ? (
                  <>
                    <br />
                    {item.company}
                  </>
                ) : null}
                <br />
                {item.street ? `${item.street}, ` : ""}
                {item.plz} {item.city}
                <br />
                Radius: {radiusKm} km
                {(item.phone || item.email) && (
                  <>
                    <br />
                    {[item.phone, item.email].filter(Boolean).join(" · ")}
                  </>
                )}
              </Popup>
            </Marker>
          </Fragment>
        ))}
      </MapContainer>
    </div>
  );
}
