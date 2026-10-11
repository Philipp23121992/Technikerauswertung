"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useEditAccess } from "@/components/EditAccessProvider";
import {
  BOARD_COLUMNS,
  CARD_PRIORITIES,
  CARD_PRIORITY_LABELS,
  CARD_STATUSES,
  CARD_STATUS_LABELS,
  createBoardCard,
  createBoardComment,
  emailsForColumn,
  formatDueDateDe,
  initialsForColumn,
  type BoardCard,
  type BoardColumnId,
  type CardPriority,
  type CardStatus,
} from "@/lib/serviceboard/types";

type Draft = {
  title: string;
  columnId: BoardColumnId;
  priority: CardPriority;
  status: CardStatus;
  dueDate: string;
};

function emptyDraft(): Draft {
  return {
    title: "",
    columnId: "offen",
    priority: "mittel",
    status: "offen",
    dueDate: "",
  };
}

function sortCards(cards: BoardCard[]): BoardCard[] {
  return [...cards].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}

export function ServiceboardPage() {
  const { canEdit } = useEditAccess();
  const [cards, setCards] = useState<BoardCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [mailConfigured, setMailConfigured] = useState(true);
  const reminderBusy = useRef(false);
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const processRemindersRef = useRef<() => Promise<void>>(async () => {});

  const persist = useCallback(
    async (next: BoardCard[]) => {
      if (!canEdit) {
        setError("Schreibzugriff gesperrt.");
        return false;
      }
      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/serviceboard", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ cards: next }),
        });
        const data = (await res.json().catch(() => null)) as {
          cards?: BoardCard[];
          mailConfigured?: boolean;
          error?: string;
        } | null;
        if (!res.ok) throw new Error(data?.error || "Speichern fehlgeschlagen.");
        setCards(Array.isArray(data?.cards) ? data.cards : next);
        if (typeof data?.mailConfigured === "boolean") {
          setMailConfigured(data.mailConfigured);
        }
        void processRemindersRef.current();
        return true;
      } catch (err) {
        setError(
          err instanceof TypeError && /fetch/i.test(err.message)
            ? "Netzwerkfehler beim Speichern."
            : err instanceof Error
              ? err.message
              : "Speichern fehlgeschlagen.",
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [canEdit],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/serviceboard", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => null)) as {
        cards?: BoardCard[];
        mailConfigured?: boolean;
        error?: string;
      } | null;
      if (!res.ok) throw new Error(data?.error || "Laden fehlgeschlagen.");
      setCards(Array.isArray(data?.cards) ? data.cards : []);
      if (typeof data?.mailConfigured === "boolean") {
        setMailConfigured(data.mailConfigured);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Laden fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const processReminders = useCallback(async () => {
    if (reminderBusy.current) return;
    reminderBusy.current = true;
    try {
      const res = await fetch("/api/serviceboard/process-reminders", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => null)) as {
        sent?: number;
        cards?: BoardCard[];
        mailConfigured?: boolean;
        errors?: string[];
      } | null;
      if (!res.ok) return;
      if (Array.isArray(data?.cards)) setCards(data.cards);
      if (typeof data?.mailConfigured === "boolean") {
        setMailConfigured(data.mailConfigured);
      }
      if ((data?.sent ?? 0) > 0) {
        setMessage(`${data?.sent} Fälligkeits-Mail(s) versendet.`);
      }
      if (data?.errors?.length) {
        setError(data.errors.join(" · "));
      }
    } finally {
      reminderBusy.current = false;
    }
  }, []);
  processRemindersRef.current = processReminders;

  useEffect(() => {
    void processReminders();
    const timer = window.setInterval(() => {
      void processReminders();
    }, 15 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [processReminders]);

  const selected = useMemo(
    () => cards.find((card) => card.id === selectedId) ?? null,
    [cards, selectedId],
  );

  const columns = useMemo(() => {
    return BOARD_COLUMNS.map((column) => ({
      ...column,
      cards: sortCards(cards.filter((card) => card.columnId === column.id)),
    }));
  }, [cards]);

  async function submitCreate() {
    const title = draft.title.trim();
    if (!title) {
      setError("Titel ist erforderlich.");
      return;
    }
    const maxOrder = cardsRef.current.reduce(
      (max, card) => Math.max(max, card.order),
      0,
    );
    const card = createBoardCard({
      title,
      columnId: draft.columnId,
      priority: draft.priority,
      status: draft.status,
      dueDate: draft.dueDate || null,
      order: maxOrder + 1,
    });
    const ok = await persist([card, ...cardsRef.current]);
    if (ok) {
      setCreateOpen(false);
      setDraft(emptyDraft());
      setSelectedId(card.id);
      setMessage("Karte angelegt.");
    }
  }

  async function updateCard(
    id: string,
    mutator: (card: BoardCard) => BoardCard,
  ) {
    const next = cardsRef.current.map((card) =>
      card.id === id
        ? mutator({ ...card, updatedAt: new Date().toISOString() })
        : card,
    );
    await persist(next);
  }

  async function deleteCard(id: string) {
    if (!canEdit) return;
    if (!window.confirm("Karte wirklich löschen?")) return;
    const ok = await persist(cardsRef.current.filter((card) => card.id !== id));
    if (ok) {
      if (selectedId === id) setSelectedId(null);
      setMessage("Karte gelöscht.");
    }
  }

  async function addComment() {
    if (!selected || !canEdit) return;
    const text = commentDraft.trim();
    if (!text) return;
    const entry = createBoardComment(text);
    await updateCard(selected.id, (card) => ({
      ...card,
      comments: [entry, ...card.comments],
    }));
    setCommentDraft("");
  }

  function onDragStart(id: string) {
    if (!canEdit) return;
    setDragId(id);
  }

  async function onDropColumn(columnId: BoardColumnId) {
    if (!dragId || !canEdit) {
      setDragId(null);
      return;
    }
    const dragged = cardsRef.current.find((card) => card.id === dragId);
    if (!dragged) {
      setDragId(null);
      return;
    }
    const maxOrder = cardsRef.current
      .filter((card) => card.columnId === columnId && card.id !== dragId)
      .reduce((max, card) => Math.max(max, card.order), 0);

    const next = cardsRef.current.map((card) =>
      card.id === dragId
        ? {
            ...card,
            columnId,
            order: maxOrder + 1,
            updatedAt: new Date().toISOString(),
          }
        : card,
    );
    setDragId(null);
    await persist(next);
  }

  return (
    <div className="page-panel serviceboard-page">
      <header className="section-header">
        <div>
          <h1>Serviceboard</h1>
          <p>
            Kanban für die Serviceleitung. Fällige Karten lösen eine Mail an die
            Spalten-Adresse aus.
            {!mailConfigured ? (
              <>
                {" "}
                SMTP ist noch nicht eingerichtet — bitte unter{" "}
                <Link href="/einstellungen/smtp">Einstellung → E-Mail / SMTP</Link>{" "}
                konfigurieren.
              </>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canEdit || saving}
          onClick={() => {
            setDraft(emptyDraft());
            setCreateOpen(true);
            setMessage(null);
          }}
        >
          + Neue Karte
        </button>
      </header>

      {error ? <p className="sb-banner is-error">{error}</p> : null}
      {message ? <p className="sb-banner is-ok">{message}</p> : null}

      {loading ? (
        <p className="muted-meta">Lade Serviceboard…</p>
      ) : (
        <div className="sb-board" aria-label="Serviceboard Kanban">
          {columns.map((column) => (
            <section
              key={column.id}
              className="sb-column"
              onDragOver={(event) => {
                if (canEdit) event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                void onDropColumn(column.id);
              }}
            >
              <header
                className="sb-column-head"
                style={{ background: column.color }}
              >
                <div className="sb-column-head-main">
                  <strong>{column.label}</strong>
                  <span className="sb-column-count">{column.cards.length}</span>
                </div>
                {emailsForColumn(column.id).length ? (
                  <p className="sb-column-mails">
                    {emailsForColumn(column.id).join(" · ")}
                  </p>
                ) : (
                  <p className="sb-column-mails is-empty">Keine Erinnerungsmail</p>
                )}
              </header>

              <div className="sb-column-body">
                {column.cards.length === 0 ? (
                  <p className="sb-empty">Keine Karten</p>
                ) : (
                  column.cards.map((card) => (
                    <article
                      key={card.id}
                      className={`sb-card ${dragId === card.id ? "is-dragging" : ""}`}
                      draggable={canEdit}
                      onDragStart={() => onDragStart(card.id)}
                      onClick={() => {
                        setSelectedId(card.id);
                        setCommentDraft("");
                        setMessage(null);
                      }}
                    >
                      <h3>{card.title}</h3>
                      <div className="sb-card-tags">
                        <span className={`sb-tag prio-${card.priority}`}>
                          {CARD_PRIORITY_LABELS[card.priority]}
                        </span>
                        <span className={`sb-tag status-${card.status}`}>
                          {CARD_STATUS_LABELS[card.status]}
                        </span>
                      </div>
                      <div className="sb-card-foot">
                        <div className="sb-card-meta">
                          {card.dueDate ? (
                            <span className="sb-date">
                              {formatDueDateDe(card.dueDate)}
                            </span>
                          ) : (
                            <span />
                          )}
                          {initialsForColumn(card.columnId) ? (
                            <span
                              className="sb-avatar"
                              style={{
                                background:
                                  BOARD_COLUMNS.find((c) => c.id === card.columnId)
                                    ?.color ?? "#94a3b8",
                              }}
                            >
                              {initialsForColumn(card.columnId)}
                            </span>
                          ) : (
                            <span className="sb-avatar is-empty" aria-hidden>
                              ·
                            </span>
                          )}
                        </div>
                        <span className="sb-comment-count">
                          {card.comments.length} Komm.
                        </span>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      {createOpen ? (
        <div
          className="sb-modal-backdrop"
          role="presentation"
          onClick={() => setCreateOpen(false)}
        >
          <div
            className="sb-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sb-create-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="sb-modal-head">
              <h2 id="sb-create-title">Neue Karte</h2>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setCreateOpen(false)}
              >
                Schließen
              </button>
            </header>
            <div className="sb-modal-body">
              <label>
                <span>Titel</span>
                <input
                  value={draft.title}
                  autoFocus
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>Spalte</span>
                <select
                  value={draft.columnId}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      columnId: event.target.value as BoardColumnId,
                    }))
                  }
                >
                  {BOARD_COLUMNS.map((column) => (
                    <option key={column.id} value={column.id}>
                      {column.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Priorität</span>
                <select
                  value={draft.priority}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      priority: event.target.value as CardPriority,
                    }))
                  }
                >
                  {CARD_PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {CARD_PRIORITY_LABELS[priority]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Status</span>
                <select
                  value={draft.status}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      status: event.target.value as CardStatus,
                    }))
                  }
                >
                  {CARD_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {CARD_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Fällig</span>
                <input
                  type="date"
                  value={draft.dueDate}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      dueDate: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <footer className="sb-modal-foot">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setCreateOpen(false)}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving}
                onClick={() => void submitCreate()}
              >
                Speichern
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {selected ? (
        <div
          className="sb-modal-backdrop"
          role="presentation"
          onClick={() => setSelectedId(null)}
        >
          <div
            className="sb-modal sb-modal-wide"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="sb-modal-head">
              <h2>Karte bearbeiten</h2>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setSelectedId(null)}
              >
                Schließen
              </button>
            </header>
            <div className="sb-modal-body">
              <label className="full">
                <span>Titel</span>
                <input
                  value={selected.title}
                  disabled={!canEdit || saving}
                  onChange={(event) =>
                    void updateCard(selected.id, (card) => ({
                      ...card,
                      title: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>Spalte</span>
                <select
                  value={selected.columnId}
                  disabled={!canEdit || saving}
                  onChange={(event) =>
                    void updateCard(selected.id, (card) => ({
                      ...card,
                      columnId: event.target.value as BoardColumnId,
                    }))
                  }
                >
                  {BOARD_COLUMNS.map((column) => (
                    <option key={column.id} value={column.id}>
                      {column.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Priorität</span>
                <select
                  value={selected.priority}
                  disabled={!canEdit || saving}
                  onChange={(event) =>
                    void updateCard(selected.id, (card) => ({
                      ...card,
                      priority: event.target.value as CardPriority,
                    }))
                  }
                >
                  {CARD_PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {CARD_PRIORITY_LABELS[priority]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Status</span>
                <select
                  value={selected.status}
                  disabled={!canEdit || saving}
                  onChange={(event) =>
                    void updateCard(selected.id, (card) => ({
                      ...card,
                      status: event.target.value as CardStatus,
                    }))
                  }
                >
                  {CARD_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {CARD_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Fällig</span>
                <input
                  type="date"
                  value={selected.dueDate ?? ""}
                  disabled={!canEdit || saving}
                  onChange={(event) =>
                    void updateCard(selected.id, (card) => ({
                      ...card,
                      dueDate: event.target.value || null,
                    }))
                  }
                />
              </label>

              <div className="sb-comments full">
                <h3>Kommentare</h3>
                {canEdit ? (
                  <div className="sb-comment-compose">
                    <textarea
                      rows={2}
                      value={commentDraft}
                      placeholder="Kommentar schreiben…"
                      onChange={(event) => setCommentDraft(event.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={!commentDraft.trim() || saving}
                      onClick={() => void addComment()}
                    >
                      Kommentar speichern
                    </button>
                  </div>
                ) : null}
                {selected.comments.length === 0 ? (
                  <p className="muted-meta">Noch keine Kommentare.</p>
                ) : (
                  <ul className="sb-comment-list">
                    {selected.comments.map((entry) => (
                      <li key={entry.id}>
                        <span className="muted-meta">
                          {new Date(entry.createdAt).toLocaleString("de-DE")}
                        </span>
                        <p>{entry.text}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <footer className="sb-modal-foot">
              {canEdit ? (
                <button
                  type="button"
                  className="btn btn-link-danger"
                  disabled={saving}
                  onClick={() => void deleteCard(selected.id)}
                >
                  Löschen
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setSelectedId(null)}
              >
                Fertig
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
