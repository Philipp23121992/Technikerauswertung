"use client";

import { FormEvent, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { ContactEntry, EntityKind } from "@/lib/finder/types";
import { useEditAccess } from "@/components/EditAccessProvider";

const emptyForm = {
  name: "",
  company: "",
  plz: "",
  city: "",
  street: "",
  phone: "",
  email: "",
  notes: "",
  active: true,
};

export function EntryManager({
  kind,
  title,
}: {
  kind: EntityKind;
  title: string;
}) {
  const [items, setItems] = useState<ContactEntry[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const { canEdit } = useEditAccess();

  async function load() {
    try {
      const res = await fetch(`/api/finder/entries?kind=${kind}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Liste konnte nicht geladen werden.");
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setError("Liste konnte nicht geladen werden. Seite neu laden.");
    }
  }

  useEffect(() => {
    void load();
  }, [kind]);

  function startEdit(item: ContactEntry) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      company: item.company,
      plz: item.plz,
      city: item.city,
      street: item.street,
      phone: item.phone,
      email: item.email,
      notes: item.notes,
      active: item.active,
    });
    setMessage("");
    setError("");
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setLoading(true);
    setError("");
    setMessage("");

    const payload = { ...form, kind };
    const res = await fetch(
      editingId ? `/api/finder/entries/${editingId}` : "/api/finder/entries",
      {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Speichern fehlgeschlagen.");
      return;
    }

    setMessage(editingId ? "Eintrag aktualisiert." : "Eintrag angelegt.");
    resetForm();
    await load();
  }

  async function remove(id: string) {
    if (!canEdit) return;
    if (!confirm("Eintrag wirklich löschen?")) return;
    const res = await fetch(`/api/finder/entries/${id}?kind=${kind}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Löschen fehlgeschlagen.");
      return;
    }
    if (editingId === id) resetForm();
    await load();
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
      {canEdit ? (
      <form onSubmit={onSubmit} className="panel space-y-3 p-5">
        <div>
          <h2 className="display text-2xl font-semibold text-ink">
            {editingId ? "Eintrag bearbeiten" : `${title} anlegen`}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            PLZ wird automatisch geocodiert für die Nähe-Suche.
          </p>
        </div>

        <label>
          <span className="label">Name *</span>
          <input
            className="field"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          <span className="label">Firma</span>
          <input
            className="field"
            value={form.company}
            onChange={(e) => setForm({ ...form, company: e.target.value })}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="label">PLZ *</span>
            <input
              className="field"
              required
              inputMode="numeric"
              maxLength={5}
              value={form.plz}
              onChange={(e) =>
                setForm({
                  ...form,
                  plz: e.target.value.replace(/\D/g, "").slice(0, 5),
                })
              }
            />
          </label>
          <label>
            <span className="label">Ort</span>
            <input
              className="field"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              placeholder="optional, sonst aus PLZ"
            />
          </label>
        </div>
        <label>
          <span className="label">Straße</span>
          <input
            className="field"
            value={form.street}
            onChange={(e) => setForm({ ...form, street: e.target.value })}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="label">Telefon</span>
            <input
              className="field"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </label>
          <label>
            <span className="label">E-Mail</span>
            <input
              className="field"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
        </div>
        <label>
          <span className="label">Notiz</span>
          <textarea
            className="field min-h-24"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          <span className="text-sm font-semibold">Aktiv (in Suche sichtbar)</span>
        </label>

        {error && <p className="text-sm font-semibold text-red-800">{error}</p>}
        {message && <p className="text-sm font-semibold text-fire">{message}</p>}

        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn btn-primary" disabled={loading}>
            <Plus size={16} />
            {loading ? "Speichere…" : editingId ? "Speichern" : "Anlegen"}
          </button>
          {editingId && (
            <button type="button" className="btn btn-ghost" onClick={resetForm}>
              Abbrechen
            </button>
          )}
        </div>
      </form>
      ) : (
        <div className="panel space-y-3 p-5">
          <h2 className="display text-2xl font-semibold text-ink">Nur Ansicht</h2>
          <p className="text-sm text-ink-soft">
            Anlegen und Ändern der Datenbank ist gesperrt. Freischaltung über die Sidebar.
          </p>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="display text-2xl font-semibold text-ink">
          {title}-Datenbank ({items.length})
        </h2>
        {items.length === 0 ? (
          <div className="panel p-6 text-ink-soft">Noch keine Einträge.</div>
        ) : (
          items.map((item) => (
            <article key={item.id} className="panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-ink">{item.name}</h3>
                  <p className="text-sm text-ink-soft">
                    {item.company ? `${item.company} · ` : ""}
                    {item.plz} {item.city}
                    {!item.active ? " · inaktiv" : ""}
                  </p>
                  {(item.phone || item.email) && (
                    <p className="mt-1 text-sm text-ink-soft">
                      {[item.phone, item.email].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {canEdit ? (
                    <>
                  <button
                    type="button"
                    className="btn btn-ghost !px-3 !py-2"
                    onClick={() => startEdit(item)}
                    aria-label="Bearbeiten"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost !px-3 !py-2"
                    onClick={() => remove(item.id)}
                    aria-label="Löschen"
                  >
                    <Trash2 size={16} />
                  </button>
                    </>
                  ) : null}
                </div>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
