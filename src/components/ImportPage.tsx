"use client";

import Link from "next/link";
import { useState } from "react";
import { parseCsvFile, parseCsvText, SAMPLE_CSV } from "@/lib/csv";
import type { TicketImportResult } from "@/lib/ticket-import";
import { CsvDropzone } from "./CsvDropzone";
import { ImportAnalysisReport } from "./ImportAnalysisReport";
import { useDataset } from "./DatasetProvider";
import { useTracker } from "./TrackerProvider";

export function ImportPage() {
  const { dataset, setDataset, clearDataset } = useDataset();
  const { analyzeTicketImport, applyTicketImport } = useTracker();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    fileName: string;
    analysis: TicketImportResult;
  } | null>(null);

  async function prepareImport(imported: Awaited<ReturnType<typeof parseCsvFile>>) {
    setDataset(imported);
    const analysis = analyzeTicketImport(imported);
    setPending({ fileName: imported.fileName, analysis });
    setSuccess(null);
  }

  async function loadFiles(files: FileList | File[]) {
    const list = Array.from(files).filter(
      (file) =>
        /\.csv$/i.test(file.name) || file.type.includes("csv") || file.type === "text/plain",
    );

    if (list.length === 0) {
      setError("Bitte eine CSV-Datei auswählen.");
      setSuccess(null);
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const imported = await parseCsvFile(list[0]);
      await prepareImport(imported);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import fehlgeschlagen.");
      setPending(null);
    } finally {
      setBusy(false);
    }
  }

  function loadSample() {
    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const imported = parseCsvText(SAMPLE_CSV, "beispiel-techniker.csv");
      void prepareImport(imported);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Beispieldaten konnten nicht geladen werden.");
      setPending(null);
    } finally {
      setBusy(false);
    }
  }

  function confirmImport() {
    if (!pending) return;
    applyTicketImport(pending.analysis);
    setSuccess(
      `${pending.analysis.totalRows} Zeilen aus „${pending.fileName}“: ${pending.analysis.matchedRows} Techniker zugeordnet, ${pending.analysis.partnerRows} als Partner / LKS Partner` +
        (pending.analysis.skippedRows ? `, ${pending.analysis.skippedRows} übersprungen` : "") +
        ".",
    );
    setPending(null);
  }

  return (
    <div className="page">
      <header className="page-header">
        <p className="page-kicker">Import</p>
        <h1>Gefahrene Tickets importieren</h1>
        <p className="page-copy">
          CSV wird analysiert bevor etwas übernommen wird. Datum kommt aus „Gelöst am“, nicht
          zuordenbare Tickets landen unter „Partner / LKS Partner“.
        </p>
      </header>

      <CsvDropzone busy={busy} onFiles={loadFiles} onSample={loadSample} />

      {error ? (
        <div className="error-banner" role="alert">
          {error}
        </div>
      ) : null}

      {pending ? (
        <ImportAnalysisReport
          fileName={pending.fileName}
          analysis={pending.analysis}
          onConfirm={confirmImport}
          onCancel={() => setPending(null)}
        />
      ) : null}

      {success ? (
        <div className="success-banner" role="status">
          <p>{success}</p>
          <Link href="/gefahren" className="btn btn-primary">
            Zur Monatsübersicht
          </Link>
        </div>
      ) : null}

      {dataset && !pending ? (
        <section className="info-panel">
          <div>
            <h2>Aktueller Datensatz</h2>
            <p>
              {dataset.fileName} · {dataset.rows.length} Zeilen · {dataset.headers.length} Spalten
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost danger"
            onClick={() => {
              clearDataset();
              setSuccess(null);
              setError(null);
              setPending(null);
            }}
          >
            CSV-Vorschau leeren
          </button>
        </section>
      ) : (
        !pending ? (
          <section className="features" aria-label="Hinweise">
            <article>
              <h2>Spalten</h2>
              <p>Erwartet werden Bearbeiter und „Gelöst am“.</p>
            </article>
            <article>
              <h2>Zuordnung</h2>
              <p>Namen werden mit der Techniker-DB abgeglichen (auch „Nachname, Vorname“).</p>
            </article>
            <article>
              <h2>Partner</h2>
              <p>Ohne Match → Partner / LKS Partner.</p>
            </article>
          </section>
        ) : null
      )}
    </div>
  );
}
