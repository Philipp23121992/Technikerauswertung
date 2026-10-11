"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { isAdminUser } from "@/lib/releases/types";

type ReleaseFlagsContextValue = {
  ready: boolean;
  enabled: Set<string>;
  refresh: () => Promise<void>;
};

const ReleaseFlagsContext = createContext<ReleaseFlagsContextValue | null>(null);

export function ReleaseFlagsProvider({ children }: { children: React.ReactNode }) {
  const { ready: authReady, user } = useAuth();
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    if (!authReady || !user) {
      setEnabled([]);
      setReady(true);
      return;
    }
    try {
      const res = await fetch("/api/releases", { credentials: "same-origin" });
      const data = (await res.json()) as { enabled?: string[] };
      setEnabled(Array.isArray(data.enabled) ? data.enabled : []);
    } catch {
      setEnabled([]);
    } finally {
      setReady(true);
    }
  }, [authReady, user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      ready: authReady && ready,
      enabled: new Set(enabled),
      refresh,
    }),
    [authReady, enabled, ready, refresh],
  );

  return <ReleaseFlagsContext.Provider value={value}>{children}</ReleaseFlagsContext.Provider>;
}

export function useReleaseFlags() {
  const ctx = useContext(ReleaseFlagsContext);
  if (!ctx) throw new Error("useReleaseFlags must be used within ReleaseFlagsProvider");
  return ctx;
}

/** true = Feature sichtbar. Admins sehen Vorschau-Flags immer. */
export function useReleaseFlag(id: string): boolean {
  const { user } = useAuth();
  const { ready, enabled } = useReleaseFlags();
  if (isAdminUser(user)) return true;
  if (!ready) return false;
  return enabled.has(id);
}
