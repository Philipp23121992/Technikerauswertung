"use client";

import dynamic from "next/dynamic";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { MapPin, Navigation, Search } from "lucide-react";
import type { EntityKind, SearchResult } from "@/lib/finder/types";

const GermanyMap = dynamic(() => import("./GermanyMap"), {
  ssr: false,
  loading: () => (
    <div className="map-frame grid place-items-center text-ink-soft">
      Karte wird geladen…
    </div>
  ),
});

export function PlzSearch() {
  const [plz, setPlz] = useState("80331");
  const [kind, setKind] = useState<EntityKind>("TECHNICIAN");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const searchedPlzRef = useRef<string | null>(null);
  const skipKindEffect = useRef(true);

  const runSearch = useCallback(async (nextPlz: string, nextKind: EntityKind) => {
    if (!/^\d{5}$/.test(nextPlz)) {
      setError("Bitte eine gültige 5-stellige PLZ eingeben.");
      return;
    }

    setLoading(true);
    setError("");
    const res = await fetch(
      `/api/finder/search?plz=${encodeURIComponent(nextPlz)}&kind=${nextKind}`,
    );
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setResult(null);
      setError(data.error ?? "Suche fehlgeschlagen.");
      return;
    }
    searchedPlzRef.current = nextPlz;
    setResult(data as SearchResult);
  }, []);

  useEffect(() => {
    if (skipKindEffect.current) {
      skipKindEffect.current = false;
      return;
    }
    if (!searchedPlzRef.current) return;
    void runSearch(searchedPlzRef.current, kind);
  }, [kind, runSearch]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await runSearch(plz, kind);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="panel grid gap-4 p-5 md:grid-cols-[1fr_auto_auto]">
        <label>
          <span className="label">Postleitzahl</span>
          <input
            className="field"
            inputMode="numeric"
            pattern="\d{5}"
            maxLength={5}
            required
            value={plz}
            onChange={(e) => setPlz(e.target.value.replace(/\D/g, "").slice(0, 5))}
            placeholder="z. B. 80331"
          />
        </label>
        <div>
          <span className="label">Datenbank</span>
          <div className="grid grid-cols-2 gap-2">
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
        <div className="flex items-end">
          <button type="submit" className="btn btn-accent w-full md:w-auto" disabled={loading}>
            <Search size={18} />
            {loading ? "Suche…" : "5 Nächste finden"}
          </button>
        </div>
      </form>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          {error}
        </p>
      )}

      {result && (
        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
                <MapPin size={16} className="text-fire" />
                Ausgangspunkt: PLZ {result.query.plz}
                {result.query.city ? ` · ${result.query.city}` : ""}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={`btn ${kind === "TECHNICIAN" ? "btn-primary" : "btn-ghost"} !px-3 !py-2 text-sm`}
                  onClick={() => setKind("TECHNICIAN")}
                  disabled={loading}
                >
                  Techniker
                </button>
                <button
                  type="button"
                  className={`btn ${kind === "PARTNER" ? "btn-primary" : "btn-ghost"} !px-3 !py-2 text-sm`}
                  onClick={() => setKind("PARTNER")}
                  disabled={loading}
                >
                  Partner
                </button>
              </div>
            </div>

            {result.matches.length === 0 ? (
              <div className="panel p-6 text-ink-soft">
                Keine Einträge in der{" "}
                {result.query.kind === "TECHNICIAN" ? "Techniker" : "Partner"}
                -Datenbank.
              </div>
            ) : (
              result.matches.map((match, index) => (
                <article key={match.id} className="panel p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-fire">
                        Platz {index + 1}
                      </p>
                      <h2 className="display mt-1 text-2xl font-semibold text-ink">
                        {match.name}
                      </h2>
                      {match.company && (
                        <p className="text-sm font-semibold text-ink-soft">
                          {match.company}
                        </p>
                      )}
                    </div>
                    <div className="rounded-lg bg-[rgba(198,40,40,0.06)] px-3 py-2 text-right">
                      <p className="text-lg font-bold text-ink">
                        {match.distanceKm.toFixed(1)} km
                      </p>
                      <p className="text-xs text-ink-soft">
                        {match.distanceMode === "air"
                          ? "Luftlinie (Fallback)"
                          : "Fahrtstrecke"}
                        {match.durationMin
                          ? ` · ca. ${match.durationMin} min`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-ink-soft">
                    {match.street ? `${match.street}, ` : ""}
                    {match.plz} {match.city}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3 text-sm font-semibold">
                    {match.phone && <a href={`tel:${match.phone}`}>{match.phone}</a>}
                    {match.email && (
                      <a href={`mailto:${match.email}`} className="text-fire">
                        {match.email}
                      </a>
                    )}
                    <a
                      className="inline-flex items-center gap-1 text-fire-deep"
                      href={`https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${result.query.lat}%2C${result.query.lon}%3B${match.lat}%2C${match.lon}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Navigation size={14} />
                      Route öffnen
                    </a>
                  </div>
                  {match.notes && (
                    <p className="mt-3 text-sm text-ink-soft">{match.notes}</p>
                  )}
                </article>
              ))
            )}
          </section>

          <section className="panel overflow-hidden p-2">
            <GermanyMap result={result} />
          </section>
        </div>
      )}
    </div>
  );
}
