"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useEditAccess } from "@/components/EditAccessProvider";
import { createId } from "@/lib/id";
import {
  applyTripStatus,
  createHotelStay,
  createTrip,
  formatDateDe,
  formatEuroAmount,
  HOTEL_STATUS_LABELS,
  HOTEL_STATUSES,
  sumHotelCosts,
  tripDateRangeLabel,
  TRIP_PRIORITIES,
  TRIP_PRIORITY_LABELS,
  TRIP_STATUSES,
  TRIP_STATUS_LABELS,
  withSyncedTotalCost,
  type BusinessTrip,
  type HotelDocument,
  type HotelStatus,
  type HotelStay,
  type TripPriority,
  type TripStatus,
} from "@/lib/dienstreisen/types";

type Tab = "aktiv" | "archiv";

const MAX_DOC_BYTES = 2.5 * 1024 * 1024;

function guessTraveler(user: { username: string; displayName: string } | null): string {
  if (!user) return "";
  if (user.displayName.trim()) return user.displayName.trim();
  return user.username;
}

function sortByOrder(trips: BusinessTrip[]): BusinessTrip[] {
  return [...trips].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}

async function fileToDocument(file: File): Promise<HotelDocument> {
  if (file.size > MAX_DOC_BYTES) {
    throw new Error(`Datei „${file.name}“ ist zu groß (max. 2,5 MB).`);
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
  return {
    id: createId("doc"),
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    dataUrl,
    createdAt: new Date().toISOString(),
  };
}

export function DienstreisenPage() {
  const { user } = useAuth();
  const { canEdit } = useEditAccess();
  const defaultTraveler = guessTraveler(user);

  const [trips, setTrips] = useState<BusinessTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("aktiv");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingHotelId, setEditingHotelId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState({
    title: "",
    traveler: "",
    dateFrom: "",
    dateTo: "",
    status: "in-planung" as TripStatus,
    priority: "mittel" as TripPriority,
    note: "",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingHotelId = useRef<string | null>(null);
  const tripsRef = useRef<BusinessTrip[]>([]);
  const persistTimer = useRef<number | null>(null);

  useEffect(() => {
    tripsRef.current = trips;
  }, [trips]);

  const persist = useCallback(
    async (nextTrips: BusinessTrip[]) => {
      if (!canEdit) {
        setError(
          "Schreibzugriff gesperrt. Bitte freischalten oder mit Bearbeitungsrecht anmelden.",
        );
        return false;
      }
      setError(null);
      try {
        const res = await fetch("/api/dienstreisen", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ trips: nextTrips }),
        });
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        if (!res.ok) throw new Error(data?.error || "Speichern fehlgeschlagen.");
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
        return false;
      }
    },
    [canEdit],
  );

  const commitTrips = useCallback(
    (nextTrips: BusinessTrip[], options?: { immediate?: boolean }) => {
      const synced = nextTrips.map((trip) => withSyncedTotalCost(trip));
      tripsRef.current = synced;
      setTrips(synced);
      if (!canEdit) return;
      if (persistTimer.current) window.clearTimeout(persistTimer.current);
      if (options?.immediate) {
        void persist(synced);
        return;
      }
      persistTimer.current = window.setTimeout(() => {
        void persist(tripsRef.current);
      }, 400);
    },
    [canEdit, persist],
  );

  useEffect(() => {
    return () => {
      if (persistTimer.current) window.clearTimeout(persistTimer.current);
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dienstreisen", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => null)) as {
        trips?: BusinessTrip[];
        error?: string;
      } | null;
      if (!res.ok) throw new Error(data?.error || "Dienstreisen konnten nicht geladen werden.");
      const list = Array.isArray(data?.trips) ? data.trips : [];
      tripsRef.current = list;
      setTrips(list);
      const wanted = new URLSearchParams(window.location.search).get("id");
      const fromQuery = wanted
        ? list.find((trip) => trip.id === wanted) ?? null
        : null;
      if (fromQuery?.archived) setTab("archiv");
      setSelectedId((current) => {
        if (fromQuery) return fromQuery.id;
        if (current && list.some((trip) => trip.id === current)) return current;
        const firstActive = list.find((trip) => !trip.archived);
        return firstActive?.id ?? list[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Laden fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeCount = trips.filter((trip) => !trip.archived).length;
  const archiveCount = trips.filter((trip) => trip.archived).length;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sortByOrder(
      trips
        .filter((trip) => (tab === "archiv" ? trip.archived : !trip.archived))
        .filter((trip) => {
          if (!needle) return true;
          const hay = [
            trip.title,
            trip.traveler,
            trip.note,
            ...trip.hotels.map((hotel) => `${hotel.city} ${hotel.hotelName}`),
          ]
            .join(" ")
            .toLowerCase();
          return hay.includes(needle);
        }),
    );
  }, [trips, tab, query]);

  const selected = useMemo(
    () => trips.find((trip) => trip.id === selectedId) ?? null,
    [trips, selectedId],
  );

  const selectedTotal = selected ? sumHotelCosts(selected.hotels) : 0;

  useEffect(() => {
    if (!selectedId) return;
    if (filtered.some((trip) => trip.id === selectedId)) return;
    setSelectedId(filtered[0]?.id ?? null);
  }, [filtered, selectedId]);

  function updateSelected(
    mutator: (trip: BusinessTrip) => BusinessTrip,
    options?: { immediate?: boolean },
  ) {
    if (!selected) return;
    const next = tripsRef.current.map((trip) =>
      trip.id === selected.id
        ? mutator({ ...trip, updatedAt: new Date().toISOString() })
        : trip,
    );
    commitTrips(next, options);
  }

  function patchSelected(patch: Partial<BusinessTrip>, immediate = false) {
    updateSelected((trip) => ({ ...trip, ...patch }), { immediate });
  }

  function openCreateTrip() {
    if (!canEdit) {
      setError("Schreibzugriff gesperrt.");
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    setCreateDraft({
      title: "",
      traveler: defaultTraveler,
      dateFrom: today,
      dateTo: today,
      status: "in-planung",
      priority: "mittel",
      note: "",
    });
    setCreateOpen(true);
    setError(null);
  }

  function submitCreateTrip() {
    const title = createDraft.title.trim();
    if (!title) {
      setError("Titel ist erforderlich.");
      return;
    }
    const maxOrder = tripsRef.current.reduce((max, trip) => Math.max(max, trip.order), 0);
    const trip = {
      ...createTrip({
        title,
        traveler: createDraft.traveler.trim() || defaultTraveler,
        dateFrom: createDraft.dateFrom || null,
        dateTo: createDraft.dateTo || null,
        status: createDraft.status,
        priority: createDraft.priority,
        order: maxOrder + 1,
      }),
      note: createDraft.note.trim(),
    };
    const next = [trip, ...tripsRef.current];
    commitTrips(next, { immediate: true });
    setCreateOpen(false);
    setTab("aktiv");
    setSelectedId(trip.id);
    setMessage("Dienstreise angelegt.");
  }

  function onDragStart(id: string) {
    if (!canEdit || tab !== "aktiv") return;
    setDragId(id);
  }

  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId || tab !== "aktiv") {
      setDragId(null);
      return;
    }
    const active = sortByOrder(tripsRef.current.filter((trip) => !trip.archived));
    const archived = tripsRef.current.filter((trip) => trip.archived);
    const from = active.findIndex((trip) => trip.id === dragId);
    const to = active.findIndex((trip) => trip.id === targetId);
    if (from < 0 || to < 0) {
      setDragId(null);
      return;
    }
    const reordered = [...active];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const withOrder = reordered.map((trip, index) => ({
      ...trip,
      order: index + 1,
      updatedAt: new Date().toISOString(),
    }));
    setDragId(null);
    commitTrips([...withOrder, ...archived], { immediate: true });
  }

  function addHotel() {
    if (!selected || !canEdit) return;
    const hotel = createHotelStay({
      date: selected.dateFrom ?? selected.dateTo ?? new Date().toISOString().slice(0, 10),
    });
    updateSelected((trip) => ({ ...trip, hotels: [...trip.hotels, hotel] }), {
      immediate: true,
    });
    setEditingHotelId(hotel.id);
    setMessage("Unterkunft hinzugefügt.");
  }

  function updateHotel(
    hotelId: string,
    patch: Partial<HotelStay>,
    immediate = false,
  ) {
    updateSelected(
      (trip) => ({
        ...trip,
        hotels: trip.hotels.map((hotel) =>
          hotel.id === hotelId ? { ...hotel, ...patch } : hotel,
        ),
      }),
      { immediate },
    );
  }

  function removeHotel(hotelId: string) {
    if (!window.confirm("Unterkunft wirklich entfernen?")) return;
    updateSelected(
      (trip) => ({
        ...trip,
        hotels: trip.hotels.filter((hotel) => hotel.id !== hotelId),
      }),
      { immediate: true },
    );
    if (editingHotelId === hotelId) setEditingHotelId(null);
  }

  function removeTrip() {
    if (!selected || !canEdit) return;
    if (!window.confirm(`Dienstreise „${selected.title}“ wirklich löschen?`)) return;
    const next = tripsRef.current.filter((trip) => trip.id !== selected.id);
    commitTrips(next, { immediate: true });
    setSelectedId(next.find((trip) => !trip.archived)?.id ?? next[0]?.id ?? null);
    setMessage("Dienstreise gelöscht.");
  }

  function archiveTrip() {
    if (!selected) return;
    updateSelected((trip) => ({ ...trip, archived: true }), { immediate: true });
    setTab("archiv");
    setMessage("Dienstreise ins Archiv verschoben.");
  }

  function restoreTrip() {
    if (!selected) return;
    updateSelected(
      (trip) => ({ ...applyTripStatus(trip, trip.status), archived: false }),
      { immediate: true },
    );
    setTab("aktiv");
    setMessage("Dienstreise wiederhergestellt.");
  }

  function requestAttach(hotelId: string) {
    if (!canEdit) return;
    pendingHotelId.current = hotelId;
    fileInputRef.current?.click();
  }

  async function onFilesSelected(files: FileList | null) {
    const hotelId = pendingHotelId.current;
    pendingHotelId.current = null;
    if (!hotelId || !files?.length || !selected) return;
    try {
      const docs: HotelDocument[] = [];
      for (const file of Array.from(files)) {
        docs.push(await fileToDocument(file));
      }
      updateSelected(
        (trip) => ({
          ...trip,
          hotels: trip.hotels.map((hotel) =>
            hotel.id === hotelId
              ? { ...hotel, documents: [...hotel.documents, ...docs] }
              : hotel,
          ),
        }),
        { immediate: true },
      );
      setMessage(`${docs.length} Datei(en) angehängt.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload fehlgeschlagen.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removeDocument(hotelId: string, docId: string) {
    updateSelected(
      (trip) => ({
        ...trip,
        hotels: trip.hotels.map((hotel) =>
          hotel.id === hotelId
            ? {
                ...hotel,
                documents: hotel.documents.filter((doc) => doc.id !== docId),
              }
            : hotel,
        ),
      }),
      { immediate: true },
    );
  }

  return (
    <div className="page-panel reisen-page">
      <header className="section-header">
        <div>
          <h1>Dienstreisen</h1>
          <p>Reisen planen, Hotels eintragen und Kosten erfassen</p>
        </div>
        <div className="reisen-header-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canEdit}
            onClick={openCreateTrip}
          >
            + Neue Dienstreise
          </button>
        </div>
      </header>

      <div className="reisen-toolbar">
        <label className="reisen-search">
          <span className="sr-only">Suche</span>
          <input
            type="search"
            placeholder="Dienstreisen nach Name durchsuchen…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="reisen-tabs" role="tablist" aria-label="Dienstreisen-Ansicht">
          <button
            type="button"
            className={`reisen-tab ${tab === "aktiv" ? "is-active" : ""}`}
            onClick={() => setTab("aktiv")}
          >
            <span aria-hidden>✈</span> Aktive Dienstreisen
            <span className="reisen-tab-count is-active-count">{activeCount}</span>
          </button>
          <button
            type="button"
            className={`reisen-tab ${tab === "archiv" ? "is-active" : ""}`}
            onClick={() => setTab("archiv")}
          >
            <span aria-hidden>🗄</span> Archiv
            <span className="reisen-tab-count">{archiveCount}</span>
          </button>
        </div>
      </div>

      {error ? <p className="reisen-banner is-error">{error}</p> : null}
      {message ? <p className="reisen-banner is-ok">{message}</p> : null}

      {loading ? (
        <p className="muted-meta">Lade Dienstreisen…</p>
      ) : (
        <div className="reisen-layout">
          <aside className="reisen-list" aria-label="Dienstreisen-Liste">
            {filtered.length === 0 ? (
              <p className="muted-meta">
                {tab === "archiv"
                  ? "Kein Archiv-Eintrag."
                  : "Noch keine aktiven Dienstreisen."}
              </p>
            ) : (
              filtered.map((trip) => (
                <div
                  key={trip.id}
                  className={`reisen-list-item ${selectedId === trip.id ? "is-active" : ""} ${dragId === trip.id ? "is-dragging" : ""}`}
                  draggable={canEdit && tab === "aktiv"}
                  onDragStart={() => onDragStart(trip.id)}
                  onDragOver={(event) => {
                    if (tab === "aktiv") event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    onDrop(trip.id);
                  }}
                >
                  <button
                    type="button"
                    className="reisen-list-item-main"
                    onClick={() => {
                      setSelectedId(trip.id);
                      setEditingHotelId(null);
                      setMessage(null);
                    }}
                  >
                    <strong>{trip.title}</strong>
                    <span>
                      {tripDateRangeLabel(trip)} · {trip.hotels.length} Hotel
                      {trip.hotels.length === 1 ? "" : "s"}
                    </span>
                    <span className="reisen-list-meta">
                      {TRIP_STATUS_LABELS[trip.status]} ·{" "}
                      {formatEuroAmount(sumHotelCosts(trip.hotels))}
                    </span>
                  </button>
                  {tab === "aktiv" && canEdit ? (
                    <span className="reisen-drag-hint" aria-hidden title="Ziehen zum Sortieren">
                      ⋮⋮
                    </span>
                  ) : null}
                </div>
              ))
            )}
          </aside>

          <section className="reisen-detail">
            {!selected ? (
              <div className="content-card">
                <p className="muted-meta">
                  Wähle eine Dienstreise oder lege eine neue an.
                </p>
              </div>
            ) : (
              <>
                <div className="reisen-detail-head">
                  <div className="reisen-detail-title">
                    <h2>{selected.title}</h2>
                    <div className="reisen-badges">
                      <span className="reisen-badge">
                        {selected.hotels.length} Hotel
                        {selected.hotels.length === 1 ? "" : "s"}
                      </span>
                      {selected.traveler ? (
                        <span className="reisen-badge is-person">
                          {selected.traveler}
                        </span>
                      ) : null}
                      <span className="reisen-badge is-date">
                        {tripDateRangeLabel(selected)}
                      </span>
                    </div>
                  </div>

                  <div className="reisen-detail-actions">
                    <label className="reisen-select-wrap">
                      <span className="sr-only">Status</span>
                      <select
                        className={`reisen-status-select status-${selected.status}`}
                        value={selected.status}
                        disabled={!canEdit}
                        onChange={(event) => {
                          const status = event.target.value as TripStatus;
                          updateSelected((trip) => applyTripStatus(trip, status), {
                            immediate: true,
                          });
                        }}
                      >
                        {TRIP_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {TRIP_STATUS_LABELS[status]}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="reisen-select-wrap">
                      <span className="sr-only">Priorität</span>
                      <select
                        className={`reisen-prio-select prio-${selected.priority}`}
                        value={selected.priority}
                        disabled={!canEdit}
                        onChange={(event) =>
                          patchSelected(
                            { priority: event.target.value as TripPriority },
                            true,
                          )
                        }
                      >
                        {TRIP_PRIORITIES.map((priority) => (
                          <option key={priority} value={priority}>
                            {TRIP_PRIORITY_LABELS[priority]}
                          </option>
                        ))}
                      </select>
                    </label>

                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={!canEdit}
                      onClick={addHotel}
                    >
                      + Unterkunft
                    </button>

                    <details className="reisen-more">
                      <summary aria-label="Weitere Aktionen">⋯</summary>
                      <div className="reisen-more-menu">
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => {
                            const next = window.prompt("Titel ändern", selected.title);
                            if (!next?.trim()) return;
                            patchSelected({ title: next.trim() }, true);
                          }}
                        >
                          Titel ändern
                        </button>
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => {
                            const next = window.prompt(
                              "Reisender",
                              selected.traveler || defaultTraveler,
                            );
                            if (next == null) return;
                            patchSelected({ traveler: next.trim() }, true);
                          }}
                        >
                          Reisenden ändern
                        </button>
                        {selected.archived ? (
                          <button type="button" disabled={!canEdit} onClick={restoreTrip}>
                            Wiederherstellen
                          </button>
                        ) : (
                          <button type="button" disabled={!canEdit} onClick={archiveTrip}>
                            Ins Archiv
                          </button>
                        )}
                        <button
                          type="button"
                          className="is-danger"
                          disabled={!canEdit}
                          onClick={removeTrip}
                        >
                          Löschen
                        </button>
                      </div>
                    </details>
                  </div>
                </div>

                <div className="reisen-meta-grid">
                  <label>
                    <span>Von</span>
                    <input
                      type="date"
                      value={selected.dateFrom ?? ""}
                      disabled={!canEdit}
                      onChange={(event) =>
                        patchSelected({ dateFrom: event.target.value || null }, true)
                      }
                    />
                  </label>
                  <label>
                    <span>Bis</span>
                    <input
                      type="date"
                      value={selected.dateTo ?? ""}
                      disabled={!canEdit}
                      onChange={(event) =>
                        patchSelected({ dateTo: event.target.value || null }, true)
                      }
                    />
                  </label>
                  <label className={!selected.dueDate ? "is-due-missing" : undefined}>
                    <span>Fälligkeitsdatum</span>
                    <input
                      type="date"
                      value={selected.dueDate ?? ""}
                      disabled={!canEdit}
                      onChange={(event) =>
                        patchSelected({ dueDate: event.target.value || null }, true)
                      }
                    />
                  </label>
                  <label>
                    <span>Kosten gesamt</span>
                    <input
                      type="text"
                      readOnly
                      value={formatEuroAmount(selectedTotal)}
                      title="Summe aller Unterkunftspreise"
                    />
                  </label>
                  <label className="full">
                    <span>Notiz</span>
                    <input
                      type="text"
                      placeholder="Notizen zur Dienstreise…"
                      value={selected.note}
                      disabled={!canEdit}
                      onChange={(event) => patchSelected({ note: event.target.value })}
                    />
                  </label>
                </div>

                <div className="reisen-hotels-head">
                  <h3>Unterkünfte &amp; Hotels</h3>
                  <button
                    type="button"
                    className="reisen-link-btn"
                    disabled={!canEdit}
                    onClick={addHotel}
                  >
                    + Unterkunft hinzufügen
                  </button>
                </div>

                {selected.hotels.length === 0 ? (
                  <p className="muted-meta">Noch keine Unterkünfte hinterlegt.</p>
                ) : (
                  <div className="reisen-hotel-grid">
                    {selected.hotels.map((hotel) => {
                      const editing = editingHotelId === hotel.id;
                      return (
                        <article key={hotel.id} className="reisen-hotel-card">
                          <header className="reisen-hotel-card-head">
                            <div className="reisen-hotel-date">
                              <span className="reisen-hotel-icon" aria-hidden>
                                ⌂
                              </span>
                              <strong>
                                {hotel.date ? formatDateDe(hotel.date) : "Ohne Datum"}
                              </strong>
                            </div>
                            <div className="reisen-hotel-card-actions">
                              <button
                                type="button"
                                className="reisen-link-btn"
                                disabled={!canEdit}
                                onClick={() =>
                                  setEditingHotelId(editing ? null : hotel.id)
                                }
                              >
                                {editing ? "Fertig" : "Bearbeiten"}
                              </button>
                              <select
                                className={`reisen-hotel-status status-${hotel.status}`}
                                value={hotel.status}
                                disabled={!canEdit}
                                onChange={(event) =>
                                  updateHotel(
                                    hotel.id,
                                    { status: event.target.value as HotelStatus },
                                    true,
                                  )
                                }
                              >
                                {HOTEL_STATUSES.map((status) => (
                                  <option key={status} value={status}>
                                    {HOTEL_STATUS_LABELS[status]}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </header>

                          {editing ? (
                            <div className="reisen-hotel-edit">
                              <label>
                                <span>Datum</span>
                                <input
                                  type="date"
                                  value={hotel.date ?? ""}
                                  onChange={(event) =>
                                    updateHotel(
                                      hotel.id,
                                      { date: event.target.value || null },
                                      true,
                                    )
                                  }
                                />
                              </label>
                              <label>
                                <span>Preis</span>
                                <input
                                  value={hotel.cost}
                                  placeholder="z.B. 129,00"
                                  onChange={(event) =>
                                    updateHotel(hotel.id, { cost: event.target.value })
                                  }
                                />
                              </label>
                              <label>
                                <span>Ort / Stadt</span>
                                <input
                                  value={hotel.city}
                                  placeholder="z.B. Augsburg"
                                  onChange={(event) =>
                                    updateHotel(hotel.id, { city: event.target.value })
                                  }
                                />
                              </label>
                              <label className="full">
                                <span>Hotelname</span>
                                <input
                                  value={hotel.hotelName}
                                  placeholder="Hotelname"
                                  onChange={(event) =>
                                    updateHotel(hotel.id, {
                                      hotelName: event.target.value,
                                    })
                                  }
                                />
                              </label>
                              <label className="reisen-check">
                                <input
                                  type="checkbox"
                                  checked={hotel.breakfastIncluded}
                                  onChange={(event) =>
                                    updateHotel(
                                      hotel.id,
                                      { breakfastIncluded: event.target.checked },
                                      true,
                                    )
                                  }
                                />
                                <span>Frühstück inkl.</span>
                              </label>
                              <label className="reisen-check">
                                <input
                                  type="checkbox"
                                  checked={hotel.parking}
                                  onChange={(event) =>
                                    updateHotel(
                                      hotel.id,
                                      { parking: event.target.checked },
                                      true,
                                    )
                                  }
                                />
                                <span>Parkplatz ja</span>
                              </label>
                              <button
                                type="button"
                                className="btn btn-link-danger"
                                onClick={() => removeHotel(hotel.id)}
                              >
                                Unterkunft entfernen
                              </button>
                            </div>
                          ) : (
                            <>
                              <p className="reisen-hotel-city">
                                {hotel.city.trim() || "Ort nicht gesetzt"}
                              </p>
                              <div className="reisen-hotel-tags">
                                {hotel.breakfastIncluded ? (
                                  <span className="reisen-tag is-green">
                                    Frühstück inkl.
                                  </span>
                                ) : null}
                                {hotel.parking ? (
                                  <span className="reisen-tag is-blue">Parkplatz ja</span>
                                ) : null}
                                {hotel.cost.trim() ? (
                                  <span className="reisen-tag is-cost">
                                    {formatEuroAmount(sumHotelCosts([hotel]))}
                                  </span>
                                ) : null}
                              </div>
                              <label className="reisen-hotel-cost-field">
                                <span>Preis</span>
                                <input
                                  value={hotel.cost}
                                  placeholder="z.B. 129,00"
                                  disabled={!canEdit}
                                  onChange={(event) =>
                                    updateHotel(hotel.id, { cost: event.target.value })
                                  }
                                />
                              </label>
                              <input
                                className="reisen-hotel-name"
                                value={hotel.hotelName}
                                placeholder="Hotelname"
                                disabled={!canEdit}
                                onChange={(event) =>
                                  updateHotel(hotel.id, {
                                    hotelName: event.target.value,
                                  })
                                }
                              />
                            </>
                          )}

                          <div className="reisen-docs">
                            <div className="reisen-docs-head">
                              <span>Bestätigungen &amp; Dokumente</span>
                              <button
                                type="button"
                                className="reisen-link-btn"
                                disabled={!canEdit}
                                onClick={() => requestAttach(hotel.id)}
                              >
                                + Datei anfügen
                              </button>
                            </div>
                            {hotel.documents.length === 0 ? (
                              <p className="muted-meta">Keine Dateien.</p>
                            ) : (
                              <ul className="reisen-doc-list">
                                {hotel.documents.map((doc) => (
                                  <li key={doc.id}>
                                    <a
                                      href={doc.dataUrl}
                                      download={doc.name}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      {doc.name}
                                    </a>
                                    {canEdit ? (
                                      <button
                                        type="button"
                                        className="reisen-doc-remove"
                                        onClick={() => removeDocument(hotel.id, doc.id)}
                                        aria-label={`${doc.name} entfernen`}
                                      >
                                        ×
                                      </button>
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        className="sr-only"
        multiple
        accept="image/*,.pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
        onChange={(event) => void onFilesSelected(event.target.files)}
      />

      {createOpen ? (
        <div
          className="reisen-modal-backdrop"
          role="presentation"
          onClick={() => setCreateOpen(false)}
        >
          <div
            className="reisen-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reisen-create-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="reisen-modal-head">
              <h2 id="reisen-create-title">Neue Dienstreise</h2>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setCreateOpen(false)}
              >
                Schließen
              </button>
            </header>
            <div className="reisen-modal-body">
              <div className="reisen-meta-grid">
                <label className="full">
                  <span>Titel</span>
                  <input
                    autoFocus
                    value={createDraft.title}
                    placeholder="z.B. Besuch Stefan Schmid"
                    onChange={(event) =>
                      setCreateDraft((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>Reisender</span>
                  <input
                    value={createDraft.traveler}
                    onChange={(event) =>
                      setCreateDraft((current) => ({
                        ...current,
                        traveler: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>Status</span>
                  <select
                    value={createDraft.status}
                    onChange={(event) =>
                      setCreateDraft((current) => ({
                        ...current,
                        status: event.target.value as TripStatus,
                      }))
                    }
                  >
                    {TRIP_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {TRIP_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Priorität</span>
                  <select
                    value={createDraft.priority}
                    onChange={(event) =>
                      setCreateDraft((current) => ({
                        ...current,
                        priority: event.target.value as TripPriority,
                      }))
                    }
                  >
                    {TRIP_PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>
                        {TRIP_PRIORITY_LABELS[priority]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Von</span>
                  <input
                    type="date"
                    value={createDraft.dateFrom}
                    onChange={(event) =>
                      setCreateDraft((current) => ({
                        ...current,
                        dateFrom: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>Bis</span>
                  <input
                    type="date"
                    value={createDraft.dateTo}
                    onChange={(event) =>
                      setCreateDraft((current) => ({
                        ...current,
                        dateTo: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="full">
                  <span>Notiz</span>
                  <input
                    value={createDraft.note}
                    placeholder="Optionale Notiz…"
                    onChange={(event) =>
                      setCreateDraft((current) => ({
                        ...current,
                        note: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
            </div>
            <footer className="reisen-modal-foot">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setCreateOpen(false)}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={submitCreateTrip}
              >
                Anlegen
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
