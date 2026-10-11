"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  clampToEvaluationStart,
  clearPendingTrackerBackup,
  isMonthInEvaluationRange,
  EVALUATION_START,
  hasTrackerInStorage,
  loadPendingTrackerBackup,
  loadTrackerFromStorage,
  loadTrackerSnapshotFromPublic,
  mergeTrackerStates,
  isTrackerLikelyWiped,
  recoverTrackerFromSnapshot,
  nextWorkday,
  previousWorkday,
  savePendingTrackerBackup,
  saveTrackerToStorage,
  toDateInputValue,
  createDefaultTracker,
  getDayNote,
  getDayStatus,
  getTicketCount,
  downloadTrackerSnapshot,
} from "@/lib/tracker";
import {
  PARTNER_TECH_ID,
  PARTNER_TECH_NAME,
  buildTicketImport,
  type TicketImportResult,
} from "@/lib/ticket-import";
import {
  statusNeedsNote,
  ticketKey,
  type DayStatus,
  type Technician,
  type TechnicianRole,
  type TrackerState,
} from "@/lib/tracker-types";
import type { ImportedDataset } from "@/lib/types";
import { createId } from "@/lib/id";
import { useEditAccess } from "./EditAccessProvider";

type TrackerContextValue = {
  ready: boolean;
  year: number;
  selectedDate: string;
  technicians: Technician[];
  setYear: (year: number) => void;
  setSelectedDate: (date: string) => void;
  setMonth: (monthIndex: number) => void;
  setTicketCount: (technicianId: string, date: string, count: number | null) => void;
  setStatus: (technicianId: string, date: string, status: DayStatus) => void;
  setNote: (technicianId: string, date: string, note: string) => void;
  addTechnician: (name: string, role?: TechnicianRole, email?: string) => void;
  renameTechnician: (id: string, name: string) => void;
  setTechnicianRole: (id: string, role: TechnicianRole) => void;
  updateTechnician: (
    id: string,
    patch: {
      name?: string;
      role?: TechnicianRole;
      email?: string;
      street?: string;
      plz?: string;
      city?: string;
      endStreet?: string;
      endPlz?: string;
      endCity?: string;
    },
  ) => void;
  setTechnicianEmail: (id: string, email: string) => void;
  removeTechnician: (id: string) => void;
  applyTicketImport: (result: TicketImportResult) => void;
  analyzeTicketImport: (dataset: ImportedDataset) => TicketImportResult;
  getCount: (technicianId: string, date: string) => number | null;
  getStatus: (technicianId: string, date: string) => DayStatus;
  getNote: (technicianId: string, date: string) => string;
  setOpenTicketCount: (technicianId: string, date: string, count: number | null) => void;
  setOpenStatus: (technicianId: string, date: string, status: DayStatus) => void;
  setOpenNote: (technicianId: string, date: string, note: string) => void;
  applyOpenTicketImport: (result: TicketImportResult) => void;
  analyzeOpenTicketImport: (dataset: ImportedDataset) => TicketImportResult;
  getOpenCount: (technicianId: string, date: string) => number | null;
  getOpenStatus: (technicianId: string, date: string) => DayStatus;
  getOpenNote: (technicianId: string, date: string) => string;
  setTourTicketCount: (technicianId: string, date: string, count: number | null) => void;
  applyTourTicketImport: (result: TicketImportResult) => void;
  analyzeTourTicketImport: (dataset: ImportedDataset) => TicketImportResult;
  getTourCount: (technicianId: string, date: string) => number | null;
  refresh: () => void;
  exportTrackerData: () => void;
  restoreTrackerFromSnapshot: () => Promise<boolean>;
};

const TrackerContext = createContext<TrackerContextValue | null>(null);

export function TrackerProvider({ children }: { children: React.ReactNode }) {
  const { canEdit } = useEditAccess();
  const [state, setState] = useState<TrackerState>(() => createDefaultTracker());
  const stateRef = useRef(state);
  stateRef.current = state;
  const [selectedDate, setSelectedDateState] = useState(() =>
    clampToEvaluationStart(toDateInputValue(previousWorkday())),
  );
  const [ready, setReady] = useState(false);

  const flushBackup = useCallback(async (next: TrackerState, source: string) => {
    savePendingTrackerBackup(next, source);
    try {
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tracker: next, source }),
      });
      if (!res.ok) return false;
      clearPendingTrackerBackup();
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const entryDate = clampToEvaluationStart(toDateInputValue(previousWorkday()));
      const year = Number(entryDate.slice(0, 4));

      const snapshot = await loadTrackerSnapshotFromPublic();
      let server: TrackerState | null = null;
      try {
        const res = await fetch("/api/backup", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { tracker?: TrackerState | null };
          server = data.tracker ?? null;
        }
      } catch {
        /* ignore */
      }
      const local = hasTrackerInStorage() ? loadTrackerFromStorage() : null;
      const base = mergeTrackerStates(snapshot, server);
      const wiped = isTrackerLikelyWiped(local, base);
      const loaded = wiped
        ? recoverTrackerFromSnapshot(local, base)
        : mergeTrackerStates(base, local);

      if (cancelled) return;

      const next = {
        ...loaded,
        year: Number.isFinite(year) ? year : loaded.year,
      };
      setState(next);
      saveTrackerToStorage(next);
      setSelectedDateState(entryDate);
      setReady(true);

      const pending = loadPendingTrackerBackup();
      if (pending?.tracker) {
        void flushBackup(pending.tracker, pending.source);
      } else {
        void flushBackup(next, "tracker-hydrate");
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [flushBackup]);

  const persist = useCallback((next: TrackerState) => {
    // Sofort aktualisieren, damit Folgeaktionen (z. B. Rolle + Speichern) nicht
    // mit einem veralteten State die Änderungen überschreiben.
    stateRef.current = next;
    saveTrackerToStorage(next);
    startTransition(() => {
      setState(next);
    });
    void flushBackup(next, "tracker-persist");
  }, [flushBackup]);

  const updateFromLatest = useCallback(
    (updater: (prev: TrackerState) => TrackerState) => {
      persist(updater(stateRef.current));
    },
    [persist],
  );

  useEffect(() => {
    if (!ready) return;

    const retryPending = () => {
      const pending = loadPendingTrackerBackup();
      if (pending?.tracker) {
        void flushBackup(pending.tracker, pending.source);
      }
    };

    const onOnline = () => retryPending();
    const onVisible = () => {
      if (document.visibilityState === "visible") retryPending();
    };

    const timer = window.setInterval(retryPending, 30_000);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);

    retryPending();

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [flushBackup, ready]);

  const exportTrackerData = useCallback(() => {
    downloadTrackerSnapshot(state);
  }, [state]);

  const restoreTrackerFromSnapshot = useCallback(async () => {
    const snapshot = await loadTrackerSnapshotFromPublic();
    if (!snapshot) return false;
    const local = hasTrackerInStorage() ? loadTrackerFromStorage() : null;
    const recovered = recoverTrackerFromSnapshot(local, snapshot);
    persist(recovered);
    return true;
  }, [persist]);

  const setYear = useCallback(
    (year: number) => {
      setSelectedDateState((current) => {
        const parts = current.split("-");
        const month = parts[1] ?? "07";
        const day = parts[2] ?? "01";
        const monthIndex = Number(month) - 1;
        let next = `${year}-${month}-${day}`;
        if (!isMonthInEvaluationRange(year, monthIndex)) {
          next = EVALUATION_START;
        }
        next = clampToEvaluationStart(next);
        persist({ ...state, year: Number(next.slice(0, 4)) });
        return next;
      });
    },
    [persist, state],
  );

  const setSelectedDate = useCallback(
    (date: string) => {
      const next = clampToEvaluationStart(date);
      setSelectedDateState(next);
      const year = Number(next.slice(0, 4));
      if (Number.isFinite(year) && year !== state.year) {
        persist({ ...state, year });
      }
    },
    [persist, state],
  );

  const setMonth = useCallback(
    (monthIndex: number) => {
      if (!isMonthInEvaluationRange(state.year, monthIndex)) return;
      const day = Number(selectedDate.slice(8, 10)) || 1;
      const maxDay = new Date(state.year, monthIndex + 1, 0).getDate();
      const safeDay = Math.min(day, maxDay);
      const next = clampToEvaluationStart(
        `${state.year}-${String(monthIndex + 1).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`,
      );
      setSelectedDateState(next);
      const year = Number(next.slice(0, 4));
      if (year !== state.year) {
        persist({ ...state, year });
      }
    },
    [persist, selectedDate, state],
  );

  const setTicketCount = useCallback(
    (technicianId: string, date: string, count: number | null) => {
      if (!canEdit) return;
      const key = ticketKey(technicianId, date);
      const tickets = { ...state.tickets };
      const statuses = { ...state.statuses };

      if (count === null || !Number.isFinite(count)) {
        delete tickets[key];
        if (statuses[key] === "tickets") delete statuses[key];
      } else {
        const safe = Math.max(0, Math.round(count));
        tickets[key] = safe;
        statuses[key] = "tickets";
      }

      persist({ ...state, tickets, statuses });
    },
    [canEdit, persist, state],
  );

  const setStatus = useCallback(
    (technicianId: string, date: string, status: DayStatus) => {
      if (!canEdit) return;
      const key = ticketKey(technicianId, date);
      const statuses = { ...state.statuses };
      const notes = { ...state.notes };
      const tickets = { ...state.tickets };

      if (status === "tickets") {
        if (Object.prototype.hasOwnProperty.call(tickets, key)) statuses[key] = "tickets";
        else delete statuses[key];
        delete notes[key];
      } else {
        statuses[key] = status;
        if (!statusNeedsNote(status)) delete notes[key];
      }

      persist({ ...state, statuses, notes, tickets });
    },
    [canEdit, persist, state],
  );

  const setNote = useCallback(
    (technicianId: string, date: string, note: string) => {
      if (!canEdit) return;
      const key = ticketKey(technicianId, date);
      const notes = { ...state.notes };
      const trimmed = note.trim();
      if (!trimmed) delete notes[key];
      else notes[key] = note;
      persist({ ...state, notes });
    },
    [canEdit, persist, state],
  );

  const addTechnician = useCallback(
    (name: string, role: TechnicianRole = "fieldservice", email = "") => {
      if (!canEdit) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      updateFromLatest((prev) => {
        if (prev.technicians.some((tech) => tech.name.toLowerCase() === trimmed.toLowerCase())) {
          return prev;
        }
        return {
          ...prev,
          technicians: [
            ...prev.technicians,
            {
              id: createId("tech"),
              name: trimmed,
              role,
              email: email.trim(),
            },
          ],
        };
      });
    },
    [canEdit, updateFromLatest],
  );

  const renameTechnician = useCallback(
    (id: string, name: string) => {
      if (!canEdit) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      updateFromLatest((prev) => {
        if (
          prev.technicians.some(
            (tech) => tech.id !== id && tech.name.toLowerCase() === trimmed.toLowerCase(),
          )
        ) {
          return prev;
        }
        return {
          ...prev,
          technicians: prev.technicians.map((tech) =>
            tech.id === id ? { ...tech, name: trimmed } : tech,
          ),
        };
      });
    },
    [canEdit, updateFromLatest],
  );

  const setTechnicianRole = useCallback(
    (id: string, role: TechnicianRole) => {
      if (!canEdit) return;
      updateFromLatest((prev) => ({
        ...prev,
        technicians: prev.technicians.map((tech) =>
          tech.id === id ? { ...tech, role } : tech,
        ),
      }));
    },
    [canEdit, updateFromLatest],
  );

  const updateTechnician = useCallback(
    (
      id: string,
      patch: {
        name?: string;
        role?: TechnicianRole;
        email?: string;
        street?: string;
        plz?: string;
        city?: string;
        endStreet?: string;
        endPlz?: string;
        endCity?: string;
      },
    ) => {
      if (!canEdit) return;
      const trimmedName = patch.name?.trim();
      if (patch.name !== undefined && !trimmedName) return;
      updateFromLatest((prev) => {
        if (
          trimmedName &&
          prev.technicians.some(
            (tech) => tech.id !== id && tech.name.toLowerCase() === trimmedName.toLowerCase(),
          )
        ) {
          return prev;
        }
        return {
          ...prev,
          technicians: prev.technicians.map((tech) => {
            if (tech.id !== id) return tech;
            return {
              ...tech,
              ...(trimmedName ? { name: trimmedName } : {}),
              ...(patch.role ? { role: patch.role } : {}),
              ...(patch.email !== undefined ? { email: patch.email.trim() } : {}),
              ...(patch.street !== undefined ? { street: patch.street.trim() } : {}),
              ...(patch.plz !== undefined ? { plz: patch.plz.replace(/\D/g, "").slice(0, 5) } : {}),
              ...(patch.city !== undefined ? { city: patch.city.trim() } : {}),
              ...(patch.endStreet !== undefined ? { endStreet: patch.endStreet.trim() } : {}),
              ...(patch.endPlz !== undefined ? { endPlz: patch.endPlz.replace(/\D/g, "").slice(0, 5) } : {}),
              ...(patch.endCity !== undefined ? { endCity: patch.endCity.trim() } : {}),
            };
          }),
        };
      });
    },
    [canEdit, updateFromLatest],
  );

  const setTechnicianEmail = useCallback(
    (id: string, email: string) => {
      if (!canEdit) return;
      updateFromLatest((prev) => ({
        ...prev,
        technicians: prev.technicians.map((tech) =>
          tech.id === id ? { ...tech, email: email.trim() } : tech,
        ),
      }));
    },
    [canEdit, updateFromLatest],
  );

  const removeTechnician = useCallback(
    (id: string) => {
      if (!canEdit) return;
      updateFromLatest((prev) => {
        const tickets = { ...prev.tickets };
        const statuses = { ...prev.statuses };
        const notes = { ...prev.notes };
        const openTickets = { ...prev.openTickets };
        const openStatuses = { ...prev.openStatuses };
        const openNotes = { ...prev.openNotes };
        const tourTickets = { ...prev.tourTickets };
        for (const key of Object.keys(tickets)) {
          if (key.startsWith(`${id}|`)) delete tickets[key];
        }
        for (const key of Object.keys(statuses)) {
          if (key.startsWith(`${id}|`)) delete statuses[key];
        }
        for (const key of Object.keys(notes)) {
          if (key.startsWith(`${id}|`)) delete notes[key];
        }
        for (const key of Object.keys(openTickets)) {
          if (key.startsWith(`${id}|`)) delete openTickets[key];
        }
        for (const key of Object.keys(openStatuses)) {
          if (key.startsWith(`${id}|`)) delete openStatuses[key];
        }
        for (const key of Object.keys(openNotes)) {
          if (key.startsWith(`${id}|`)) delete openNotes[key];
        }
        for (const key of Object.keys(tourTickets)) {
          if (key.startsWith(`${id}|`)) delete tourTickets[key];
        }
        return {
          ...prev,
          technicians: prev.technicians.filter((tech) => tech.id !== id),
          tickets,
          statuses,
          notes,
          openTickets,
          openStatuses,
          openNotes,
          tourTickets,
        };
      });
    },
    [canEdit, updateFromLatest],
  );

  const analyzeTicketImport = useCallback(
    (dataset: ImportedDataset) => buildTicketImport(dataset, state.technicians),
    [state.technicians],
  );

  const applyTicketImport = useCallback(
    (result: TicketImportResult) => {
      if (!canEdit) return;
      let technicians = [...state.technicians];

      if (
        result.partnerNeeded &&
        !technicians.some((tech) => tech.id === PARTNER_TECH_ID)
      ) {
        technicians = [
          ...technicians,
          {
            id: PARTNER_TECH_ID,
            name: PARTNER_TECH_NAME,
            role: "partner",
          },
        ];
      }

      const tickets = { ...state.tickets };
      const statuses = { ...state.statuses };

      // Bestehende Tage bleiben; Import setzt/aktualisiert nur die Keys aus der Datei.
      for (const [key, count] of Object.entries(result.tickets)) {
        tickets[key] = count;
        statuses[key] = "tickets";
      }

      const firstDate = Object.keys(result.tickets)
        .map((key) => key.split("|")[1])
        .filter(Boolean)
        .sort()[0];

      const nextYear = firstDate ? Number(firstDate.slice(0, 4)) : state.year;

      if (firstDate) {
        setSelectedDateState(firstDate);
      }

      persist({
        ...state,
        year: Number.isFinite(nextYear) ? nextYear : state.year,
        technicians,
        tickets,
        statuses,
      });
    },
    [canEdit, persist, state],
  );

  const getCount = useCallback(
    (technicianId: string, date: string) => getTicketCount(state.tickets, technicianId, date),
    [state.tickets],
  );

  const getStatus = useCallback(
    (technicianId: string, date: string) => getDayStatus(state.statuses, technicianId, date),
    [state.statuses],
  );

  const getNote = useCallback(
    (technicianId: string, date: string) => getDayNote(state.notes, technicianId, date),
    [state.notes],
  );

  const setOpenTicketCount = useCallback(
    (technicianId: string, date: string, count: number | null) => {
      if (!canEdit) return;
      const key = ticketKey(technicianId, date);
      const openTickets = { ...state.openTickets };
      const openStatuses = { ...state.openStatuses };

      if (count === null || !Number.isFinite(count)) {
        delete openTickets[key];
        if (openStatuses[key] === "tickets") delete openStatuses[key];
      } else {
        const safe = Math.max(0, Math.round(count));
        openTickets[key] = safe;
        openStatuses[key] = "tickets";
      }

      persist({ ...state, openTickets, openStatuses });
    },
    [canEdit, persist, state],
  );

  const setOpenStatus = useCallback(
    (technicianId: string, date: string, status: DayStatus) => {
      if (!canEdit) return;
      const key = ticketKey(technicianId, date);
      const openStatuses = { ...state.openStatuses };
      const openNotes = { ...state.openNotes };
      const openTickets = { ...state.openTickets };

      if (status === "tickets") {
        if (Object.prototype.hasOwnProperty.call(openTickets, key)) openStatuses[key] = "tickets";
        else delete openStatuses[key];
        delete openNotes[key];
      } else {
        openStatuses[key] = status;
        if (!statusNeedsNote(status)) delete openNotes[key];
      }

      persist({ ...state, openStatuses, openNotes, openTickets });
    },
    [canEdit, persist, state],
  );

  const setOpenNote = useCallback(
    (technicianId: string, date: string, note: string) => {
      if (!canEdit) return;
      const key = ticketKey(technicianId, date);
      const openNotes = { ...state.openNotes };
      const trimmed = note.trim();
      if (!trimmed) delete openNotes[key];
      else openNotes[key] = note;
      persist({ ...state, openNotes });
    },
    [canEdit, persist, state],
  );

  const analyzeOpenTicketImport = useCallback(
    (dataset: ImportedDataset) => {
      const today = toDateInputValue(new Date());
      return buildTicketImport(dataset, state.technicians, {
        forceDate: today,
        dateColumnLabel: "Aktuelles Datum",
      });
    },
    [state.technicians],
  );

  const applyOpenTicketImport = useCallback(
    (result: TicketImportResult) => {
      if (!canEdit) return;
      let technicians = [...state.technicians];

      if (
        result.partnerNeeded &&
        !technicians.some((tech) => tech.id === PARTNER_TECH_ID)
      ) {
        technicians = [
          ...technicians,
          {
            id: PARTNER_TECH_ID,
            name: PARTNER_TECH_NAME,
            role: "partner",
          },
        ];
      }

      const openTickets = { ...state.openTickets };
      const openStatuses = { ...state.openStatuses };

      // Historische Tage bleiben; heutiger Import wird nur angefügt/aktualisiert.
      for (const [key, count] of Object.entries(result.tickets)) {
        openTickets[key] = count;
        openStatuses[key] = "tickets";
      }

      const firstDate =
        result.onlyDate ??
        Object.keys(result.tickets)
          .map((key) => key.split("|")[1])
          .filter(Boolean)
          .sort()[0];

      const nextYear = firstDate ? Number(firstDate.slice(0, 4)) : state.year;

      if (firstDate) {
        setSelectedDateState(clampToEvaluationStart(firstDate));
      }

      persist({
        ...state,
        year: Number.isFinite(nextYear) ? nextYear : state.year,
        technicians,
        openTickets,
        openStatuses,
      });
    },
    [canEdit, persist, state],
  );

  const getOpenCount = useCallback(
    (technicianId: string, date: string) =>
      getTicketCount(state.openTickets, technicianId, date),
    [state.openTickets],
  );

  const getOpenStatus = useCallback(
    (technicianId: string, date: string) =>
      getDayStatus(state.openStatuses, technicianId, date),
    [state.openStatuses],
  );

  const getOpenNote = useCallback(
    (technicianId: string, date: string) =>
      getDayNote(state.openNotes, technicianId, date),
    [state.openNotes],
  );

  const setTourTicketCount = useCallback(
    (technicianId: string, date: string, count: number | null) => {
      if (!canEdit) return;
      const key = ticketKey(technicianId, date);
      const tourTickets = { ...state.tourTickets };

      if (count === null || !Number.isFinite(count)) {
        delete tourTickets[key];
      } else {
        tourTickets[key] = Math.max(0, Math.round(count));
      }

      persist({ ...state, tourTickets });
    },
    [canEdit, persist, state],
  );

  const analyzeTourTicketImport = useCallback(
    (dataset: ImportedDataset) => {
      const targetDate = toDateInputValue(nextWorkday());
      return buildTicketImport(dataset, state.technicians, {
        dateAliases: ["zieltermin"],
        unmatchedMode: "skip",
        dateColumnLabel: "Zieltermin",
        onlyDate: targetDate,
      });
    },
    [state.technicians],
  );

  const applyTourTicketImport = useCallback(
    (result: TicketImportResult) => {
      if (!canEdit) return;
      const tourTickets = { ...state.tourTickets };

      // Bestehende Tour-Tage bleiben; Import setzt nur die Keys aus der Datei.
      for (const [key, count] of Object.entries(result.tickets)) {
        tourTickets[key] = count;
      }

      const firstDate =
        result.onlyDate ??
        Object.keys(result.tickets)
          .map((key) => key.split("|")[1])
          .filter(Boolean)
          .sort()[0];

      const nextYear = firstDate ? Number(firstDate.slice(0, 4)) : state.year;

      if (firstDate) {
        setSelectedDateState(clampToEvaluationStart(firstDate));
      }

      persist({
        ...state,
        year: Number.isFinite(nextYear) ? nextYear : state.year,
        tourTickets,
      });
    },
    [canEdit, persist, state],
  );

  const getTourCount = useCallback(
    (technicianId: string, date: string) =>
      getTicketCount(state.tourTickets, technicianId, date),
    [state.tourTickets],
  );

  const refresh = useCallback(() => {
    const loaded = loadTrackerFromStorage();
    setState(loaded);
  }, []);

  const value = useMemo(
    () => ({
      ready,
      year: state.year,
      selectedDate,
      technicians: state.technicians,
      setYear,
      setSelectedDate,
      setMonth,
      setTicketCount,
      setStatus,
      setNote,
      addTechnician,
      renameTechnician,
      setTechnicianRole,
      updateTechnician,
      setTechnicianEmail,
      removeTechnician,
      applyTicketImport,
      analyzeTicketImport,
      getCount,
      getStatus,
      getNote,
      setOpenTicketCount,
      setOpenStatus,
      setOpenNote,
      applyOpenTicketImport,
      analyzeOpenTicketImport,
      getOpenCount,
      getOpenStatus,
      getOpenNote,
      setTourTicketCount,
      applyTourTicketImport,
      analyzeTourTicketImport,
      getTourCount,
      refresh,
      exportTrackerData,
      restoreTrackerFromSnapshot,
    }),
    [
      ready,
      state.year,
      state.technicians,
      selectedDate,
      setYear,
      setSelectedDate,
      setMonth,
      setTicketCount,
      setStatus,
      setNote,
      addTechnician,
      renameTechnician,
      setTechnicianRole,
      updateTechnician,
      setTechnicianEmail,
      removeTechnician,
      applyTicketImport,
      analyzeTicketImport,
      getCount,
      getStatus,
      getNote,
      setOpenTicketCount,
      setOpenStatus,
      setOpenNote,
      applyOpenTicketImport,
      analyzeOpenTicketImport,
      getOpenCount,
      getOpenStatus,
      getOpenNote,
      setTourTicketCount,
      applyTourTicketImport,
      analyzeTourTicketImport,
      getTourCount,
      refresh,
      exportTrackerData,
      restoreTrackerFromSnapshot,
    ],
  );

  return <TrackerContext.Provider value={value}>{children}</TrackerContext.Provider>;
}

export function useTracker() {
  const context = useContext(TrackerContext);
  if (!context) {
    throw new Error("useTracker muss innerhalb von TrackerProvider verwendet werden.");
  }
  return context;
}
