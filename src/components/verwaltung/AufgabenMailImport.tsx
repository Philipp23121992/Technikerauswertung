"use client";

import { useId, useRef, useState } from "react";
import { Mail } from "lucide-react";

type AufgabenMailImportProps = {
  canEdit: boolean;
  busy: boolean;
  onPick: (files: File[]) => void;
};

export function AufgabenMailImport({ canEdit, busy, onPick }: AufgabenMailImportProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [picking, setPicking] = useState(false);

  function handleFiles(list: FileList | null) {
    if (!canEdit || !list?.length) return;
    setPicking(true);
    onPick([...list]);
    setPicking(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <>
      <label
        className={`csv-import-icon-btn ${busy || picking ? "is-busy" : ""}`}
        htmlFor={inputId}
        title={busy ? "Mail wird gelesen…" : "E-Mail als Aufgabe importieren (.eml / .msg)"}
      >
        <Mail size={18} aria-hidden />
        <span className="sr-only">E-Mail importieren</span>
      </label>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept=".eml,.msg,.oft,message/rfc822,application/vnd.ms-outlook"
        className="sr-only"
        multiple
        disabled={!canEdit || busy}
        onChange={(event) => handleFiles(event.target.files)}
      />
    </>
  );
}
