"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "./AuthProvider";
import { EDIT_ACCESS_STORAGE_KEY } from "@/lib/edit-access-shared";

type EditAccessContextValue = {
  ready: boolean;
  canEdit: boolean;
  unlock: (password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  lock: () => Promise<void>;
};

const EditAccessContext = createContext<EditAccessContextValue | null>(null);

/**
 * Schreibrechte kommen primär vom angemeldeten Benutzer (canEdit).
 * Legacy-Passwort bleibt als Zusatz-Freischaltung nutzbar.
 */
export function EditAccessProvider({ children }: { children: React.ReactNode }) {
  const { ready: authReady, canEdit: userCanEdit } = useAuth();
  const [ready, setReady] = useState(false);
  const [passwordUnlocked, setPasswordUnlocked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const cached =
        typeof window !== "undefined" &&
        window.localStorage.getItem(EDIT_ACCESS_STORAGE_KEY) === "1";
      if (cached) setPasswordUnlocked(true);

      try {
        const res = await fetch("/api/auth/edit", { credentials: "same-origin" });
        const data = (await res.json()) as { unlocked?: boolean };
        if (cancelled) return;
        const unlocked = Boolean(data.unlocked);
        setPasswordUnlocked(unlocked);
        window.localStorage.setItem(
          EDIT_ACCESS_STORAGE_KEY,
          unlocked ? "1" : "0",
        );
      } catch {
        if (!cancelled && cached) setPasswordUnlocked(true);
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  const unlock = useCallback(async (password: string) => {
    try {
      const res = await fetch("/api/auth/edit", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, action: "unlock" }),
      });
      const data = (await res.json()) as { unlocked?: boolean; error?: string };
      if (!res.ok || !data.unlocked) {
        return { ok: false as const, error: data.error ?? "Anmeldung fehlgeschlagen." };
      }
      window.localStorage.setItem(EDIT_ACCESS_STORAGE_KEY, "1");
      setPasswordUnlocked(true);
      return { ok: true as const };
    } catch {
      return { ok: false as const, error: "Anmeldung fehlgeschlagen." };
    }
  }, []);

  const lock = useCallback(async () => {
    try {
      await fetch("/api/auth/edit", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "lock" }),
      });
    } catch {
      /* ignore */
    }
    window.localStorage.setItem(EDIT_ACCESS_STORAGE_KEY, "0");
    setPasswordUnlocked(false);
  }, []);

  const canEdit = userCanEdit || passwordUnlocked;

  const value = useMemo(
    () => ({
      ready: ready && authReady,
      canEdit,
      unlock,
      lock,
    }),
    [ready, authReady, canEdit, unlock, lock],
  );

  return (
    <EditAccessContext.Provider value={value}>{children}</EditAccessContext.Provider>
  );
}

export function useEditAccess() {
  const ctx = useContext(EditAccessContext);
  if (!ctx) {
    throw new Error("useEditAccess must be used within EditAccessProvider");
  }
  return ctx;
}
