"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useEditAccess } from "@/components/EditAccessProvider";
import {
  createContact,
  mailtoHref,
  PHONE_CATEGORIES,
  PHONE_CATEGORY_LABELS,
  telHref,
  type PhoneCategory,
  type PhoneContact,
} from "@/lib/telefonnummern/types";

type Draft = {
  name: string;
  company: string;
  role: string;
  phone: string;
  mobile: string;
  email: string;
  category: PhoneCategory;
  notes: string;
};

type CategoryFilter = PhoneCategory | "alle";

function emptyDraft(): Draft {
  return {
    name: "",
    company: "",
    role: "",
    phone: "",
    mobile: "",
    email: "",
    category: "sonstige",
    notes: "",
  };
}

function contactToDraft(contact: PhoneContact): Draft {
  return {
    name: contact.name,
    company: contact.company,
    role: contact.role,
    phone: contact.phone,
    mobile: contact.mobile,
    email: contact.email,
    category: contact.category,
    notes: contact.notes,
  };
}

function sortContacts(contacts: PhoneContact[]): PhoneContact[] {
  return [...contacts].sort((a, b) => a.name.localeCompare(b.name, "de"));
}

function matchesQuery(contact: PhoneContact, query: string): boolean {
  if (!query) return true;
  const hay = [
    contact.name,
    contact.company,
    contact.role,
    contact.phone,
    contact.mobile,
    contact.email,
    contact.notes,
    PHONE_CATEGORY_LABELS[contact.category],
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(query);
}

export function TelefonnummernPage() {
  const { canEdit } = useEditAccess();
  const [contacts, setContacts] = useState<PhoneContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("alle");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/telefonnummern", { credentials: "same-origin" });
      const data = (await res.json().catch(() => null)) as {
        contacts?: PhoneContact[];
        error?: string;
      } | null;
      if (!res.ok) throw new Error(data?.error || "Telefonbuch konnte nicht geladen werden.");
      const next = sortContacts(Array.isArray(data?.contacts) ? data.contacts : []);
      setContacts(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Telefonbuch konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = useCallback(
    async (next: PhoneContact[]) => {
      if (!canEdit) {
        setError("Schreibzugriff gesperrt. Bitte freischalten oder mit Bearbeitungsrecht anmelden.");
        return false;
      }
      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/telefonnummern", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ contacts: next }),
        });
        const data = (await res.json().catch(() => null)) as {
          contacts?: PhoneContact[];
          error?: string;
        } | null;
        if (!res.ok) throw new Error(data?.error || "Speichern fehlgeschlagen.");
        setContacts(sortContacts(Array.isArray(data?.contacts) ? data.contacts : next));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [canEdit],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts.filter((item) => {
      if (category !== "alle" && item.category !== category) return false;
      return matchesQuery(item, q);
    });
  }, [category, contacts, query]);

  const selected = creating ? null : contacts.find((item) => item.id === selectedId) ?? null;

  function openCreate() {
    setCreating(true);
    setSelectedId(null);
    setDraft(emptyDraft());
    setMessage(null);
  }

  function openContact(id: string) {
    const contact = contacts.find((item) => item.id === id);
    if (!contact) return;
    setCreating(false);
    setSelectedId(id);
    setDraft(contactToDraft(contact));
    setMessage(null);
  }

  async function saveDraft() {
    const name = draft.name.trim();
    const phone = draft.phone.trim();
    const mobile = draft.mobile.trim();
    if (!name) {
      setError("Bitte einen Namen eintragen.");
      return;
    }
    if (!phone && !mobile) {
      setError("Bitte mindestens eine Telefonnummer eintragen.");
      return;
    }
    const payload = {
      name,
      company: draft.company,
      role: draft.role,
      phone,
      mobile,
      email: draft.email,
      category: draft.category,
      notes: draft.notes,
    };
    let next: PhoneContact[];
    if (creating || !selected) {
      const contact = createContact(payload);
      next = [...contacts, contact];
      const ok = await persist(next);
      if (!ok) return;
      setCreating(false);
      setSelectedId(contact.id);
      setDraft(contactToDraft(contact));
      setMessage("Nummer gespeichert.");
      return;
    }
    const updated: PhoneContact = {
      ...selected,
      ...payload,
      updatedAt: new Date().toISOString(),
    };
    next = contacts.map((item) => (item.id === selected.id ? updated : item));
    const ok = await persist(next);
    if (!ok) return;
    setDraft(contactToDraft(updated));
    setMessage("Änderungen gespeichert.");
  }

  async function removeContact() {
    if (!selected || !canEdit) return;
    if (!window.confirm(`„${selected.name}“ wirklich aus dem Telefonbuch löschen?`)) return;
    const next = contacts.filter((item) => item.id !== selected.id);
    const ok = await persist(next);
    if (!ok) return;
    setSelectedId(next[0]?.id ?? null);
    setCreating(false);
    setDraft(next[0] ? contactToDraft(next[0]) : emptyDraft());
    setMessage("Eintrag gelöscht.");
  }

  const counts = useMemo(() => {
    const map = new Map<CategoryFilter, number>();
    map.set("alle", contacts.length);
    for (const item of PHONE_CATEGORIES) {
      map.set(item, contacts.filter((row) => row.category === item).length);
    }
    return map;
  }, [contacts]);

  return (
    <div className="page-panel phonebook-page">
      <header className="section-header">
        <div>
          <h1>Telefonnummern</h1>
          <p>Wichtige Nummern, Ansprechpartner und Notfallkontakte</p>
        </div>
        <div className="phonebook-header-actions">
          <button type="button" className="btn btn-primary" disabled={!canEdit} onClick={openCreate}>
            + Neue Nummer
          </button>
        </div>
      </header>

      <div className="phonebook-toolbar">
        <label className="phonebook-search">
          <span className="sr-only">Suche</span>
          <input
            type="search"
            placeholder="Name, Firma oder Nummer suchen…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="phonebook-filters" role="tablist" aria-label="Kategorie">
          {([{ id: "alle" as const, label: "Alle" }, ...PHONE_CATEGORIES.map((id) => ({
            id,
            label: PHONE_CATEGORY_LABELS[id],
          }))]).map((item) => (
            <button
              key={item.id}
              type="button"
              className={`phonebook-filter ${category === item.id ? "is-active" : ""}`}
              onClick={() => setCategory(item.id)}
            >
              {item.label}
              <span>{counts.get(item.id) ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="phonebook-banner is-error">{error}</p> : null}
      {message ? <p className="phonebook-banner is-ok">{message}</p> : null}

      {loading ? (
        <p className="muted-meta">Lade Telefonbuch…</p>
      ) : (
        <div className="phonebook-layout">
          <aside className="phonebook-list" aria-label="Kontakte">
            {filtered.length === 0 ? (
              <p className="muted-meta">
                {contacts.length === 0
                  ? "Noch keine Nummern eingetragen."
                  : "Keine Treffer für diese Suche."}
              </p>
            ) : (
              filtered.map((contact) => (
                <button
                  key={contact.id}
                  type="button"
                  className={`phonebook-list-item ${!creating && selectedId === contact.id ? "is-active" : ""}`}
                  onClick={() => openContact(contact.id)}
                >
                  <strong>{contact.name}</strong>
                  <span>
                    {contact.company || PHONE_CATEGORY_LABELS[contact.category]}
                    {contact.role ? ` · ${contact.role}` : ""}
                  </span>
                  <span className="phonebook-list-meta">
                    {contact.phone || contact.mobile || "Keine Nummer"}
                  </span>
                </button>
              ))
            )}
          </aside>

          <section className="phonebook-detail">
            {!creating && !selected ? (
              <div className="content-card">
                <p className="muted-meta">Wähle einen Eintrag oder lege eine neue Nummer an.</p>
              </div>
            ) : (
              <form
                className="content-card phonebook-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveDraft();
                }}
              >
                <div className="phonebook-detail-head">
                  <div>
                    <h2>{creating ? "Neue Nummer" : selected?.name}</h2>
                    {!creating && selected ? (
                      <p className="muted-meta">{PHONE_CATEGORY_LABELS[selected.category]}</p>
                    ) : null}
                  </div>
                  {!creating && selected ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={!canEdit || saving}
                      onClick={() => void removeContact()}
                    >
                      Löschen
                    </button>
                  ) : null}
                </div>

                <div className="phonebook-form-grid">
                  <label>
                    Name
                    <input
                      value={draft.name}
                      onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                      disabled={!canEdit}
                      required
                    />
                  </label>
                  <label>
                    Kategorie
                    <select
                      value={draft.category}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, category: event.target.value as PhoneCategory }))
                      }
                      disabled={!canEdit}
                    >
                      {PHONE_CATEGORIES.map((id) => (
                        <option key={id} value={id}>
                          {PHONE_CATEGORY_LABELS[id]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Firma
                    <input
                      value={draft.company}
                      onChange={(event) => setDraft((prev) => ({ ...prev, company: event.target.value }))}
                      disabled={!canEdit}
                    />
                  </label>
                  <label>
                    Funktion
                    <input
                      value={draft.role}
                      onChange={(event) => setDraft((prev) => ({ ...prev, role: event.target.value }))}
                      disabled={!canEdit}
                    />
                  </label>
                  <label>
                    Telefon
                    <input
                      value={draft.phone}
                      onChange={(event) => setDraft((prev) => ({ ...prev, phone: event.target.value }))}
                      disabled={!canEdit}
                      inputMode="tel"
                      autoComplete="tel"
                    />
                  </label>
                  <label>
                    Mobil
                    <input
                      value={draft.mobile}
                      onChange={(event) => setDraft((prev) => ({ ...prev, mobile: event.target.value }))}
                      disabled={!canEdit}
                      inputMode="tel"
                      autoComplete="tel"
                    />
                  </label>
                  <label className="is-wide">
                    E-Mail
                    <input
                      value={draft.email}
                      onChange={(event) => setDraft((prev) => ({ ...prev, email: event.target.value }))}
                      disabled={!canEdit}
                      type="email"
                      autoComplete="email"
                    />
                  </label>
                  <label className="is-wide">
                    Notiz
                    <textarea
                      value={draft.notes}
                      onChange={(event) => setDraft((prev) => ({ ...prev, notes: event.target.value }))}
                      disabled={!canEdit}
                      rows={3}
                    />
                  </label>
                </div>

                {!creating && selected ? (
                  <div className="phonebook-call">
                    {selected.phone && telHref(selected.phone) ? (
                      <a className="btn btn-secondary" href={telHref(selected.phone) ?? undefined}>
                        Anrufen {selected.phone}
                      </a>
                    ) : null}
                    {selected.mobile && telHref(selected.mobile) ? (
                      <a className="btn btn-secondary" href={telHref(selected.mobile) ?? undefined}>
                        Mobil {selected.mobile}
                      </a>
                    ) : null}
                    {selected.email && mailtoHref(selected.email) ? (
                      <a className="btn btn-secondary" href={mailtoHref(selected.email) ?? undefined}>
                        Mail {selected.email}
                      </a>
                    ) : null}
                  </div>
                ) : null}

                <div className="phonebook-form-actions">
                  <button type="submit" className="btn btn-primary" disabled={!canEdit || saving}>
                    {creating ? "Anlegen" : "Speichern"}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
