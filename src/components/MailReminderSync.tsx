"use client";

import { useEffect, useRef } from "react";

/** Prüft fällige Mails, sobald jemand angemeldet ist – unabhängig von der geöffneten Seite. */
export function MailReminderSync() {
  const running = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (running.current || cancelled) return;
      running.current = true;
      try {
        await fetch("/api/mail/process-reminders", {
          method: "POST",
          credentials: "same-origin",
        });
      } catch {
        /* still, next interval */
      } finally {
        running.current = false;
      }
    }

    void (async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 2500));
      if (!cancelled) void run();
    })();
    const timer = window.setInterval(() => void run(), 15 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
