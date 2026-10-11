"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/components/AuthProvider";

export function MailverwaltungSync() {
  const { hasApp } = useAuth();
  const running = useRef(false);

  useEffect(() => {
    if (!hasApp("mailverwaltung")) return;
    let cancelled = false;

    async function run() {
      if (running.current || cancelled) return;
      running.current = true;
      try {
        await fetch("/api/mailverwaltung/sync", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
      } catch {
        /* next interval */
      } finally {
        running.current = false;
      }
    }

    const start = window.setTimeout(() => void run(), 4000);
    const timer = window.setInterval(() => void run(), 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearTimeout(start);
      window.clearInterval(timer);
    };
  }, [hasApp]);

  return null;
}
