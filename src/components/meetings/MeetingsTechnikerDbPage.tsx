"use client";

import { FormEvent, useEffect, useState } from "react";
import { useEditAccess } from "@/components/EditAccessProvider";
import {
  createMeetingTechId,
  loadMeetingTechnicians,
  saveMeetingTechnicians,
  type MeetingTechnician,
} from "@/lib/meetings/technicians";

export function MeetingsTechnikerDbPage() {
  const { canEdit } = useEditAccess();
  const [ready, setReady] = useState(false);
  const [technicians, setTechnicians] = useState<MeetingTechnician[]>([]);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [emailDrafts, setEmailDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const loaded = loadMeetingTechnicians();
    setTechnicians(loaded.technicians);
    setReady(true);
  }, []);

  function persist(next: MeetingTechnician[]) {
    setTechnicians(next);
    saveMeetingTechnicians({ version: 1, technicians: next });
  }

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;
    const trimmed = newName.trim();
    if (!trimmed) {
      setMessage("Bitte einen Namen eingeben.");
      return;
    }
    if (technicians.some((tech) => tech.name.toLowerCase() === trimmed.toLowerCase())) {
      setMessage("Dieser Name existiert bereits in der Meeting-Techniker-DB.");
      return;
    }
    persist([
      ...technicians,
      {
        id: createMeetingTechId(),
        name: trimmed,
        email: newEmail.trim(),
      },
    ]);
    setNewName("");
    setNewEmail("");
    setMessage(`„${trimmed}“ wurde zur Meeting-Techniker-DB hinzugefügt.`);
  }

  if (!ready) {
    return (
      <div className="page-panel">
        <div className="tracker-loading">Lade Meeting-Techniker-DB…</div>
      </div>
    );
  }

  return (
    <div className="page-panel">
      <header className="section-header">
        <div>
          <h1>Techniker DB</h1>
          <p>
            Eigenständige Liste für Meetings und Erinnerungen – unabhängig von der
            Technikerauswertung
          </p>
        </div>
      </header>

      <section className="content-card">
        <div className="content-card-head">
          <div>
            <h2>Meeting-Techniker</h2>
            <p>{technicians.length} Einträge</p>
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
          <input
            className="add-tech-input"
            type="email"
            value={newEmail}
            disabled={!canEdit}
            onChange={(event) => setNewEmail(event.target.value)}
            placeholder="E-Mail (für Erinnerungen)"
          />
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
                <th>E-Mail</th>
                <th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {technicians.map((tech, index) => {
                const draft = drafts[tech.id] ?? tech.name;
                const emailDraft = emailDrafts[tech.id] ?? tech.email;
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
                      <input
                        className="add-tech-input"
                        type="email"
                        value={emailDraft}
                        disabled={!canEdit}
                        onChange={(event) =>
                          setEmailDrafts((current) => ({
                            ...current,
                            [tech.id]: event.target.value,
                          }))
                        }
                        aria-label={`E-Mail ${tech.name}`}
                        placeholder="name@firma.de"
                      />
                    </td>
                    <td>
                      <div className="toolbar-actions-row">
                        <button
                          type="button"
                          className="btn btn-date"
                          disabled={!canEdit}
                          onClick={() => {
                            const name = draft.trim();
                            if (!name) return;
                            persist(
                              technicians.map((item) =>
                                item.id === tech.id
                                  ? { ...item, name, email: emailDraft.trim() }
                                  : item,
                              ),
                            );
                            setDrafts((current) => {
                              const next = { ...current };
                              delete next[tech.id];
                              return next;
                            });
                            setEmailDrafts((current) => {
                              const next = { ...current };
                              delete next[tech.id];
                              return next;
                            });
                            setMessage(`„${name}“ gespeichert.`);
                          }}
                        >
                          Speichern
                        </button>
                        <button
                          type="button"
                          className="btn btn-link-danger"
                          disabled={!canEdit}
                          onClick={() => {
                            persist(technicians.filter((item) => item.id !== tech.id));
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
