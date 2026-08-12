"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { ContactEntry, EntityKind } from "@/lib/finder/types";

const CoverageMap = dynamic(() => import("./CoverageMap"), {
  ssr: false,
  loading: () => (
    <div className="map-frame map-frame--tall grid place-items-center text-ink-soft">
      Karte wird geladen…
    </div>
  ),
});

export function StandorteView() {
  const [kind, setKind] = useState<EntityKind>("TECHNICIAN");
  const [radiusKm, setRadiusKm] = useState(50);
  const [items, setItems] = useState<ContactEntry[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/finder/entries?kind=${kind}`);
        const data = await res.json();
        if (!res.ok) {
          if (!cancelled) setError(data.error ?? "Laden fehlgeschlagen.");
          return;
        }
        if (!cancelled) {
          setItems(
            (data.items as ContactEntry[]).filter((i) => i.active !== false),
          );
        }
      } catch {
        if (!cancelled) setError("Laden fehlgeschlagen.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind]);

  return (
    <div className="space-y-6">
      <div className="panel grid gap-5 p-5 md:grid-cols-[1fr_auto]">
        <div>
          <span className="label">Datenbank</span>
          <div className="mt-1 grid grid-cols-2 gap-2 sm:max-w-sm">
            <button
              type="button"
              className={`btn ${kind === "TECHNICIAN" ? "btn-primary" : "btn-ghost"} !py-3`}
              onClick={() => setKind("TECHNICIAN")}
            >
              Techniker
            </button>
            <button
              type="button"
              className={`btn ${kind === "PARTNER" ? "btn-primary" : "btn-ghost"} !py-3`}
              onClick={() => setKind("PARTNER")}
            >
              Partner
            </button>
          </div>
        </div>

        <div className="min-w-[240px]">
          <div className="flex items-end justify-between gap-3">
            <label className="label !mb-0" htmlFor="radius">
              Radius
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={500}
                className="field !w-24 !py-2"
                value={radiusKm}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (!Number.isFinite(value)) return;
                  setRadiusKm(Math.min(500, Math.max(1, Math.round(value))));
                }}
              />
              <span className="text-sm font-semibold text-ink-soft">km</span>
            </div>
          </div>
          <input
            id="radius"
            type="range"
            min={1}
            max={500}
            step={1}
            value={radiusKm}
            onChange={(e) => setRadiusKm(Number(e.target.value))}
            className="mt-3 w-full accent-[var(--fire)]"
          />
          <p className="mt-2 text-sm text-ink-soft">
            {loading
              ? "Lade Standorte…"
              : `${items.length} Standort${items.length === 1 ? "" : "e"} · Radius ${radiusKm} km`}
          </p>
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          {error}
        </p>
      )}

      <div className="panel overflow-hidden p-2">
        <CoverageMap items={items} radiusKm={radiusKm} kind={kind} />
      </div>
    </div>
  );
}
