"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useEditAccess } from "@/components/EditAccessProvider";
import {
  FILE_LABELS,
  formatWhen,
  fetchMailState,
  PRIORITY_LABELS,
  ROLE_LABELS,
  STATUS_LABELS,
  type MailverwaltungState,
  type MessageDto,
  type SenderDto,
} from "./types";

type Filters = {
  unread: boolean;
  attachment: boolean;
  urgent: boolean;
  priority: string;
  query: string;
};

const EMPTY_FILTERS: Filters = {
  unread: false,
  attachment: false,
  urgent: false,
  priority: "alle",
  query: "",
};

export function MailverwaltungPage() {
  const { hasApp } = useAuth();
  const { canEdit } = useEditAccess();
  const [state, setState] = useState<MailverwaltungState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mailboxId, setMailboxId] = useState<string>("");
  const [senderId, setSenderId] = useState<string>("");
  const [showArchive, setShowArchive] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const load = useCallback(async () => {
    try {
      const next = await fetchMailState();
      setState(next);
      setError("");
      setMailboxId((current) => current || next.mailboxes[0]?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Laden fehlgeschlagen.");
    }
  }, []);

  useEffect(() => {
    if (hasApp("mailverwaltung")) void load();
  }, [hasApp, load]);

  const senders = useMemo(() => {
    if (!state) return [];
    return state.senders
      .filter((item) => item.mailboxId === mailboxId)
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "de"));
  }, [state, mailboxId]);

  useEffect(() => {
    if (!senders.some((item) => item.id === senderId)) {
      setSenderId(senders[0]?.id || "");
    }
  }, [senders, senderId]);

  const senderMails = useMemo(() => {
    if (!state) return [];
    return state.messages
      .filter((item) => item.mailboxId === mailboxId && item.senderId === senderId)
      .filter((item) => (showArchive ? item.archived : !item.archived))
      .filter((item) => {
        if (filters.unread && item.status !== "neu") return false;
        if (filters.attachment && !item.hasAttachments) return false;
        if (filters.urgent && item.priority !== "hoch" && item.priority !== "kritisch") {
          return false;
        }
        if (filters.priority !== "alle" && item.priority !== filters.priority) return false;
        if (filters.query.trim()) {
          const q = filters.query.trim().toLowerCase();
          const hay = `${item.subject} ${item.fromName} ${item.fromEmail} ${item.bodyText}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  }, [state, mailboxId, senderId, showArchive, filters]);

  const selected = senderMails.find((item) => item.id === selectedId) ?? senderMails[0] ?? null;

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  async function patchStatus(id: string, status: MessageDto["status"]) {
    if (!canEdit) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/mailverwaltung/messages/${id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Status konnte nicht gespeichert werden.");
        return;
      }
      setState(data);
    } finally {
      setBusy(false);
    }
  }

  async function runSync() {
    setBusy(true);
    try {
      const res = await fetch("/api/mailverwaltung/sync", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mailboxId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Sync fehlgeschlagen.");
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!hasApp("mailverwaltung")) {
    return (
      <div className="page-panel">
        <div className="content-card">
          <h1>Keine Berechtigung</h1>
          <p>Für die Mailverwaltung fehlt die Freigabe.</p>
        </div>
      </div>
    );
  }

  if (!state) {
    return <div className="page-panel">Lade Mailverwaltung…</div>;
  }

  const mailbox = state.mailboxes.find((item) => item.id === mailboxId);
  const sender = senders.find((item) => item.id === senderId);
  const selectedFiles = state.files.filter((item) => item.messageId === selected?.id);

  return (
    <div className="mv-page">
      <header className="section-header">
        <div>
          <h1>Mailverwaltung</h1>
          <p>
            {state.stats.unread} neu · {state.stats.critical} kritisch · {state.stats.stale}{" "}
            überfällig · {state.stats.importantFiles} wichtige Dateien
          </p>
        </div>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void runSync()}>
          {busy ? "Synchronisiere…" : "Jetzt synchronisieren"}
        </button>
      </header>

      {error ? <p className="smtp-error">{error}</p> : null}

      <div className="mv-filters">
        <input
          value={filters.query}
          onChange={(event) => setFilters({ ...filters, query: event.target.value })}
          placeholder="Suche über Betreff, Absender, Inhalt…"
        />
        <label>
          <input
            type="checkbox"
            checked={filters.unread}
            onChange={(event) => setFilters({ ...filters, unread: event.target.checked })}
          />
          Ungelesen
        </label>
        <label>
          <input
            type="checkbox"
            checked={filters.attachment}
            onChange={(event) => setFilters({ ...filters, attachment: event.target.checked })}
          />
          Mit Anhang
        </label>
        <label>
          <input
            type="checkbox"
            checked={filters.urgent}
            onChange={(event) => setFilters({ ...filters, urgent: event.target.checked })}
          />
          Dringend
        </label>
        <select
          value={filters.priority}
          onChange={(event) => setFilters({ ...filters, priority: event.target.value })}
        >
          <option value="alle">Alle Prioritäten</option>
          {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="mv-grid">
        <aside className="mv-col">
          <h2>Postfächer</h2>
          {state.mailboxes.map((item) => {
            const unread = state.messages.filter(
              (mail) => mail.mailboxId === item.id && mail.status === "neu",
            ).length;
            return (
              <button
                key={item.id}
                type="button"
                className={`mv-item ${item.id === mailboxId ? "is-active" : ""}`}
                onClick={() => {
                  setMailboxId(item.id);
                  setShowArchive(false);
                }}
              >
                <strong>{item.displayName}</strong>
                <span>
                  {item.email}
                  {unread ? ` · ${unread} neu` : ""}
                </span>
                <em>{item.connected ? "Outlook verbunden" : "Lokal / Demo"}</em>
              </button>
            );
          })}
        </aside>

        <aside className="mv-col">
          <h2>Absender {mailbox ? `· ${mailbox.displayName}` : ""}</h2>
          {senders.map((item) => (
            <SenderButton
              key={item.id}
              sender={item}
              active={item.id === senderId}
              inbox={state.messages.filter(
                (mail) => mail.senderId === item.id && !mail.archived,
              ).length}
              archive={state.messages.filter(
                (mail) => mail.senderId === item.id && mail.archived,
              ).length}
              critical={state.messages.some(
                (mail) =>
                  mail.senderId === item.id &&
                  mail.priority === "kritisch" &&
                  !mail.archived,
              )}
              onClick={() => {
                setSenderId(item.id);
                setShowArchive(false);
              }}
            />
          ))}
        </aside>

        <section className="mv-col mv-col-wide">
          <div className="mv-mail-head">
            <h2>
              {sender ? sender.displayName : "Mails"}
              {sender ? ` · ${ROLE_LABELS[sender.role] || sender.role}` : ""}
            </h2>
            <div className="mv-toggle">
              <button
                type="button"
                className={!showArchive ? "is-active" : ""}
                onClick={() => setShowArchive(false)}
              >
                Eingang
              </button>
              <button
                type="button"
                className={showArchive ? "is-active" : ""}
                onClick={() => setShowArchive(true)}
              >
                Archiv
              </button>
            </div>
          </div>

          <div className="mv-split">
            <ul className="mv-mail-list">
              {senderMails.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`mv-mail ${item.id === selected?.id ? "is-active" : ""} ${item.priority === "kritisch" ? "is-critical" : ""}`}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <span className={`mv-prio is-${item.priority}`}>
                      {PRIORITY_LABELS[item.priority]}
                    </span>
                    <strong>{item.subject}</strong>
                    <span>
                      {formatWhen(item.receivedAt)}
                      {item.hasAttachments ? " · Anhang" : ""}
                      {item.staleWarnedAt ? " · überfällig" : ""}
                    </span>
                  </button>
                </li>
              ))}
              {senderMails.length === 0 ? <li className="mv-empty">Keine Mails in dieser Ansicht.</li> : null}
            </ul>

            {selected ? (
              <article className="mv-detail">
                <h3>{selected.subject}</h3>
                <p className="mv-meta">
                  Von {selected.fromName} &lt;{selected.fromEmail}&gt; · {formatWhen(selected.receivedAt)}
                </p>
                <p className="mv-reason">KI: {selected.priorityReason || "—"}</p>
                <div className="mv-status-row">
                  {(Object.keys(STATUS_LABELS) as MessageDto["status"][]).map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={`btn ${selected.status === status ? "btn-primary" : "btn-secondary"}`}
                      disabled={!canEdit || busy}
                      onClick={() => void patchStatus(selected.id, status)}
                    >
                      {STATUS_LABELS[status]}
                    </button>
                  ))}
                </div>
                <pre className="mv-body">{selected.bodyText}</pre>
                {selectedFiles.length ? (
                  <div className="mv-files">
                    <h4>Anhänge</h4>
                    <ul>
                      {selectedFiles.map((file) => (
                        <li key={file.id}>
                          {file.name} · {FILE_LABELS[file.category] || file.category}
                          {file.important ? " · wichtig" : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </article>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function SenderButton({
  sender,
  active,
  inbox,
  archive,
  critical,
  onClick,
}: {
  sender: SenderDto;
  active: boolean;
  inbox: number;
  archive: number;
  critical: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`mv-item ${active ? "is-active" : ""} ${critical ? "is-critical" : ""}`}
      onClick={onClick}
    >
      <strong>{sender.displayName}</strong>
      <span>
        {sender.email} · {inbox} offen / {archive} Archiv
      </span>
    </button>
  );
}
