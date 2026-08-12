"use client";

import { FormEvent, useState } from "react";
import { ROLE_OPTIONS, type TechnicianRole } from "@/lib/tracker-types";
import { useEditAccess } from "./EditAccessProvider";
import { useTracker } from "./TrackerProvider";

export function TechnikerDbPage() {
  const {
    ready,
    technicians,
    addTechnician,
    renameTechnician,
    setTechnicianRole,
    removeTechnician,
    exportTrackerData,
    restoreTrackerFromSnapshot,
  } = useTracker();
  const { canEdit } = useEditAccess();
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<TechnicianRole>("fieldservice");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;
    const trimmed = newName.trim();
    if (!trimmed) {
      setMessage("Bitte einen Namen eingeben.");
      return;
    }
    addTechnician(trimmed, newRole);
    setNewName("");
    setNewRole("fieldservice");
    setMessage(`„${trimmed}“ wurde hinzugefügt.`);
  }

  if (!ready) {
    return (
      <div className="page-panel">
        <div className="tracker-loading">Lade Techniker-DB…</div>
      </div>
    );
  }

  return (
    <div className="page-panel">
      <header className="section-header">
        <div>
          <h1>Techniker DB</h1>
          <p>Techniker und Rollen für die Technikerauswertung (unabhängig von Meetings)</p>
        </div>
        <div className="toolbar-actions-row">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={restoring}
            onClick={async () => {
              setRestoring(true);
              try {
                const ok = await restoreTrackerFromSnapshot();
                setMessage(
                  ok
                    ? "Auswertung aus Snapshot wiederhergestellt."
                    : "Wiederherstellung fehlgeschlagen – Snapshot nicht gefunden.",
                );
              } finally {
                setRestoring(false);
              }
            }}
          >
            {restoring ? "Stelle wieder her…" : "Aus Snapshot wiederherstellen"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              exportTrackerData();
              setMessage(
                "Datenexport gestartet – Datei als public/data/tracker-snapshot.json ablegen für GitHub.",
              );
            }}
          >
            Daten exportieren
          </button>
        </div>
      </header>

      <section className="content-card">
        <div className="content-card-head">
          <div>
            <h2>Technikerliste</h2>
            <p>{technicians.length} Techniker in der Datenbank</p>
          </div>
        </div>

        <form className="add-tech-row tech-db-add" onSubmit={handleAdd}>
          <input
            className="add-tech-input"
            value={newName}
            disabled={!canEdit}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Neuer Techniker"
          />
          <select
            className="status-select"
            value={newRole}
            disabled={!canEdit}
            onChange={(event) => setNewRole(event.target.value as TechnicianRole)}
            aria-label="Rolle für neuen Techniker"
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-primary" disabled={!canEdit}>
            Hinzufügen
          </button>
        </form>

        {message ? (
          <div className="success-banner" role="status">
            <p>{message}</p>
          </div>
        ) : null}

        <div className="tracker-table-wrap" style={{ marginTop: "1rem" }}>
          <table className="tracker-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Rolle</th>
                <th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {technicians.map((tech, index) => {
                const draft = drafts[tech.id] ?? tech.name;
                return (
                  <tr key={tech.id}>
                    <td>{index + 1}</td>
                    <td>
                      <input
                        className="add-tech-input"
                        value={draft}
                        disabled={!canEdit}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [tech.id]: event.target.value,
                          }))
                        }
                        aria-label={`Name ${tech.name}`}
                      />
                    </td>
                    <td>
                      <select
                        className="status-select"
                        value={tech.role}
                        disabled={!canEdit}
                        onChange={(event) =>
                          setTechnicianRole(tech.id, event.target.value as TechnicianRole)
                        }
                        aria-label={`Rolle ${tech.name}`}
                      >
                        {ROLE_OPTIONS.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div className="toolbar-actions-row">
                        <button
                          type="button"
                          className="btn btn-date"
                          disabled={!canEdit}
                          onClick={() => {
                            renameTechnician(tech.id, draft);
                            setDrafts((current) => {
                              const next = { ...current };
                              delete next[tech.id];
                              return next;
                            });
                            setMessage(`„${draft.trim()}“ gespeichert.`);
                          }}
                        >
                          Speichern
                        </button>
                        <button
                          type="button"
                          className="btn btn-link-danger"
                          disabled={!canEdit}
                          onClick={() => {
                            removeTechnician(tech.id);
                            setMessage(`„${tech.name}“ entfernt.`);
                          }}
                        >
                          Entfernen
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
