"use client";

import { useId, useState } from "react";

type InvoiceImportDropzoneProps = {
  busy: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  kicker?: string;
  title?: string;
  description?: string;
};

function collectFiles(list: FileList | File[] | null | undefined): File[] {
  if (!list) return [];
  return [...list].filter((file) => file.size > 0);
}

export function InvoiceImportDropzone({
  busy,
  disabled,
  onFiles,
  kicker = "Import",
  title = "Rechnung hierher ziehen",
  description = "PDF oder Bild ablegen. Mehrere Dateien nacheinander möglich.",
}: InvoiceImportDropzoneProps) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const locked = busy || disabled;

  function handleFiles(list: FileList | File[] | null | undefined) {
    const files = collectFiles(list);
    if (!files.length || locked) return;
    onFiles(files);
  }

  return (
    <div
      className={`hp-dropzone ${dragging ? "is-dragging" : ""} ${busy ? "is-busy" : ""} ${
        disabled ? "is-disabled" : ""
      }`}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!locked) setDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!locked) setDragging(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        handleFiles(event.dataTransfer.files);
      }}
    >
      <div>
        <p className="hp-dropzone-kicker">{kicker}</p>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <label className="btn btn-secondary" htmlFor={inputId}>
        {busy ? "Importiere…" : "Datei auswählen"}
      </label>
      <input
        id={inputId}
        type="file"
        accept="application/pdf,.pdf,.png,.jpg,.jpeg"
        multiple
        hidden
        disabled={locked}
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
