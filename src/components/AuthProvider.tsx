"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { AppId, PublicUser } from "@/lib/auth/types";
import { firstAllowedAppHref, userHasApp } from "@/lib/auth/types";

type AuthContextValue = {
  ready: boolean;
  user: PublicUser | null;
  login: (
    username: string,
    password: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  hasApp: (app: AppId) => boolean;
  canEdit: boolean;
  homeHref: string;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<PublicUser | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", { credentials: "same-origin" });
      const data = (await res.json()) as { user?: PublicUser | null };
      setUser(data.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    try {
      const res = await fetch("/api/auth/session", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", username, password }),
      });
      const data = (await res.json()) as { user?: PublicUser; error?: string };
      if (!res.ok || !data.user) {
        return { ok: false as const, error: data.error ?? "Anmeldung fehlgeschlagen." };
      }
      setUser(data.user);
      return { ok: true as const };
    } catch {
      return { ok: false as const, error: "Anmeldung fehlgeschlagen." };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/session", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
    } catch {
      /* ignore */
    }
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      user,
      login,
      logout,
      refresh,
      hasApp: (app) => (user ? userHasApp(user, app) : false),
      canEdit: Boolean(user?.canEdit),
      homeHref: user ? firstAllowedAppHref(user.apps) : "/finder",
    }),
    [ready, user, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
