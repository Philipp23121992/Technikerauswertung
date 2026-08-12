"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  clampToEvaluationStart,
  isMonthInEvaluationRange,
  EVALUATION_START,
  hasTrackerInStorage,
  loadTrackerFromStorage,
  loadTrackerSnapshotFromPublic,
  mergeTrackerStates,
  nextWorkday,
  previousWorkday,
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
  addTechnician: (name: string, role?: TechnicianRole) => void;
  renameTechnician: (id: string, name: string) => void;
  setTechnicianRole: (id: string, role: TechnicianRole) => void;
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
};

const TrackerContext = createContext<TrackerContextValue | null>(null);

export function TrackerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<TrackerState>(() => createDefaultTracker());
  const [selectedDate, setSelectedDateState] = useState(() =>
    clampToEvaluationStart(toDateInputValue(previousWorkday())),
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const entryDate = clampToEvaluationStart(toDateInputValue(previousWorkday()));
      const year = Number(entryDate.slice(0, 4));

      const snapshot = await loadTrackerSnapshotFromPublic();
      const local = hasTrackerInStorage() ? loadTrackerFromStorage() : null;
      const loaded = mergeTrackerStates(snapshot, local);

      if (cancelled) return;

      const next = {
        ...loaded,
        year: Number.isFinite(year) ? year : loaded.year,
      };
      setState(next);
      saveTrackerToStorage(next);
      setSelectedDateState(entryDate);
      setReady(true);
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: TrackerState) => {
    startTransition(() => {
      setState(next);
      saveTrackerToStorage(next);
    });
  }, []);

  const exportTrackerData = useCallback(() => {
    downloadTrackerSnapshot(state);
  }, [state]);

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
    [persist, state],
  );

  const setStatus = useCallback(
    (technicianId: string, date: string, status: DayStatus) => {
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
    [persist, state],
  );

  const setNote = useCallback(
    (technicianId: string, date: string, note: string) => {
      const key = ticketKey(technicianId, date);
      const notes = { ...state.notes };
      const trimmed = note.trim();
      if (!trimmed) delete notes[key];
      else notes[key] = note;
      persist({ ...state, notes });
    },
    [persist, state],
  );

  const addTechnician = useCallback(
    (name: string, role: TechnicianRole = "fieldservice") => {
      const trimmed = name.trim();
      if (!trimmed) return;
      if (state.technicians.some((tech) => tech.name.toLowerCase() === trimmed.toLowerCase())) {
        return;
      }
      persist({
        ...state,
        technicians: [
          ...state.technicians,
          { id: crypto.randomUUID(), name: trimmed, role },
        ],
      });
    },
    [persist, state],
  );

  const renameTechnician = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      if (
        state.technicians.some(
          (tech) => tech.id !== id && tech.name.toLowerCase() === trimmed.toLowerCase(),
        )
      ) {
        return;
      }
      persist({
        ...state,
        technicians: state.technicians.map((tech) =>
          tech.id === id ? { ...tech, name: trimmed } : tech,
        ),
      });
    },
    [persist, state],
  );

  const setTechnicianRole = useCallback(
    (id: string, role: TechnicianRole) => {
      persist({
        ...state,
        technicians: state.technicians.map((tech) =>
          tech.id === id ? { ...tech, role } : tech,
        ),
      });
    },
    [persist, state],
  );

  const removeTechnician = useCallback(
    (id: string) => {
      const tickets = { ...state.tickets };
      const statuses = { ...state.statuses };
      const notes = { ...state.notes };
      const openTickets = { ...state.openTickets };
      const openStatuses = { ...state.openStatuses };
      const openNotes = { ...state.openNotes };
      const tourTickets = { ...state.tourTickets };
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
      persist({
        ...state,
        technicians: state.technicians.filter((tech) => tech.id !== id),
        tickets,
        statuses,
        notes,
        openTickets,
        openStatuses,
        openNotes,
        tourTickets,
      });
    },
    [persist, state],
  );

  const analyzeTicketImport = useCallback(
    (dataset: ImportedDataset) => buildTicketImport(dataset, state.technicians),
    [state.technicians],
  );

  const applyTicketImport = useCallback(
    (result: TicketImportResult) => {
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
    [persist, state],
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
    [persist, state],
  );

  const setOpenStatus = useCallback(
    (technicianId: string, date: string, status: DayStatus) => {
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
    [persist, state],
  );

  const setOpenNote = useCallback(
    (technicianId: string, date: string, note: string) => {
      const key = ticketKey(technicianId, date);
      const openNotes = { ...state.openNotes };
      const trimmed = note.trim();
      if (!trimmed) delete openNotes[key];
      else openNotes[key] = note;
      persist({ ...state, openNotes });
    },
    [persist, state],
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
    [persist, state],
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
      const key = ticketKey(technicianId, date);
      const tourTickets = { ...state.tourTickets };

      if (count === null || !Number.isFinite(count)) {
        delete tourTickets[key];
      } else {
        tourTickets[key] = Math.max(0, Math.round(count));
      }

      persist({ ...state, tourTickets });
    },
    [persist, state],
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
    [persist, state],
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
