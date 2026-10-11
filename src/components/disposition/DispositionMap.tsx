"use client";

import { Fragment, useEffect, useMemo } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import type { TechnicianRoute } from "@/lib/disposition/route";
import { homeEndPoint } from "@/lib/disposition/types";
import type { DispositionHome, DispositionTicket } from "@/lib/disposition/types";
import { formatClock } from "@/lib/disposition/schedule";

function pinIcon(color: string, label: string) {
  return L.divIcon({
    className: "",
    html: `<div style="min-width:22px;height:22px;padding:0 5px;border-radius:999px;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font:700 11px/1 Syne,sans-serif;border:2px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.35)">${label}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function homeIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:4px;background:${color};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function endIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:14px solid ${color};filter:drop-shadow(0 2px 4px rgba(0,0,0,.35))"></div>`,
    iconSize: [16, 14],
    iconAnchor: [8, 4],
  });
}

function Fit({ points }: { points: Array<{ lat: number; lon: number }> }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) {
      map.setView([51.16, 10.45], 6);
      return;
    }
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lon] as [number, number]));
    map.fitBounds(bounds, { padding: [36, 36] });
  }, [map, points]);
  return null;
}

export type DispositionMapLayer = {
  route: TechnicianRoute;
  home: DispositionHome | null;
  color: string;
};

function InvalidateSize() {
  const map = useMap();
  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 80);
    return () => window.clearTimeout(timer);
  }, [map]);
  return null;
}

export default function DispositionMap({
  layers,
  tickets,
  tall,
}: {
  layers: DispositionMapLayer[];
  tickets: DispositionTicket[];
  tall?: boolean;
}) {
  const byId = useMemo(() => new Map(tickets.map((item) => [item.id, item])), [tickets]);
  const points = useMemo(() => {
    const list: Array<{ lat: number; lon: number }> = [];
    for (const layer of layers) {
      if (layer.home?.lat != null && layer.home.lon != null) {
        list.push({ lat: layer.home.lat, lon: layer.home.lon });
      }
      const end = homeEndPoint(layer.home);
      if (end) list.push(end);
      for (const coord of layer.route.geometry) {
        list.push({ lat: coord[0], lon: coord[1] });
      }
      for (const stop of layer.route.stops) {
        const ticket = byId.get(stop.ticketId);
        if (ticket?.lat != null && ticket.lon != null) {
          list.push({ lat: ticket.lat, lon: ticket.lon });
        }
      }
    }
    return list;
  }, [byId, layers]);

  return (
    <div className={tall ? "disp-map disp-map-tall" : "disp-map"}>
      <MapContainer
        center={[51.16, 10.45]}
        zoom={6}
        className="disp-map-inner"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <InvalidateSize />
        <Fit points={points} />
        {layers.map((layer) => {
          const end = homeEndPoint(layer.home);
          const line: Array<[number, number]> =
            layer.route.geometry.length >= 2
              ? layer.route.geometry
              : (() => {
                  const fallback: Array<[number, number]> = [];
                  if (layer.home?.lat != null && layer.home.lon != null) {
                    fallback.push([layer.home.lat, layer.home.lon]);
                  }
                  for (const stop of layer.route.stops) {
                    const ticket = byId.get(stop.ticketId);
                    if (ticket?.lat != null && ticket.lon != null) {
                      fallback.push([ticket.lat, ticket.lon]);
                    }
                  }
                  if (end) fallback.push([end.lat, end.lon]);
                  return fallback;
                })();
          const sameEnd =
            layer.home?.lat != null &&
            end &&
            Math.abs(layer.home.lat - end.lat) < 0.0001 &&
            Math.abs((layer.home.lon ?? 0) - end.lon) < 0.0001;
          return (
            <Fragment key={layer.route.technicianId}>
              {layer.home?.lat != null && layer.home.lon != null ? (
                <Marker
                  position={[layer.home.lat, layer.home.lon]}
                  icon={homeIcon(layer.color)}
                >
                  <Popup>
                    Start {layer.route.technicianName}
                    {layer.route.homeLabel ? ` · ${layer.route.homeLabel}` : ""}
                  </Popup>
                </Marker>
              ) : null}
              {end && !sameEnd ? (
                <Marker position={[end.lat, end.lon]} icon={endIcon(layer.color)}>
                  <Popup>
                    Ende {layer.route.technicianName}
                    {layer.route.endLabel ? ` · ${layer.route.endLabel}` : ""}
                  </Popup>
                </Marker>
              ) : null}
              {layer.route.stops.map((stop) => {
                const ticket = byId.get(stop.ticketId);
                if (!ticket || ticket.lat == null || ticket.lon == null) return null;
                return (
                  <Marker
                    key={stop.ticketId}
                    position={[ticket.lat, ticket.lon]}
                    icon={pinIcon(layer.color, String(stop.order))}
                  >
                    <Popup>
                      <strong>
                        {layer.route.technicianName} · Stopp {stop.order}
                      </strong>
                      <br />
                      {stop.ticketNo || stop.customer || "Ticket"}
                      <br />
                      {stop.addressLabel}
                      <br />
                      {formatClock(stop.arriveMin)}–{formatClock(stop.departMin)} · {stop.kmFromPrev} km
                    </Popup>
                  </Marker>
                );
              })}
              {line.length >= 2 ? (
                <Polyline
                  positions={line}
                  pathOptions={{ color: layer.color, weight: layers.length > 1 ? 3 : 4, opacity: 0.9 }}
                />
              ) : null}
            </Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}
