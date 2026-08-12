"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useEditAccess } from "@/components/EditAccessProvider";
import { loadMeetingStore, saveMeetingStore } from "@/lib/meetings/storage";
import {
  loadMeetingTechnicians,
  type MeetingTechnician,
} from "@/lib/meetings/technicians";
import {
  PROTOCOL_STATUS_OPTIONS,
  createEmptyProtocol,
  createId,
  formatMeetingDate,
  formatMeetingDateTime,
  isAgendaDue,
  meetingKindLabel,
  statusLabel,
  todayIso,
  type AgendaItem,
  type MeetingKind,
  type MeetingProtocol,
  type MeetingStoreState,
  type ProtocolItem,
  type ProtocolStatus,
} from "@/lib/meetings/types";

type MeetingWorkspaceProps = {
  kind: MeetingKind;
};

function updateProtocol(
  protocols: MeetingProtocol[],
  id: string,
  patch: Partial<MeetingProtocol>,
): MeetingProtocol[] {
  return protocols.map((protocol) =>
    protocol.id === id
      ? { ...protocol, ...patch, updatedAt: new Date().toISOString() }
      : protocol,
  );
}

export function MeetingWorkspace({ kind }: MeetingWorkspaceProps) {
  const { canEdit } = useEditAccess();
  const [technicians, setTechnicians] = useState<MeetingTechnician[]>([]);
  const [ready, setReady] = useState(false);
  const [store, setStore] = useState<MeetingStoreState>(() => ({
    version: 1,
    kind,
    protocols: [],
    selectedId: null,
  }));
  const [query, setQuery] = useState("");
  const [participantDraft, setParticipantDraft] = useState("");
  const [agendaDraft, setAgendaDraft] = useState("");
  const [agendaAssigneeId, setAgendaAssigneeId] = useState("");
  const [agendaDueDate, setAgendaDueDate] = useState("");
  const [decisionDraft, setDecisionDraft] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [reminderNote, setReminderNote] = useState("");
  const reminderBusy = useRef(false);
  const storeRef = useRef(store);
  storeRef.current = store;

  useEffect(() => {
    const loaded = loadMeetingStore(kind);
    setStore(loaded);
    setTechnicians(loadMeetingTechnicians().technicians);
    setReady(true);
  }, [kind]);

  useEffect(() => {
    if (!ready) return;
    saveMeetingStore(store);
  }, [ready, store]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    async function processReminders() {
      if (reminderBusy.current || cancelled) return;
      reminderBusy.current = true;
      try {
        const current = storeRef.current;
        const today = todayIso();
        let nextProtocols = current.protocols;
        let changed = false;
        let sent = 0;
        let skipped = 0;

        for (const protocol of current.protocols) {
          let agenda = protocol.agenda;
          let agendaChanged = false;

          for (const item of protocol.agenda) {
            if (!isAgendaDue(item, today) || item.reminderSentAt) continue;
            if (!item.assigneeEmail) {
              skipped += 1;
              continue;
            }

            const res = await fetch("/api/meetings/remind", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                to: item.assigneeEmail,
                assigneeName: item.assigneeName,
                agendaText: item.text,
                dueDate: item.dueDate,
                protocolTitle: protocol.title,
                meetingKindLabel: meetingKindLabel(kind),
              }),
            });

            if (!res.ok) {
              const data = (await res.json().catch(() => null)) as {
                error?: string;
              } | null;
              if (!cancelled) {
                setReminderNote(
                  data?.error ||
                    "Erinnerungs-Mail fehlgeschlagen (SMTP prüfen).",
                );
              }
              continue;
            }

            agenda = agenda.map((entry) =>
              entry.id === item.id
                ? { ...entry, reminderSentAt: new Date().toISOString() }
                : entry,
            );
            agendaChanged = true;
            sent += 1;
          }

          if (agendaChanged) {
            changed = true;
            nextProtocols = updateProtocol(nextProtocols, protocol.id, {
              agenda,
            });
          }
        }

        if (changed && !cancelled) {
          setStore({ ...current, protocols: nextProtocols });
          if (sent) {
            setReminderNote(
              `${sent} Erinnerungs-Mail${sent === 1 ? "" : "s"} gesendet.`,
            );
          }
        } else if (skipped && !sent && !cancelled) {
          setReminderNote(
            `${skipped} fällige Agenda-Punkte ohne E-Mail in der Techniker-DB.`,
          );
        }
      } finally {
        reminderBusy.current = false;
      }
    }

    void processReminders();
    const timer = window.setInterval(() => void processReminders(), 15 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [ready, kind]);

  const selected = useMemo(
    () => store.protocols.find((item) => item.id === store.selectedId) ?? null,
    [store.protocols, store.selectedId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...store.protocols].sort((a, b) => {
      const byDate = b.meetingDate.localeCompare(a.meetingDate);
      if (byDate !== 0) return byDate;
      return b.meetingTime.localeCompare(a.meetingTime);
    });
    if (!q) return list;
    return list.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        formatMeetingDate(item.meetingDate).includes(q) ||
        statusLabel(item.status).toLowerCase().includes(q),
    );
  }, [store.protocols, query]);

  function persist(next: MeetingStoreState) {
    setStore(next);
  }

  function createProtocol() {
    if (!canEdit) return;
    const protocol = createEmptyProtocol(kind);
    persist({
      ...store,
      protocols: [protocol, ...store.protocols],
      selectedId: protocol.id,
    });
    setParticipantDraft("");
    setAgendaDraft("");
    setAgendaAssigneeId("");
    setAgendaDueDate("");
    setDecisionDraft("");
  }

  function selectProtocol(id: string) {
    persist({ ...store, selectedId: id });
    setParticipantDraft("");
    setAgendaDraft("");
    setAgendaAssigneeId("");
    setAgendaDueDate("");
    setDecisionDraft("");
  }

  function patchSelected(patch: Partial<MeetingProtocol>) {
    if (!canEdit || !selected) return;
    persist({
      ...store,
      protocols: updateProtocol(store.protocols, selected.id, patch),
    });
  }

  function deleteSelected() {
    if (!canEdit || !selected) return;
    if (
      !window.confirm(
        `Protokoll „${selected.title}“ wirklich löschen?`,
      )
    ) {
      return;
    }
    const protocols = store.protocols.filter((item) => item.id !== selected.id);
    persist({
      ...store,
      protocols,
      selectedId: protocols[0]?.id ?? null,
    });
  }

  function addListItem(
    field: "participants" | "decisions",
    text: string,
    clear: () => void,
  ) {
    if (!canEdit || !selected) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    const item: ProtocolItem = { id: createId("item"), text: trimmed };
    patchSelected({ [field]: [...selected[field], item] });
    clear();
  }

  function addAgendaItem() {
    if (!canEdit || !selected) return;
    const trimmed = agendaDraft.trim();
    if (!trimmed) return;
    const tech = technicians.find((item) => item.id === agendaAssigneeId);
    const item: AgendaItem = {
      id: createId("agenda"),
      text: trimmed,
      assigneeId: tech?.id ?? null,
      assigneeName: tech?.name ?? "",
      assigneeEmail: tech?.email?.trim() ?? "",
      dueDate: agendaDueDate,
      reminderSentAt: null,
    };
    patchSelected({ agenda: [...selected.agenda, item] });
    setAgendaDraft("");
    setAgendaAssigneeId("");
    setAgendaDueDate("");
  }

  function updateAgendaItem(id: string, patch: Partial<AgendaItem>) {
    if (!canEdit || !selected) return;
    patchSelected({
      agenda: selected.agenda.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch };
        if (
          patch.dueDate !== undefined &&
          patch.dueDate !== item.dueDate
        ) {
          next.reminderSentAt = null;
        }
        return next;
      }),
    });
  }

  function assignAgendaItem(id: string, technicianId: string) {
    if (!canEdit || !selected) return;
    if (!technicianId) {
      updateAgendaItem(id, {
        assigneeId: null,
        assigneeName: "",
        assigneeEmail: "",
      });
      return;
    }
    const tech = technicians.find((item) => item.id === technicianId);
    if (!tech) return;
    updateAgendaItem(id, {
      assigneeId: tech.id,
      assigneeName: tech.name,
      assigneeEmail: tech.email?.trim() ?? "",
      reminderSentAt: null,
    });
  }

  function removeListItem(field: "participants" | "decisions", id: string) {
    if (!canEdit || !selected) return;
    patchSelected({
      [field]: selected[field].filter((item) => item.id !== id),
    });
  }

  function removeAgendaItem(id: string) {
    if (!canEdit || !selected) return;
    patchSelected({
      agenda: selected.agenda.filter((item) => item.id !== id),
    });
  }

  function onDragStart(id: string) {
    if (!canEdit) return;
    setDragId(id);
  }

  function onDrop(targetId: string) {
    if (!canEdit || !dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const ids = store.protocols.map((item) => item.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) {
      setDragId(null);
      return;
    }
    const nextIds = [...ids];
    nextIds.splice(from, 1);
    nextIds.splice(to, 0, dragId);
    const byId = new Map(store.protocols.map((item) => [item.id, item]));
    persist({
      ...store,
      protocols: nextIds
        .map((id) => byId.get(id))
        .filter((item): item is MeetingProtocol => Boolean(item)),
    });
    setDragId(null);
  }

  if (!ready) {
    return <div className="meeting-loading">Lade Protokolle…</div>;
  }

  return (
    <div className="meeting-workspace">
      <aside className="meeting-sidebar">
        <div className="meeting-sidebar-head">
          <input
            className="meeting-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Protokolle durchsuchen…"
            aria-label="Protokolle durchsuchen"
          />
          <button
            type="button"
            className="meeting-new-btn"
            disabled={!canEdit}
            onClick={createProtocol}
          >
            + Neues Protokoll
          </button>
        </div>

        <div className="meeting-protocol-list" role="list">
          {filtered.length === 0 ? (
            <p className="meeting-empty-list">
              {store.protocols.length === 0
                ? `Noch keine ${meetingKindLabel(kind)}-Protokolle.`
                : "Keine Treffer."}
            </p>
          ) : (
            filtered.map((protocol) => {
              const active = protocol.id === store.selectedId;
              return (
                <button
                  key={protocol.id}
                  type="button"
                  role="listitem"
                  className={`meeting-protocol-card ${active ? "is-active" : ""}`}
                  draggable={canEdit}
                  onDragStart={() => onDragStart(protocol.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => onDrop(protocol.id)}
                  onClick={() => selectProtocol(protocol.id)}
                >
                  <span className="meeting-drag" aria-hidden>
                    ⋮⋮
                  </span>
                  <span className="meeting-protocol-card-body">
                    <strong>{protocol.title}</strong>
                    <span className="meeting-protocol-meta">
                      <span className="meeting-meta-date">
                        {formatMeetingDate(protocol.meetingDate)}
                      </span>
                      <span
                        className={`meeting-status-pill status-${protocol.status}`}
                      >
                        {statusLabel(protocol.status)}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <section className="meeting-main">
        {!selected ? (
          <div className="meeting-blank">
            <h2>{meetingKindLabel(kind)}</h2>
            <p>
              Wähle ein Protokoll aus der Liste oder lege ein neues an.
              {kind === "techniker"
                ? " Diese Protokolle sind unabhängig vom Ressourcenmeeting."
                : " Diese Protokolle sind unabhängig vom Technikermeeting."}
            </p>
            <button
              type="button"
              className="meeting-new-btn"
              disabled={!canEdit}
              onClick={createProtocol}
            >
              + Neues Protokoll
            </button>
          </div>
        ) : (
          <>
            <header className="meeting-editor-head">
              <input
                className="meeting-title-input"
                value={selected.title}
                disabled={!canEdit}
                onChange={(event) => patchSelected({ title: event.target.value })}
                aria-label="Protokolltitel"
              />
              <div className="meeting-editor-meta">
                <label className="meeting-datetime">
                  <span className="sr-only">Datum</span>
                  <input
                    type="date"
                    value={selected.meetingDate}
                    disabled={!canEdit}
                    onChange={(event) =>
                      patchSelected({ meetingDate: event.target.value })
                    }
                  />
                </label>
                <label className="meeting-datetime">
                  <span className="sr-only">Uhrzeit</span>
                  <input
                    type="time"
                    value={selected.meetingTime}
                    disabled={!canEdit}
                    onChange={(event) =>
                      patchSelected({ meetingTime: event.target.value })
                    }
                  />
                </label>
                <span className="meeting-datetime-display">
                  {formatMeetingDateTime(selected.meetingDate, selected.meetingTime)}
                </span>
                <label className="meeting-status-select-wrap">
                  <span className="sr-only">Status</span>
                  <select
                    className={`meeting-status-select status-${selected.status}`}
                    value={selected.status}
                    disabled={!canEdit}
                    onChange={(event) =>
                      patchSelected({
                        status: event.target.value as ProtocolStatus,
                      })
                    }
                  >
                    {PROTOCOL_STATUS_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="meeting-delete-link"
                  disabled={!canEdit}
                  onClick={deleteSelected}
                >
                  Protokoll löschen
                </button>
              </div>
            </header>

            <div className="meeting-sections">
              <section className="meeting-section-card">
                <h3>
                  <svg viewBox="0 0 24 24" aria-hidden className="meeting-section-icon">
                    <path
                      fill="currentColor"
                      d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-4 0-8 2-8 4v2h16v-2c0-2-4-4-8-4z"
                    />
                  </svg>
                  Teilnehmer
                </h3>
                {selected.participants.length === 0 ? (
                  <p className="meeting-section-empty">
                    Noch keine Teilnehmer hinzugefügt
                  </p>
                ) : (
                  <ul className="meeting-chip-list">
                    {selected.participants.map((item) => (
                      <li key={item.id}>
                        <span>{item.text}</span>
                        {canEdit ? (
                          <button
                            type="button"
                            aria-label={`${item.text} entfernen`}
                            onClick={() =>
                              removeListItem("participants", item.id)
                            }
                          >
                            ×
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="meeting-add-row">
                  <input
                    value={participantDraft}
                    disabled={!canEdit}
                    placeholder="Name des Teilnehmers…"
                    onChange={(event) => setParticipantDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addListItem("participants", participantDraft, () =>
                          setParticipantDraft(""),
                        );
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="meeting-add-btn"
                    disabled={!canEdit}
                    aria-label="Teilnehmer hinzufügen"
                    onClick={() =>
                      addListItem("participants", participantDraft, () =>
                        setParticipantDraft(""),
                      )
                    }
                  >
                    +
                  </button>
                </div>
              </section>

              <section className="meeting-section-card">
                <h3>
                  <svg viewBox="0 0 24 24" aria-hidden className="meeting-section-icon">
                    <path
                      fill="currentColor"
                      d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"
                    />
                  </svg>
                  Agenda
                </h3>
                {reminderNote ? (
                  <p className="meeting-reminder-note" role="status">
                    {reminderNote}
                  </p>
                ) : null}
                {selected.agenda.length === 0 ? (
                  <p className="meeting-section-empty">Noch keine Agenda-Punkte</p>
                ) : (
                  <ol className="meeting-agenda-list">
                    {selected.agenda.map((item, index) => {
                      const due = isAgendaDue(item);
                      return (
                        <li
                          key={item.id}
                          className={`meeting-agenda-item ${due ? "is-due" : ""}`}
                        >
                          <div className="meeting-agenda-top">
                            <strong>
                              <em>{index + 1}.</em> {item.text}
                            </strong>
                            {canEdit ? (
                              <button
                                type="button"
                                aria-label="Agenda-Punkt entfernen"
                                onClick={() => removeAgendaItem(item.id)}
                              >
                                ×
                              </button>
                            ) : null}
                          </div>
                          <div className="meeting-agenda-meta">
                            <label>
                              <span>Zuständig</span>
                              <select
                                value={item.assigneeId ?? ""}
                                disabled={!canEdit}
                                onChange={(event) =>
                                  assignAgendaItem(item.id, event.target.value)
                                }
                              >
                                <option value="">— nicht zugewiesen —</option>
                                {technicians.map((tech) => (
                                  <option key={tech.id} value={tech.id}>
                                    {tech.name}
                                    {tech.email ? "" : " (ohne E-Mail)"}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              <span>Fällig am</span>
                              <input
                                type="date"
                                value={item.dueDate}
                                disabled={!canEdit}
                                onChange={(event) =>
                                  updateAgendaItem(item.id, {
                                    dueDate: event.target.value,
                                  })
                                }
                              />
                            </label>
                            <span className="meeting-agenda-flags">
                              {item.assigneeName ? (
                                <span>{item.assigneeName}</span>
                              ) : null}
                              {item.dueDate ? (
                                <span>
                                  Fällig {formatMeetingDate(item.dueDate)}
                                </span>
                              ) : null}
                              {item.reminderSentAt ? (
                                <span className="is-sent">Erinnerung gesendet</span>
                              ) : due && item.assigneeEmail ? (
                                <span className="is-due-flag">Erinnerung ausstehend</span>
                              ) : due && !item.assigneeEmail ? (
                                <span className="is-due-flag">E-Mail fehlt</span>
                              ) : null}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
                <div className="meeting-agenda-add">
                  <input
                    value={agendaDraft}
                    disabled={!canEdit}
                    placeholder="Agenda-Punkt hinzufügen…"
                    onChange={(event) => setAgendaDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addAgendaItem();
                      }
                    }}
                  />
                  <select
                    value={agendaAssigneeId}
                    disabled={!canEdit}
                    onChange={(event) => setAgendaAssigneeId(event.target.value)}
                    aria-label="Zuständig"
                  >
                    <option value="">Zuständig…</option>
                    {technicians.map((tech) => (
                      <option key={tech.id} value={tech.id}>
                        {tech.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={agendaDueDate}
                    disabled={!canEdit}
                    onChange={(event) => setAgendaDueDate(event.target.value)}
                    aria-label="Fälligkeitsdatum"
                  />
                  <button
                    type="button"
                    className="meeting-add-btn"
                    disabled={!canEdit}
                    aria-label="Agenda-Punkt hinzufügen"
                    onClick={addAgendaItem}
                  >
                    +
                  </button>
                </div>
                <p className="meeting-agenda-hint">
                  Zuständige Personen kommen aus der Techniker-DB. Am Fälligkeitstag
                  wird automatisch eine Erinnerungs-Mail gesendet (SMTP in .env).
                </p>
              </section>

              <section className="meeting-section-card">
                <h3>
                  <svg viewBox="0 0 24 24" aria-hidden className="meeting-section-icon">
                    <path
                      fill="currentColor"
                      d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                    />
                  </svg>
                  Notizen
                </h3>
                <textarea
                  className="meeting-notes"
                  value={selected.notes}
                  disabled={!canEdit}
                  placeholder="Protokollnotizen…"
                  rows={5}
                  onChange={(event) => patchSelected({ notes: event.target.value })}
                />
              </section>

              <section className="meeting-section-card">
                <h3>
                  <svg viewBox="0 0 24 24" aria-hidden className="meeting-section-icon">
                    <path
                      fill="currentColor"
                      d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-9 14-5-5 1.4-1.4L10 14.2l6.6-6.6L18 9l-8 8z"
                    />
                  </svg>
                  Beschlüsse / Aufgaben
                </h3>
                {selected.decisions.length === 0 ? (
                  <p className="meeting-section-empty">
                    Noch keine Beschlüsse oder Aufgaben
                  </p>
                ) : (
                  <ul className="meeting-numbered-list">
                    {selected.decisions.map((item) => (
                      <li key={item.id}>
                        <span>{item.text}</span>
                        {canEdit ? (
                          <button
                            type="button"
                            aria-label="Eintrag entfernen"
                            onClick={() => removeListItem("decisions", item.id)}
                          >
                            ×
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="meeting-add-row">
                  <input
                    value={decisionDraft}
                    disabled={!canEdit}
                    placeholder="Beschluss oder Aufgabe hinzufügen…"
                    onChange={(event) => setDecisionDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addListItem("decisions", decisionDraft, () =>
                          setDecisionDraft(""),
                        );
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="meeting-add-btn"
                    disabled={!canEdit}
                    aria-label="Beschluss hinzufügen"
                    onClick={() =>
                      addListItem("decisions", decisionDraft, () =>
                        setDecisionDraft(""),
                      )
                    }
                  >
                    +
                  </button>
                </div>
              </section>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
