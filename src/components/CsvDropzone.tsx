"use client";

import { useId, useRef, useState } from "react";

type CsvDropzoneProps = {
  busy: boolean;
  onFiles: (files: FileList | File[]) => void;
  onSample: () => void;
};

export function CsvDropzone({ busy, onFiles, onSample }: CsvDropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <section className="dropzone-shell" aria-label="CSV Import">
      <div
        className={`dropzone ${dragging ? "is-dragging" : ""} ${busy ? "is-busy" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (event.currentTarget.contains(event.relatedTarget as Node)) return;
          setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (event.dataTransfer.files?.length) {
            onFiles(event.dataTransfer.files);
          }
        }}
      >
        <div className="dropzone-glow" aria-hidden />
        <p className="dropzone-kicker">Import</p>
        <h2 className="dropzone-title">CSV-Datei hier ablegen</h2>
        <p className="dropzone-copy">
          Unterstützt Komma, Semikolon und Tab. Ideal für Techniker-, Auftrags- und
          Zeiterfassungsdaten.
        </p>

        <div className="dropzone-actions">
          <label className="btn btn-primary" htmlFor={inputId}>
            {busy ? "Wird gelesen…" : "Datei auswählen"}
          </label>
          <button type="button" className="btn btn-ghost" onClick={onSample} disabled={busy}>
            Beispieldaten laden
          </button>
        </div>

        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          multiple
          className="sr-only"
          disabled={busy}
          onChange={(event) => {
            if (event.target.files?.length) {
              onFiles(event.target.files);
              event.target.value = "";
            }
          }}
        />
      </div>
    </section>
  );
}
