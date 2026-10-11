"use client";

import { useState } from "react";
import { createAssignee, type QuoteAssignee } from "@/lib/kostenvoranschlaege/assignees";

type KostenvoranschlaegeAssigneesPanelProps = {
  assignees: QuoteAssignee[];
  canEdit: boolean;
  saving: boolean;
  onSave: (next: QuoteAssignee[]) => Promise<boolean>;
};

export function KostenvoranschlaegeAssigneesPanel({
  assignees,
  canEdit,
  saving,
  onSave,
}: KostenvoranschlaegeAssigneesPanelProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  async function addPerson() {
    if (!canEdit) return;
    const person = createAssignee({ name, email });
    if (!person.name) return;
    if (person.email && !person.email.includes("@")) return;
    const ok = await onSave([...assignees, person]);
    if (ok) {
      setName("");
      setEmail("");
    }
  }

  async function updatePerson(id: string, patch: Partial<QuoteAssignee>) {
    if (!canEdit) return;
    await onSave(
      assignees.map((item) =>
        item.id === id
          ? { ...item, ...patch, updatedAt: new Date().toISOString() }
          : item,
      ),
    );
  }

  async function removePerson(person: QuoteAssignee) {
    if (!canEdit) return;
    if (!window.confirm(`Zuständigen „${person.name}“ entfernen?`)) return;
    await onSave(assignees.filter((item) => item.id !== person.id));
  }

  return (
    <div className="content-card hp-table-wrap">
      <p className="muted-meta" style={{ margin: "0 0 1rem" }}>
        Zuständige mit Name und E-Mail anlegen. Am Gültigkeitsdatum eines
        Kostenvoranschlags erhält die ausgewählte Person eine Mail.
      </p>
      <div className="hp-toolbar" style={{ marginBottom: "1rem" }}>
        <label>
          <span>Name</span>
          <input
            value={name}
            disabled={!canEdit || saving}
            onChange={(event) => setName(event.target.value)}
            placeholder="z. B. Philipp Heyser"
          />
        </label>
        <label>
          <span>E-Mail</span>
          <input
            type="email"
            value={email}
            disabled={!canEdit || saving}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@firma.de"
          />
        </label>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canEdit || saving || !name.trim()}
          onClick={() => void addPerson()}
        >
          + Zuständigen anlegen
        </button>
      </div>
      <table className="hp-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>E-Mail</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {assignees.length === 0 ? (
            <tr>
              <td colSpan={3}>Noch keine Zuständigen angelegt.</td>
            </tr>
          ) : (
            assignees.map((person) => (
              <tr key={person.id}>
                <td>
                  <input
                    defaultValue={person.name}
                    disabled={!canEdit || saving}
                    onBlur={(event) => {
                      const nextName = event.target.value.trim();
                      if (nextName && nextName !== person.name) {
                        void updatePerson(person.id, { name: nextName });
                      }
                    }}
                  />
                </td>
                <td>
                  <input
                    type="email"
                    defaultValue={person.email}
                    disabled={!canEdit || saving}
                    onBlur={(event) => {
                      const nextEmail = event.target.value.trim();
                      if (nextEmail !== person.email) {
                        void updatePerson(person.id, { email: nextEmail });
                      }
                    }}
                  />
                </td>
                <td>
                  {canEdit ? (
                    <button
                      type="button"
                      className="btn btn-link-danger"
                      disabled={saving}
                      onClick={() => void removePerson(person)}
                    >
                      Entfernen
                    </button>
                  ) : null}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
