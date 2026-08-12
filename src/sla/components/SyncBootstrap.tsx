"use client";

import { useEffect, useRef } from "react";
import { fetchState, saveState } from "../lib/api";
import { useAppStore } from "../store/useAppStore";
import type { Customer, ImportBatch, Technician, Ticket } from "../types";

const LOCAL_KEY = "sla-ticket-analyse";
const MIGRATED_KEY = "sla-ticket-analyse-migrated-to-server";

function readLocalBackup(): {
  customers: Customer[];
  technicians: Technician[];
  tickets: Ticket[];
  imports: ImportBatch[];
} | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      state?: {
        customers?: Customer[];
        technicians?: Technician[];
        tickets?: Ticket[];
        imports?: ImportBatch[];
      };
    };
    const state = parsed.state;
    if (!state) return null;
    return {
      customers: state.customers ?? [],
      technicians: state.technicians ?? [],
      tickets: state.tickets ?? [],
      imports: state.imports ?? [],
    };
  } catch {
    return null;
  }
}

export function SyncBootstrap() {
  const hydrateFromServer = useAppStore((state) => state.hydrateFromServer);
  const setSyncMeta = useAppStore((state) => state.setSyncMeta);
  const booted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function bootstrap() {
      if (booted.current) return;
      booted.current = true;
      setSyncMeta({ syncStatus: "connecting", syncError: "" });

      try {
        const result = await fetchState(0);
        if (cancelled) return;

        if (!result.ok) {
          booted.current = false;
          setSyncMeta({
            syncStatus: "offline",
            syncError: result.error || "SLA-API nicht erreichbar (/api/sla/state).",
          });
          return;
        }

        let serverState = result.data;
        const alreadyMigrated = localStorage.getItem(MIGRATED_KEY) === "1";
        const local = readLocalBackup();

        if (
          !alreadyMigrated &&
          local &&
          local.tickets.length > 0 &&
          serverState.tickets.length === 0
        ) {
          const migrated = await saveState({
            customers: local.customers.length
              ? local.customers
              : serverState.customers,
            technicians: local.technicians.length
              ? local.technicians
              : serverState.technicians,
            tickets: local.tickets,
            imports: local.imports,
            timeTickets: serverState.timeTickets ?? [],
            timeImports: serverState.timeImports ?? [],
          });
          if (migrated.ok) {
            serverState = migrated.data;
            localStorage.setItem(MIGRATED_KEY, "1");
          }
        } else if (local?.tickets.length) {
          localStorage.setItem(MIGRATED_KEY, "1");
        }

        if (cancelled) return;
        hydrateFromServer(serverState);
      } catch (error) {
        booted.current = false;
        if (cancelled) return;
        setSyncMeta({
          syncStatus: "error",
          syncError: error instanceof Error ? error.message : "Sync-Fehler",
        });
      }
    }

    async function poll() {
      const currentRevision = useAppStore.getState().revision;
      const status = useAppStore.getState().syncStatus;
      if (status === "saving" || status === "connecting") return;

      const result = await fetchState(currentRevision);
      if (cancelled) return;

      if (result.ok) {
        hydrateFromServer(result.data);
        return;
      }

      if (result.status === 304) {
        if (useAppStore.getState().syncStatus !== "online") {
          setSyncMeta({ syncStatus: "online", syncError: "" });
        }
        return;
      }

      setSyncMeta({
        syncStatus: "offline",
        syncError: "Verbindung zum Sync-Server verloren.",
      });
    }

    void bootstrap().then(() => {
      if (cancelled) return;
      timer = window.setInterval(() => {
        void poll();
      }, 3000);
    });

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [hydrateFromServer, setSyncMeta]);

  return null;
}
