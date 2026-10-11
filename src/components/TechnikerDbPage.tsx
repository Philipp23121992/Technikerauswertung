"use client";

import { FormEvent, useState } from "react";
import { ROLE_OPTIONS, type Technician, type TechnicianRole } from "@/lib/tracker-types";
import { useEditAccess } from "./EditAccessProvider";
import { useTracker } from "./TrackerProvider";

type AddrDraft = {
  street: string;
  plz: string;
  city: string;
  endStreet: string;
  endPlz: string;
  endCity: string;
};

function addrFrom(tech: Technician): AddrDraft {
  return {
    street: tech.street ?? "",
    plz: tech.plz ?? "",
    city: tech.city ?? "",
    endStreet: tech.endStreet ?? "",
    endPlz: tech.endPlz ?? "",
    endCity: tech.endCity ?? "",
  };
}

async function syncDispositionHome(tech: Technician, addr: AddrDraft, name: string) {
  if (!addr.plz && !addr.street) return;
  await fetch("/api/disposition", {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      home: {
        technicianId: tech.id,
        technicianName: name,
        street: addr.street,
        plz: addr.plz,
        city: addr.city,
        endStreet: addr.endStreet,
        endPlz: addr.endPlz,
        endCity: addr.endCity,
      },
    }),
  });
}

export function TechnikerDbPage() {
  const {
    ready,
    technicians,
    addTechnician,
    updateTechnician,
    removeTechnician,
    exportTrackerData,
    restoreTrackerFromSnapshot,
  } = useTracker();
  const { canEdit } = useEditAccess();
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<TechnicianRole>("fieldservice");
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [roleDrafts, setRoleDrafts] = useState<Record<string, TechnicianRole>>({});
  const [addrDrafts, setAddrDrafts] = useState<Record<string, AddrDraft>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  function patchAddr(id: string, tech: Technician, patch: Partial<AddrDraft>) {
    setAddrDrafts((current) => ({
      ...current,
      [id]: { ...addrFrom(tech), ...current[id], ...patch },
    }));
  }

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
          <p>
            Techniker, Rollen und Standortadressen für die Technikerauswertung (Start- und Endpunkt
            der Dispositionstour)
          </p>
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
          <table className="tracker-table tech-db-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Rolle</th>
                <th>Start / Standort</th>
                <th>Endpunkt</th>
                <th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {technicians.map((tech, index) => {
                const nameDraft = nameDrafts[tech.id] ?? tech.name;
                const roleDraft = roleDrafts[tech.id] ?? tech.role;
                const addr = addrDrafts[tech.id] ?? addrFrom(tech);
                return (
                  <tr key={tech.id}>
                    <td>{index + 1}</td>
                    <td>
                      <input
                        className="add-tech-input"
                        value={nameDraft}
                        disabled={!canEdit}
                        onChange={(event) =>
                          setNameDrafts((current) => ({
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
                        value={roleDraft}
                        disabled={!canEdit}
                        onChange={(event) =>
                          setRoleDrafts((current) => ({
                            ...current,
                            [tech.id]: event.target.value as TechnicianRole,
                          }))
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
                      <div className="tech-addr-cell">
                        <input
                          className="add-tech-input"
                          value={addr.street}
                          disabled={!canEdit}
                          placeholder="Straße"
                          aria-label={`Startstraße ${tech.name}`}
                          onChange={(event) => patchAddr(tech.id, tech, { street: event.target.value })}
                        />
                        <div className="tech-addr-city">
                          <input
                            className="add-tech-input"
                            value={addr.plz}
                            disabled={!canEdit}
                            placeholder="PLZ"
                            inputMode="numeric"
                            aria-label={`Start-PLZ ${tech.name}`}
                            onChange={(event) =>
                              patchAddr(tech.id, tech, {
                                plz: event.target.value.replace(/\D/g, "").slice(0, 5),
                              })
                            }
                          />
                          <input
                            className="add-tech-input"
                            value={addr.city}
                            disabled={!canEdit}
                            placeholder="Ort"
                            aria-label={`Startort ${tech.name}`}
                            onChange={(event) => patchAddr(tech.id, tech, { city: event.target.value })}
                          />
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="tech-addr-cell">
                        <input
                          className="add-tech-input"
                          value={addr.endStreet}
                          disabled={!canEdit}
                          placeholder="wie Standort"
                          aria-label={`Endstraße ${tech.name}`}
                          onChange={(event) =>
                            patchAddr(tech.id, tech, { endStreet: event.target.value })
                          }
                        />
                        <div className="tech-addr-city">
                          <input
                            className="add-tech-input"
                            value={addr.endPlz}
                            disabled={!canEdit}
                            placeholder="PLZ"
                            inputMode="numeric"
                            aria-label={`End-PLZ ${tech.name}`}
                            onChange={(event) =>
                              patchAddr(tech.id, tech, {
                                endPlz: event.target.value.replace(/\D/g, "").slice(0, 5),
                              })
                            }
                          />
                          <input
                            className="add-tech-input"
                            value={addr.endCity}
                            disabled={!canEdit}
                            placeholder="Ort"
                            aria-label={`Endort ${tech.name}`}
                            onChange={(event) =>
                              patchAddr(tech.id, tech, { endCity: event.target.value })
                            }
                          />
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="toolbar-actions-row">
                        <button
                          type="button"
                          className="btn btn-date"
                          disabled={!canEdit}
                          onClick={() => {
                            updateTechnician(tech.id, {
                              name: nameDraft,
                              role: roleDraft,
                              street: addr.street,
                              plz: addr.plz,
                              city: addr.city,
                              endStreet: addr.endStreet,
                              endPlz: addr.endPlz,
                              endCity: addr.endCity,
                            });
                            void syncDispositionHome(tech, addr, nameDraft.trim() || tech.name);
                            setNameDrafts((current) => {
                              const next = { ...current };
                              delete next[tech.id];
                              return next;
                            });
                            setRoleDrafts((current) => {
                              const next = { ...current };
                              delete next[tech.id];
                              return next;
                            });
                            setAddrDrafts((current) => {
                              const next = { ...current };
                              delete next[tech.id];
                              return next;
                            });
                            setMessage(`„${nameDraft.trim()}“ gespeichert.`);
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
