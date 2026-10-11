"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseCsvFile } from "@/lib/csv";
import { buildDispositionImport, type DispositionImportResult } from "@/lib/disposition/import";
import { planPossibleTours } from "@/lib/disposition/auto-tour";
import { planTechnicianDay, ROUTE_COLORS, type TechnicianRoute } from "@/lib/disposition/route";
import {
  WORK_START_MIN,
  formatClock,
  todayIso,
  workdayEndMin,
  workdayLabel,
} from "@/lib/disposition/schedule";
import { collectBlockedDates } from "@/lib/disposition/load";
import {
  DISPOSITION_FLAG_LABELS,
  DISPOSITION_FLAGS,
  DISPOSITION_READINESS_LABELS,
  isCustomTicket,
  isOpenTicket,
  isRoutableTicket,
  kennzeichenTags,
  ticketDisplayTitle,
  ticketOccupiesBoardDate,
  ticketReadiness,
  ticketScheduleStart,
  UNASSIGNED_TECH_ID,
  UNASSIGNED_TECH_NAME,
  type DispositionBoardMode,
  type DispositionDb,
  type DispositionFlag,
  type DispositionFlags,
} from "@/lib/disposition/types";
import { ticketWorkKind, TICKET_WORK_KIND_LABELS } from "@/lib/disposition/priority";
import { formatDisplayDate } from "@/lib/tracker";
import { isBoardTechnician } from "@/lib/tracker-types";
import type { VacationRequest } from "@/lib/urlaube/types";
import { useEditAccess } from "@/components/EditAccessProvider";
import { useTracker } from "@/components/TrackerProvider";
import { DispositionImportReport } from "./DispositionImportReport";
import { DispositionDashboard } from "./DispositionDashboard";
import { DispositionKanban } from "./DispositionKanban";
import { DispositionPrio } from "./DispositionPrio";
import { DispositionTicketModal } from "./DispositionTicketModal";
import { WorkKindSelect } from "./WorkKindSelect";
import { TicketNoteField } from "./TicketNoteField";

const DispositionMap = dynamic(() => import("./DispositionMap"), {
  ssr: false,
  loading: () => <div className="disp-map disp-map-loading">Karte wird geladen…</div>,
});

type PendingImport = {
  fileName: string;
  analysis: DispositionImportResult;
};

type View = "dashboard" | "tickets" | "plan" | "nachfrage" | "moeglich" | "ist" | "prio";

function parseView(raw: string | null): View {
  if (raw === "tour" || raw === "plan") return "plan";
  if (raw === "kanban" || raw === "nachfrage") return "nachfrage";
  if (raw === "tickets" || raw === "prio" || raw === "moeglich" || raw === "ist") return raw;
  return "dashboard";
}

function isBoardView(view: View): view is DispositionBoardMode {
  return view === "plan" || view === "nachfrage" || view === "moeglich" || view === "ist";
}

export function DispositionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ready, technicians, updateTechnician, getStatus, getNote } = useTracker();
  const { canEdit } = useEditAccess();
  const view = parseView(searchParams.get("view"));
  const setView = useCallback(
    (next: View) => {
      const href = next === "dashboard" ? "/disposition" : `/disposition?view=${next}`;
      router.replace(href, { scroll: false });
    },
    [router],
  );
  const [db, setDb] = useState<DispositionDb | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [homePlz, setHomePlz] = useState("");
  const [homeCity, setHomeCity] = useState("");
  const [homeStreet, setHomeStreet] = useState("");
  const [endPlz, setEndPlz] = useState("");
  const [endCity, setEndCity] = useState("");
  const [endStreet, setEndStreet] = useState("");
  const [planDate, setPlanDate] = useState(todayIso);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [tourBusy, setTourBusy] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [navRoute, setNavRoute] = useState<TechnicianRoute | null>(null);
  const [vacations, setVacations] = useState<VacationRequest[]>([]);
  const [mapDay, setMapDay] = useState<string | null>(null);
  const [dayRoute, setDayRoute] = useState<TechnicianRoute | null>(null);
  const [dayMapBusy, setDayMapBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const syncedRef = useRef(false);
  const autoTourAttempted = useRef(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/disposition", { credentials: "same-origin" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Disposition konnte nicht geladen werden.");
    setDb(data as DispositionDb);
  }, []);

  useEffect(() => {
    void load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Laden fehlgeschlagen.");
    });
  }, [load]);

  useEffect(() => {
    void fetch("/api/urlaube", { credentials: "same-origin" })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok || !data || !Array.isArray(data.requests)) return;
        setVacations(data.requests as VacationRequest[]);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!canEdit || !ready || !db || syncedRef.current) return;
    const boardTechs = technicians.filter(isBoardTechnician);
    if (!boardTechs.length) return;
    syncedRef.current = true;
    void fetch("/api/disposition", {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        technicians: boardTechs.map((item) => ({
          id: item.id,
          name: item.name,
          street: item.street,
          plz: item.plz,
          city: item.city,
          endStreet: item.endStreet,
          endPlz: item.endPlz,
          endCity: item.endCity,
        })),
      }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (res.ok) setDb(data as DispositionDb);
      })
      .catch(() => undefined);
  }, [canEdit, db, ready, technicians]);

  const boardTechnicians = useMemo(
    () => technicians.filter(isBoardTechnician),
    [technicians],
  );
  const boardIds = useMemo(
    () => new Set(boardTechnicians.map((item) => item.id)),
    [boardTechnicians],
  );

  const boardTickets = useMemo(
    () => (db?.tickets ?? []).filter((item) => boardIds.has(item.technicianId)),
    [db?.tickets, boardIds],
  );

  const openTickets = useMemo(
    () => boardTickets.filter(isRoutableTicket),
    [boardTickets],
  );

  const unassignedTickets = useMemo(
    () =>
      (db?.tickets ?? []).filter(
        (item) => item.technicianId === UNASSIGNED_TECH_ID && isOpenTicket(item) && !isCustomTicket(item),
      ),
    [db?.tickets],
  );

  const techList = useMemo(() => {
    return boardTechnicians
      .map((item) => ({
        id: item.id,
        name: item.name,
        count: boardTickets.filter(
          (ticket) => ticket.technicianId === item.id && isOpenTicket(ticket),
        ).length,
        role: item.role,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "de"));
  }, [boardTechnicians, boardTickets]);

  const extraBlocksFor = useCallback(
    (techId: string, day: string) => {
      if (getStatus(techId, day) !== "vertretung") return [];
      return [
        {
          kind: "vertretung" as const,
          label: "Vertretung",
          note: getNote(techId, day) || "",
          fillsCapacity: false,
        },
      ];
    },
    [getNote, getStatus],
  );

  const possibleAssignments = useMemo(() => {
    if (!db) return [];
    const fromDate = todayIso();
    const blocked = collectBlockedDates(techList, vacations, fromDate, extraBlocksFor);
    return planPossibleTours(boardTickets, db.homes, { fromDate, blockedDates: blocked });
  }, [boardTickets, db, extraBlocksFor, techList, vacations]);

  const possibleById = useMemo(
    () => new Map(possibleAssignments.map((item) => [item.id, item.tourDate])),
    [possibleAssignments],
  );

  useEffect(() => {
    if (selectedId === UNASSIGNED_TECH_ID) return;
    if (techList.some((item) => item.id === selectedId)) return;
    if (techList[0]) setSelectedId(techList[0].id);
  }, [selectedId, techList]);

  const selectedTickets = useMemo(
    () =>
      selectedId === UNASSIGNED_TECH_ID
        ? unassignedTickets
        : boardTickets.filter((item) => item.technicianId === selectedId && isOpenTicket(item)),
    [boardTickets, selectedId, unassignedTickets],
  );

  const selectedHome = useMemo(
    () =>
      selectedId === UNASSIGNED_TECH_ID
        ? null
        : db?.homes.find((item) => item.technicianId === selectedId) ?? null,
    [db?.homes, selectedId],
  );

  const selectedName =
    selectedId === UNASSIGNED_TECH_ID
      ? UNASSIGNED_TECH_NAME
      : techList.find((item) => item.id === selectedId)?.name ||
        selectedTickets[0]?.technicianName ||
        "";

  useEffect(() => {
    const fromDb = technicians.find((item) => item.id === selectedId);
    setHomePlz(selectedHome?.plz || fromDb?.plz || "");
    setHomeCity(selectedHome?.city || fromDb?.city || "");
    setHomeStreet(selectedHome?.street || fromDb?.street || "");
    setEndPlz(selectedHome?.endPlz || fromDb?.endPlz || "");
    setEndCity(selectedHome?.endCity || fromDb?.endCity || "");
    setEndStreet(selectedHome?.endStreet || fromDb?.endStreet || "");
  }, [selectedHome, selectedId, technicians]);

  useEffect(() => {
    if (view !== "tickets" || !selectedId || selectedId === UNASSIGNED_TECH_ID || !db) {
      setNavRoute(null);
      setPlanning(false);
      return;
    }
    let cancelled = false;
    setPlanning(true);
    void planTechnicianDay(selectedId, selectedName, openTickets, selectedHome, planDate).then(
      (route) => {
        if (!cancelled) {
          setNavRoute(route);
          setPlanning(false);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [db, openTickets, planDate, selectedHome, selectedId, selectedName, view]);

  async function handleImportFiles(files: FileList | null) {
    if (!files?.length || !canEdit) return;
    const file = files[0];
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const dataset = await parseCsvFile(file);
      const analysis = buildDispositionImport(dataset, boardTechnicians);
      if (!analysis.drafts.length) {
        throw new Error(
          `Keine Ticketzeilen erkannt. Techniker-Spalte: „${analysis.techColumn}“.`,
        );
      }
      setPendingImport({ fileName: dataset.fileName, analysis });
    } catch (err) {
      setPendingImport(null);
      setError(err instanceof Error ? err.message : "Import fehlgeschlagen.");
    } finally {
      setBusy(false);
      if (importRef.current) importRef.current.value = "";
    }
  }

  async function confirmImport() {
    if (!pendingImport || !canEdit) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/disposition/import", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: pendingImport.fileName,
          drafts: pendingImport.analysis.drafts,
          technicians: boardTechnicians.map((item) => ({
            id: item.id,
            name: item.name,
            street: item.street,
            plz: item.plz,
            city: item.city,
            endStreet: item.endStreet,
            endPlz: item.endPlz,
            endCity: item.endCity,
          })),
        }),
        signal: AbortSignal.timeout(90_000),
      });
      const raw = await res.text();
      let data: { error?: string } & Partial<DispositionDb> = {};
      try {
        data = raw ? (JSON.parse(raw) as typeof data) : {};
      } catch {
        throw new Error(
          res.ok
            ? "Ungültige Serverantwort beim Import."
            : `Import fehlgeschlagen (HTTP ${res.status}).`,
        );
      }
      if (!res.ok) throw new Error(data.error || "Import fehlgeschlagen.");
      setDb(data as DispositionDb);
      setPendingImport(null);
      const stats = (data as DispositionDb).lastImportStats;
      setMessage(
        `Import „${pendingImport.fileName}“ abgeglichen: ${pendingImport.analysis.matchedRows} offen` +
          (stats
            ? ` · ${stats.kept} behalten · ${stats.neu} neu · ${stats.closed} abgeschlossen` +
              (stats.moved ? ` · ${stats.moved} Bearbeiter gewechselt` : "") +
              (stats.unassigned ? ` · ${stats.unassigned} Partner / ohne Zuordnung` : "") +
              (stats.reopened ? ` · ${stats.reopened} wieder geöffnet` : "")
            : "") +
          (pendingImport.analysis.unmatchedSkippedRows
            ? ` · ${pendingImport.analysis.unmatchedSkippedRows} Partner / keinem Techniker zugewiesen`
            : "") +
          ".",
      );
    } catch (err) {
      const timedOut =
        err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError");
      setError(
        timedOut
          ? "Import hat zu lange gedauert. Bitte erneut versuchen."
          : err instanceof Error
            ? err.message
            : "Import fehlgeschlagen.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function patchTicket(
    id: string,
    patch: {
      flags?: Partial<DispositionFlags>;
      plannedStartMin?: number | null;
      durationMin?: number;
      technicianId?: string;
      technicianName?: string;
      zieltermin?: string | null;
      termin?: string | null;
      spanEnd?: string | null;
      title?: string;
      newUpdate?: string;
      workKindManual?: "stoerung" | "umbau" | "none" | null;
      plannerNote?: string;
      tourDate?: string | null;
      tourStartMin?: number | null;
    },
  ) {
    if (!canEdit) return;
    const res = await fetch(`/api/disposition/tickets/${id}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) {
      const message = data.error || "Status konnte nicht gespeichert werden.";
      setError(message);
      throw new Error(message);
    }
    setDb(data as DispositionDb);
    return data as DispositionDb;
  }

  async function createTask(input: {
    technicianId: string;
    technicianName: string;
    title: string;
    zieltermin: string | null;
    spanEnd: string | null;
    plannedStartMin: number | null;
    durationMin: number;
    note?: string;
  }) {
    if (!canEdit) return;
    const res = await fetch("/api/disposition/tickets", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await res.json();
    if (!res.ok) {
      const message = data.error || "Task konnte nicht angelegt werden.";
      setError(message);
      throw new Error(message);
    }
    setDb(data as DispositionDb);
  }

  async function deleteTicket(id: string) {
    if (!canEdit) return;
    const res = await fetch(`/api/disposition/tickets/${id}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    const data = await res.json();
    if (!res.ok) {
      const message = data.error || "Task konnte nicht gelöscht werden.";
      setError(message);
      throw new Error(message);
    }
    setDb(data as DispositionDb);
    setOpenTicketId(null);
  }

  async function runAutoTours(rebuild = false) {
    if (!canEdit) return;
    setTourBusy(true);
    setError("");
    try {
      const res = await fetch("/api/disposition/auto-tour", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rebuild,
          fromDate: todayIso(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Touren konnten nicht geplant werden.");
      const { autoTour, ...rest } = data as DispositionDb & { autoTour?: { assigned?: number } };
      setDb(rest);
      const assigned = Number(autoTour?.assigned) || 0;
      setMessage(
        assigned
          ? `${assigned} Tickets auf Tour gelegt. Zieltermin ist der Fahrttag; ohne Zieltermin werden freie Slots gefüllt.`
          : "Keine einsatzbereiten Tickets mit Standort für eine Tour gefunden.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tourenplanung fehlgeschlagen.");
    } finally {
      setTourBusy(false);
    }
  }

  useEffect(() => {
    autoTourAttempted.current = false;
  }, [view]);

  async function applyDayPlan() {
    if (!canEdit || !navRoute?.stops.length) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/disposition", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tickets: navRoute.stops.map((stop) => ({
            id: stop.ticketId,
            tourDate: planDate,
            tourStartMin: stop.arriveMin,
            durationMin: stop.durationMin,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Tour konnte nicht übernommen werden.");
      setDb(data as DispositionDb);
      setMessage(
        `Route für ${formatDisplayDate(planDate)} übernommen. Wunsch- und Zieltermine bleiben unverändert.`,
      );
      setView("plan");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tour konnte nicht übernommen werden.");
    } finally {
      setBusy(false);
    }
  }

  async function openDayMap(day: string) {
    if (!db || !selectedId) return;
    setMapDay(day);
    setDayRoute(null);
    setDayMapBusy(true);
    setError("");
    try {
      let nextDb = db;
      const dayTickets = boardTickets.filter((item) => {
        if (item.technicianId !== selectedId) return false;
        if (view === "moeglich") return possibleById.get(item.id) === day;
        if (isBoardView(view)) return ticketOccupiesBoardDate(item, day, view);
        return false;
      });
      const missingIds = dayTickets
        .filter((item) => item.lat == null || item.lon == null)
        .map((item) => item.id);
      const homeMissing = !(nextDb.homes.find((item) => item.technicianId === selectedId)?.lat);
      if (canEdit && (missingIds.length || homeMissing)) {
        const fromDb = technicians.find((item) => item.id === selectedId);
        const res = await fetch("/api/disposition/geocode", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ids: missingIds,
            technicians: [
              {
                id: selectedId,
                name: selectedName,
                street: fromDb?.street,
                plz: fromDb?.plz,
                city: fromDb?.city,
                endStreet: fromDb?.endStreet,
                endPlz: fromDb?.endPlz,
                endCity: fromDb?.endCity,
              },
            ],
          }),
          signal: AbortSignal.timeout(60_000),
        });
        const data = await res.json();
        if (res.ok) {
          nextDb = data as DispositionDb;
          setDb(nextDb);
        }
      }
      const home = nextDb.homes.find((item) => item.technicianId === selectedId) ?? null;
      const tickets = nextDb.tickets
        .filter((item) => item.technicianId === selectedId)
        .map((item) => {
          if (view !== "moeglich") return item;
          const next = possibleAssignments.find((assignment) => assignment.id === item.id);
          return {
            ...item,
            tourDate: next?.tourDate ?? null,
            tourStartMin: next?.tourStartMin ?? null,
          };
        });
      const route = await planTechnicianDay(
        selectedId,
        selectedName,
        tickets,
        home,
        day,
        isBoardView(view) ? view : "plan",
      );
      setDayRoute(route);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Route konnte nicht geladen werden.");
      setMapDay(null);
    } finally {
      setDayMapBusy(false);
    }
  }

  async function saveHome(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || !selectedId) return;
    setBusy(true);
    setError("");
    try {
      updateTechnician(selectedId, {
        street: homeStreet,
        plz: homePlz,
        city: homeCity,
        endStreet,
        endPlz,
        endCity,
      });
      const res = await fetch("/api/disposition", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          home: {
            technicianId: selectedId,
            technicianName: selectedName,
            plz: homePlz,
            city: homeCity,
            street: homeStreet,
            endPlz,
            endCity,
            endStreet,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Adressen konnten nicht gespeichert werden.");
      setDb(data as DispositionDb);
      setMessage("Start- und Endpunkt gespeichert – Navigation startet und endet dort.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !db) {
    return (
      <div className="page-panel">
        <div className="tracker-loading">Lade Disposition…</div>
      </div>
    );
  }

  const openTicket = openTicketId
    ? db.tickets.find((item) => item.id === openTicketId) ?? null
    : null;

  return (
    <div className="page-panel">
      <header className="section-header">
        <div>
          <h1>Disposition</h1>
          <p>
            Navigation auf echten Straßenrouten: Standort → Tickets → Standort. Arbeitstag{" "}
            {formatClock(WORK_START_MIN)}–{formatClock(workdayEndMin(planDate))} (
            {workdayLabel(planDate)}), Ticketdauer Ø 1 Stunde. Fieldservice- und Onsidetechniker,
            Adressen aus dem Techniker Finder. Partner laufen unter Kein Bearbeiter.
          </p>
        </div>
        <div className="toolbar-actions-row">
          {view === "tickets" || isBoardView(view) ? (
            <div className="disp-view-toggle">
              <button
                type="button"
                className={`btn ${view === "tickets" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setView("tickets")}
              >
                Tabelle
              </button>
              <button
                type="button"
                className={`btn ${view === "plan" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setView("plan")}
              >
                Plan
              </button>
              <button
                type="button"
                className={`btn ${view === "nachfrage" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setView("nachfrage")}
              >
                Nachfrage
              </button>
              <button
                type="button"
                className={`btn ${view === "moeglich" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setView("moeglich")}
              >
                Mögliche Tour
              </button>
              <button
                type="button"
                className={`btn ${view === "ist" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setView("ist")}
              >
                Ist
              </button>
            </div>
          ) : null}
          {view === "tickets" ? (
            <label className="disp-date">
              <span>Tag</span>
              <input
                type="date"
                value={planDate}
                onChange={(event) => setPlanDate(event.target.value)}
              />
            </label>
          ) : null}
          {view === "plan" ? (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={tourBusy || !canEdit}
              onClick={() => void runAutoTours(true)}
            >
              {tourBusy ? "Plane Touren…" : "Touren neu planen"}
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-import"
            disabled={busy || !canEdit}
            onClick={() => importRef.current?.click()}
          >
            {busy ? "Analysiere…" : "Disposition Import"}
          </button>
          <input
            ref={importRef}
            className="sr-only-date"
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={(event) => void handleImportFiles(event.target.files)}
          />
        </div>
      </header>

      {error ? (
        <div className="error-banner" role="alert">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="success-banner" role="status">
          <p>{message}</p>
        </div>
      ) : null}

      {pendingImport ? (
        <DispositionImportReport
          fileName={pendingImport.fileName}
          analysis={pendingImport.analysis}
          busy={busy}
          onConfirm={() => void confirmImport()}
          onCancel={() => {
            if (busy) return;
            setPendingImport(null);
          }}
        />
      ) : null}

      <p className="smtp-hint">
        Letzter Import:{" "}
        {db.lastImportFile
          ? `${db.lastImportFile}${db.lastImportAt ? ` · ${formatDisplayDate(db.lastImportAt.slice(0, 10))}` : ""}`
          : "noch keiner"}
        {db.lastImportStats
          ? ` · ${db.lastImportStats.kept} behalten, ${db.lastImportStats.neu} neu, ${db.lastImportStats.closed} abgeschlossen${
              db.lastImportStats.moved ? `, ${db.lastImportStats.moved} Bearbeiter gewechselt` : ""
            }${
              db.lastImportStats.unassigned
                ? `, ${db.lastImportStats.unassigned} Partner / ohne Zuordnung`
                : ""
            }`
          : ""}
        . Routen folgen der Straßen-Navigation (OSRM), nicht der Luftlinie.
      </p>

      {view === "dashboard" ? (
        <DispositionDashboard
          technicians={techList}
          tickets={boardTickets}
          vacations={vacations}
          weekDate={planDate}
          onWeekDate={setPlanDate}
          extraBlocks={extraBlocksFor}
          possibleById={possibleById}
          onOpenTechnician={(id, board = "plan") => {
            if (id) setSelectedId(id);
            setView(board);
          }}
        />
      ) : null}

      {isBoardView(view) ? (
        <section className="content-card">
          <DispositionKanban
            mode={view}
            tickets={boardTickets}
            allTickets={db.tickets}
            technicians={techList}
            technicianId={selectedId}
            onTechnicianId={setSelectedId}
            weekDate={planDate}
            onWeekDate={setPlanDate}
            canEdit={canEdit && (view === "plan" || view === "nachfrage")}
            vacations={vacations}
            dayStatus={(techId, day) => getStatus(techId, day)}
            dayNote={(techId, day) => getNote(techId, day)}
            possibleAssignments={possibleAssignments}
            onAllTechnicians={() => setView("dashboard")}
            onOpenTicket={setOpenTicketId}
            onOpenDayMap={(day) => void openDayMap(day)}
            onCreate={(input) => createTask(input)}
            onMove={(patch) =>
              void patchTicket(patch.id, {
                technicianId: patch.technicianId,
                technicianName: patch.technicianName,
                zieltermin: patch.zieltermin,
                termin: patch.termin,
                spanEnd: patch.spanEnd,
                plannedStartMin: patch.plannedStartMin,
                durationMin: patch.durationMin,
                tourDate: patch.tourDate,
                tourStartMin: patch.tourStartMin,
              }).catch(() => undefined)
            }
          />
        </section>
      ) : null}

      {view === "prio" ? (
        <section className="content-card">
          <DispositionPrio
            tickets={[...boardTickets, ...unassignedTickets]}
            technicians={techList}
            technicianId={selectedId}
            onTechnicianId={setSelectedId}
            onOpenTicket={setOpenTicketId}
            canEdit={canEdit}
            onWorkKind={(id, workKindManual) =>
              void patchTicket(id, { workKindManual }).catch(() => undefined)
            }
            onPlannerNote={(id, plannerNote) =>
              void patchTicket(id, { plannerNote }).catch(() => undefined)
            }
          />
        </section>
      ) : null}

      {view === "tickets" ? (
        <>
          <div className="disp-layout">
            <aside className="content-card disp-techs">
              <h2>Techniker</h2>
              <ul>
                {techList.map((tech) => (
                  <li key={tech.id}>
                    <button
                      type="button"
                      className={tech.id === selectedId ? "is-active" : undefined}
                      onClick={() => setSelectedId(tech.id)}
                    >
                      <strong>{tech.name}</strong>
                      <span>{tech.count} Tickets</span>
                    </button>
                  </li>
                ))}
                {unassignedTickets.length > 0 ? (
                  <li>
                    <button
                      type="button"
                      className={selectedId === UNASSIGNED_TECH_ID ? "is-active" : undefined}
                      onClick={() => setSelectedId(UNASSIGNED_TECH_ID)}
                    >
                      <strong>{UNASSIGNED_TECH_NAME}</strong>
                      <span>{unassignedTickets.length} Tickets</span>
                    </button>
                  </li>
                ) : null}
              </ul>
            </aside>

            <section className="content-card">
              <div className="content-card-head">
                <div>
                  <h2>{selectedName || "Techniker wählen"}</h2>
                  <p>
                {selectedTickets.length} offene Tickets / Tasks
                    {navRoute ? ` · ${navRoute.summary}` : ""}
                  </p>
                </div>
              </div>

              {selectedId !== UNASSIGNED_TECH_ID ? (
              <form className="smtp-form disp-home" onSubmit={(event) => void saveHome(event)}>
                <div className="disp-home-grid">
                  <label>
                    <span>Start Straße</span>
                    <input
                      value={homeStreet}
                      disabled={!canEdit}
                      onChange={(event) => setHomeStreet(event.target.value)}
                      placeholder="aus Techniker Finder"
                    />
                  </label>
                  <label>
                    <span>Start PLZ</span>
                    <input
                      value={homePlz}
                      disabled={!canEdit}
                      onChange={(event) => setHomePlz(event.target.value.replace(/\D/g, "").slice(0, 5))}
                    />
                  </label>
                  <label>
                    <span>Start Ort</span>
                    <input
                      value={homeCity}
                      disabled={!canEdit}
                      onChange={(event) => setHomeCity(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Ende Straße</span>
                    <input
                      value={endStreet}
                      disabled={!canEdit}
                      onChange={(event) => setEndStreet(event.target.value)}
                      placeholder="leer = wie Start"
                    />
                  </label>
                  <label>
                    <span>Ende PLZ</span>
                    <input
                      value={endPlz}
                      disabled={!canEdit}
                      onChange={(event) => setEndPlz(event.target.value.replace(/\D/g, "").slice(0, 5))}
                    />
                  </label>
                  <label>
                    <span>Ende Ort</span>
                    <input
                      value={endCity}
                      disabled={!canEdit}
                      onChange={(event) => setEndCity(event.target.value)}
                    />
                  </label>
                </div>
                <div className="smtp-actions">
                  <button type="submit" className="btn btn-secondary" disabled={!canEdit || busy}>
                    Start- und Endpunkt speichern
                  </button>
                </div>
              </form>
              ) : (
                <p className="smtp-hint">
                  Diese Tickets stehen im Import, aber der Bearbeiter ist ein Partner – kein
                  Fieldservice- oder Onsidetechniker. Sie werden in keiner Kanban angezeigt.
                </p>
              )}

              {selectedTickets.length === 0 ? (
                <p className="mv-empty">Keine offenen Tickets oder Tasks für diesen Techniker.</p>
              ) : (
                <div className="tracker-table-wrap">
                  <table className="tracker-table disp-table">
                    <thead>
                      <tr>
                        <th>Ticket</th>
                        {selectedId === UNASSIGNED_TECH_ID ? <th>Bearbeiter</th> : null}
                        <th>Kunde / Zieladresse</th>
                        <th>Art</th>
                        <th>Service</th>
                        <th>Kennzeichen</th>
                        <th>Zieltermin</th>
                        <th>Status</th>
                        <th>Planung</th>
                        <th>Notiz</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTickets
                        .slice()
                        .sort((a, b) => {
                          if (selectedId === UNASSIGNED_TECH_ID) {
                            const byName = a.technicianName.localeCompare(b.technicianName, "de");
                            if (byName !== 0) return byName;
                          }
                          return (a.zieltermin || "9999").localeCompare(b.zieltermin || "9999");
                        })
                        .map((ticket) => {
                          const readiness = ticketReadiness(ticket.flags);
                          const custom = isCustomTicket(ticket);
                          const workKind = custom ? "none" : ticketWorkKind(ticket);
                          const tags = custom ? [] : kennzeichenTags(ticket.kennzeichen);
                          const csvAssignee =
                            ticket.technicianName.trim() &&
                            ticket.technicianName !== UNASSIGNED_TECH_NAME
                              ? ticket.technicianName
                              : "—";
                          return (
                            <tr
                              key={ticket.id}
                              className={`disp-ticket-row${custom ? " is-custom" : ""}`}
                              onClick={() => setOpenTicketId(ticket.id)}
                            >
                              <td>
                                <strong>{ticketDisplayTitle(ticket)}</strong>
                                {custom ? <small>Eigener Task</small> : null}
                              </td>
                              {selectedId === UNASSIGNED_TECH_ID ? <td>{csvAssignee}</td> : null}
                              <td>
                                <div>{custom ? ticket.title || ticket.customer : ticket.customer || "—"}</div>
                                <small>
                                  {custom
                                    ? ticket.spanEnd && ticket.spanEnd > (ticket.zieltermin || "")
                                      ? "mehrere Tage"
                                      : "ohne Adresse"
                                    : ticket.addressLabel || "keine Adresse"}
                                </small>
                                {ticket.note ? <small>{ticket.note}</small> : null}
                              </td>
                              <td onClick={(event) => event.stopPropagation()}>
                                {custom ? (
                                  "—"
                                ) : canEdit ? (
                                  <WorkKindSelect
                                    ticket={ticket}
                                    onChange={(workKindManual) =>
                                      void patchTicket(ticket.id, { workKindManual }).catch(
                                        () => undefined,
                                      )
                                    }
                                  />
                                ) : workKind === "none" ? (
                                  "—"
                                ) : (
                                  TICKET_WORK_KIND_LABELS[workKind]
                                )}
                              </td>
                              <td>{custom ? "—" : ticket.service || "—"}</td>
                              <td>
                                {tags.length ? (
                                  <div className="disp-kennzeichen">
                                    {tags.map((tag) => (
                                      <span key={tag} className="disp-kennzeichen-chip">
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td>
                                {ticket.zieltermin
                                  ? formatDisplayDate(ticket.zieltermin)
                                  : ticket.termin
                                    ? `${formatDisplayDate(ticket.termin)} · Wunschtermin`
                                    : "—"}
                                {ticket.spanEnd &&
                                ticketScheduleStart(ticket) &&
                                ticket.spanEnd > (ticketScheduleStart(ticket) || "")
                                  ? ` – ${formatDisplayDate(ticket.spanEnd)}`
                                  : ""}
                                {ticket.plannedStartMin != null ? (
                                  <small>
                                    {formatClock(ticket.plannedStartMin)} · {ticket.durationMin} min
                                  </small>
                                ) : null}
                              </td>
                              <td onClick={(event) => event.stopPropagation()}>
                                {custom ? (
                                  <em className="disp-ready is-custom">Eigener Task</em>
                                ) : (
                                  <div className="disp-flags">
                                    {DISPOSITION_FLAGS.map((flag) => (
                                      <label key={flag}>
                                        <input
                                          type="checkbox"
                                          checked={ticket.flags[flag]}
                                          disabled={!canEdit}
                                          onChange={(event) =>
                                            void patchTicket(ticket.id, {
                                              flags: {
                                                [flag]: event.target.checked,
                                              } as Partial<DispositionFlags>,
                                            })
                                              .then(() => {
                                                if (flag === "ersatzteileEingetroffen" && event.target.checked) {
                                                  void runAutoTours(false);
                                                }
                                              })
                                              .catch(() => undefined)
                                          }
                                        />
                                        {DISPOSITION_FLAG_LABELS[flag as DispositionFlag]}
                                      </label>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td>
                                <em className={`disp-ready is-${custom ? "custom" : readiness}`}>
                                  {custom ? `${ticket.durationMin} min/Tag` : DISPOSITION_READINESS_LABELS[readiness]}
                                </em>
                              </td>
                              <td onClick={(event) => event.stopPropagation()}>
                                {canEdit ? (
                                  <TicketNoteField
                                    value={ticket.plannerNote}
                                    onSave={(plannerNote) =>
                                      void patchTicket(ticket.id, { plannerNote }).catch(
                                        () => undefined,
                                      )
                                    }
                                  />
                                ) : ticket.plannerNote ? (
                                  ticket.plannerNote
                                ) : (
                                  "—"
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          {navRoute ? (
            <section className="content-card disp-route">
              <div className="content-card-head">
                <div>
                  <h2>Navigationsroute {selectedName}</h2>
                  <p>
                    {planning ? "Berechne Fahrzeiten… " : ""}
                    Straßenroute Standort → Tickets → Standort. Arbeitstag{" "}
                    {formatClock(WORK_START_MIN)}–{formatClock(workdayEndMin(planDate))} (
                    {workdayLabel(planDate)}), je Ticket Ø 1 Stunde. Was inkl. Rückfahrt nicht passt,
                    bleibt außen vor.
                  </p>
                </div>
                <div className="toolbar-actions-row">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!canEdit || busy || !navRoute.stops.length}
                    onClick={() => void applyDayPlan()}
                  >
                    Tour in Tour-Ansicht übernehmen
                  </button>
                </div>
              </div>
              {navRoute.hasHome ? (
                <p className="smtp-hint">
                  Start: {navRoute.homeLabel || "nicht gesetzt"} · Ende: {navRoute.endLabel || "wie Start"}
                  {navRoute.returnMin
                    ? ` · Rückfahrt ${navRoute.returnKm} km / ${navRoute.returnMin} min`
                    : ""}
                </p>
              ) : (
                <p className="smtp-hint">
                  Kein Start-/Endpunkt mit Koordinaten. Tickets werden trotzdem auf der Karte gezeigt.
                  Adresse in der Techniker-DB oder im Techniker Finder hinterlegen.
                </p>
              )}
              {navRoute.stops.length || selectedHome?.lat || selectedTickets.some((item) => item.lat != null) ? (
                <DispositionMap
                  layers={[{ route: navRoute, home: selectedHome, color: ROUTE_COLORS[0] }]}
                  tickets={selectedTickets}
                />
              ) : null}
              {navRoute.stops.length === 0 ? (
                <p className="mv-empty">
                  Keine fahrbaren Stopps für {formatDisplayDate(planDate)}. Entweder fehlen Adressen,
                  alle Tickets warten auf Teile/KV, oder der Zieltermin liegt auf einem anderen Tag.
                </p>
              ) : (
                <ol className="disp-stops">
                  {navRoute.stops.map((stop) => (
                    <li
                  key={stop.ticketId}
                  onClick={() => setOpenTicketId(stop.ticketId)}
                  style={{ cursor: "pointer" }}
                >
                      <strong>
                        {stop.order}. {stop.ticketNo || stop.customer || "Ticket"}
                      </strong>
                      <span>{stop.addressLabel}</span>
                      <em>
                        {formatClock(stop.arriveMin)}–{formatClock(stop.departMin)} · {stop.driveMin} min
                        Fahrt / {stop.kmFromPrev} km · {stop.durationMin} min vor Ort ·{" "}
                        {DISPOSITION_READINESS_LABELS[stop.readiness]} · {stop.reason}
                      </em>
                    </li>
                  ))}
                </ol>
              )}
              {navRoute.held.length ? (
                <>
                  <h3>Nicht in der Route</h3>
                  <ul className="disp-held">
                    {navRoute.held.map((item) => (
                      <li key={item.ticketId}>
                        <strong>{item.ticketNo || item.customer || "Ticket"}</strong>
                        <span>{item.addressLabel}</span>
                        <em>
                          {DISPOSITION_READINESS_LABELS[item.readiness]} · {item.reason}
                        </em>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}

      {mapDay ? (
        <div
          className="aufgaben-modal-backdrop"
          role="presentation"
          onClick={() => {
            setMapDay(null);
            setDayRoute(null);
          }}
        >
          <div
            className="aufgaben-modal disp-map-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="disp-day-map-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="aufgaben-modal-head">
              <div>
                <h2 id="disp-day-map-title">
                  Route {selectedName} · {formatDisplayDate(mapDay)}
                </h2>
                <p className="smtp-hint" style={{ margin: "0.2rem 0 0" }}>
                  {dayMapBusy
                    ? "Berechne Straßenroute…"
                    : dayRoute?.summary || "Keine planbare Route für diesen Tag."}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setMapDay(null);
                  setDayRoute(null);
                }}
              >
                Schließen
              </button>
            </header>
            <div className="disp-map-modal-body">
              {dayRoute &&
              !dayMapBusy &&
              (dayRoute.stops.length > 0 ||
                selectedHome?.lat ||
                boardTickets.some(
                  (item) =>
                    item.technicianId === selectedId &&
                    item.lat != null &&
                    mapDay &&
                    (view === "moeglich"
                      ? possibleById.get(item.id) === mapDay
                      : isBoardView(view)
                        ? ticketOccupiesBoardDate(item, mapDay, view)
                        : false),
                )) ? (
                <DispositionMap
                  key={`${mapDay}-${dayRoute.stops.length}-${selectedHome?.lat ?? "x"}`}
                  layers={[
                    {
                      route: dayRoute,
                      home: selectedHome,
                      color: ROUTE_COLORS[0],
                    },
                  ]}
                  tickets={boardTickets.filter((item) => item.technicianId === selectedId)}
                />
              ) : (
                <p className="mv-empty">
                  {dayMapBusy
                    ? "Karte wird geladen…"
                    : "Keine geografisch planbaren Tickets an diesem Tag. Bitte Standort und Zieladressen prüfen."}
                </p>
              )}
              {dayRoute?.stops.length ? (
                <ol className="disp-stops">
                  {dayRoute.stops.map((stop) => (
                    <li key={stop.ticketId}>
                      <strong>
                        {stop.order}. {stop.ticketNo || stop.customer || "Ticket"}
                      </strong>
                      <span>{stop.addressLabel}</span>
                      <em>
                        {formatClock(stop.arriveMin)}–{formatClock(stop.departMin)} · {stop.kmFromPrev} km
                      </em>
                    </li>
                  ))}
                </ol>
              ) : null}
              {dayRoute?.held.length ? (
                <>
                  <h3>Nicht in der Route</h3>
                  <ul className="disp-held">
                    {dayRoute.held.map((item) => (
                      <li key={item.ticketId}>
                        <strong>{item.ticketNo || item.customer || "Ticket"}</strong>
                        <span>{item.addressLabel}</span>
                        <em>{item.reason}</em>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {openTicket ? (
        <DispositionTicketModal
          ticket={openTicket}
          canEdit={canEdit}
          onClose={() => setOpenTicketId(null)}
          onSave={async (patch) => {
            await patchTicket(openTicket.id, patch);
          }}
          onDelete={
            isCustomTicket(openTicket)
              ? async () => {
                  await deleteTicket(openTicket.id);
                }
              : undefined
          }
        />
      ) : null}
    </div>
  );
}
