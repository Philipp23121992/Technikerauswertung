"use client";

import { useEffect, useRef, useState } from "react";

export function TicketNoteField({
  value,
  disabled,
  onSave,
}: {
  value: string;
  disabled?: boolean;
  onSave: (note: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const focusedRef = useRef(false);
  const saveRef = useRef(onSave);
  const valueRef = useRef(value);
  saveRef.current = onSave;
  valueRef.current = value;

  useEffect(() => {
    if (!focusedRef.current) setDraft(value);
  }, [value]);

  useEffect(() => {
    const next = draft.trim();
    if (next === valueRef.current.trim()) return;
    const timer = window.setTimeout(() => {
      if (next === valueRef.current.trim()) return;
      saveRef.current(next);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draft]);

  function commit() {
    const next = draft.trim();
    if (next === valueRef.current.trim()) return;
    saveRef.current(next);
  }

  return (
    <textarea
      className="disp-ticket-note"
      rows={2}
      value={draft}
      disabled={disabled}
      placeholder="Notiz…"
      aria-label="Notiz"
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={() => {
        focusedRef.current = false;
        commit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          (event.currentTarget as HTMLTextAreaElement).blur();
        }
      }}
    />
  );
}
