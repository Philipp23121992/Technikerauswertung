"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditAccess } from "@/components/EditAccessProvider";
import { useTracker } from "@/components/TrackerProvider";
import { createId } from "@/lib/id";
import { PARTNER_TECH_ID } from "@/lib/ticket-import";
import {
  createMember,
  createNegotiation,
  createNegotiationUpdate,
  createReview,
  formatDateDe,
  formatDateTimeDe,
  MEMBER_FILE_KIND_LABELS,
  MEMBER_FILE_KINDS,
  NEGOTIATION_STATUS_LABELS,
  NEGOTIATION_STATUSES,
  REVIEW_TYPE_LABELS,
  REVIEW_TYPES,
  type EmployeeReview,
  type MemberFileKind,
  type NegotiationStatus,
  type ReviewType,
  type SalaryNegotiation,
  type TeamDocument,
  type TeamMember,
} from "@/lib/technikerverwaltung/types";

type DetailTab = "uebersicht" | "gehalt" | "gespraeche" | "dateien";

const MAX_DOC_BYTES = 2.5 * 1024 * 1024;

function sortMembers(members: TeamMember[]): TeamMember[] {
  return [...members].sort(
    (a, b) => a.order - b.order || a.name.localeCompare(b.name, "de"),
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

async function fileToDocument(file: File): Promise<TeamDocument> {
  if (file.size > MAX_DOC_BYTES) {
    throw new Error(`Datei „${file.name}“ ist zu groß (max. 2,5 MB).`);
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
  return {
    id: createId("tdoc"),
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    dataUrl,
    createdAt: new Date().toISOString(),
  };
}

export function TechnikerverwaltungPage() {
  const { canEdit } = useEditAccess();
  const { technicians, ready: trackerReady } = useTracker();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("uebersicht");
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState({
    name: "",
    roleLabel: "Fieldservicetechniker",
    email: "",
    currentSalary: "",
    copyFromId: "",
  });
  const [negDraft, setNegDraft] = useState({
    date: "",
    currentSalary: "",
    requestedSalary: "",
    resultSalary: "",
    status: "offen" as NegotiationStatus,
    notes: "",
  });
  const [negUpdateDrafts, setNegUpdateDrafts] = useState<Record<string, string>>({});
  const [reviewDraft, setReviewDraft] = useState({
    date: "",
    type: "jahresgespraech" as ReviewType,
    summary: "",
  });
  const [fileKind, setFileKind] = useState<MemberFileKind>("arbeitsvertrag");
  const [uploading, setUploading] = useState(false);

  const membersRef = useRef<TeamMember[]>([]);
  const persistTimer = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingReviewId = useRef<string | null>(null);

  useEffect(() => {
    membersRef.current = members;
  }, [members]);

  const selectableTechnicians = useMemo(
    () =>
      [...technicians]
        .filter((tech) => tech.id !== PARTNER_TECH_ID)
        .sort((a, b) => a.name.localeCompare(b.name, "de")),
    [technicians],
  );

  const missingFromAuswertung = useMemo(() => {
    const existing = new Set(
      members.map((member) => member.name.trim().toLowerCase()).filter(Boolean),
    );
    return selectableTechnicians.filter(
      (tech) => !existing.has(tech.name.trim().toLowerCase()),
    );
  }, [members, selectableTechnicians]);

  const roleLabelFor = useCallback((role: string) => {
    if (role === "fieldservice") return "Fieldservicetechniker";
    if (role === "onsite") return "Onsite";
    if (role === "partner") return "Partner";
    if (role === "ausser_wertung") return "Außer Wertung";
    return role;
  }, []);

  const persist = useCallback(
    async (next: TeamMember[]) => {
      if (!canEdit) {
        setError("Schreibzugriff gesperrt.");
        return false;
      }
      setError(null);
      try {
        const res = await fetch("/api/technikerverwaltung", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ members: next }),
        });
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) throw new Error(data?.error || "Speichern fehlgeschlagen.");
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
        return false;
      }
    },
    [canEdit],
  );

  const commit = useCallback(
    (next: TeamMember[], options?: { immediate?: boolean }) => {
      membersRef.current = next;
      setMembers(next);
      if (!canEdit) return;
      if (persistTimer.current) window.clearTimeout(persistTimer.current);
      if (options?.immediate) {
        void persist(next);
        return;
      }
      persistTimer.current = window.setTimeout(() => {
        void persist(membersRef.current);
      }, 400);
    },
    [canEdit, persist],
  );

  useEffect(() => {
    return () => {
      if (persistTimer.current) window.clearTimeout(persistTimer.current);
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/technikerverwaltung", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => null)) as {
        members?: TeamMember[];
        error?: string;
      } | null;
      if (!res.ok) throw new Error(data?.error || "Team konnte nicht geladen werden.");
      const list = Array.isArray(data?.members) ? data.members : [];
      membersRef.current = list;
      setMembers(list);
      setSelectedId((current) => {
        if (current && list.some((item) => item.id === current)) return current;
        return sortMembers(list.filter((item) => item.active))[0]?.id ?? list[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Laden fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sortMembers(
      members.filter((member) => {
        if (!member.active) return false;
        if (!needle) return true;
        return `${member.name} ${member.roleLabel} ${member.email} ${member.location}`
          .toLowerCase()
          .includes(needle);
      }),
    );
  }, [members, query]);

  const selected = useMemo(
    () => members.find((member) => member.id === selectedId) ?? null,
    [members, selectedId],
  );

  useEffect(() => {
    if (!selectedId) return;
    if (visible.some((member) => member.id === selectedId)) return;
    setSelectedId(visible[0]?.id ?? null);
  }, [visible, selectedId]);

  function updateSelected(
    mutator: (member: TeamMember) => TeamMember,
    immediate = false,
  ) {
    if (!selected) return;
    const next = membersRef.current.map((member) =>
      member.id === selected.id
        ? mutator({ ...member, updatedAt: new Date().toISOString() })
        : member,
    );
    commit(next, { immediate });
  }

  function openCreate() {
    if (!canEdit) {
      setError("Schreibzugriff gesperrt.");
      return;
    }
    setCreateDraft({
      name: "",
      roleLabel: "Fieldservicetechniker",
      email: "",
      currentSalary: "",
      copyFromId: "",
    });
    setCreateOpen(true);
  }

  function submitCreate() {
    const name = createDraft.name.trim();
    if (!name) {
      setError("Name ist erforderlich.");
      return;
    }
    const maxOrder = membersRef.current.reduce(
      (max, member) => Math.max(max, member.order),
      0,
    );
    // Nur Kopie der Stammdaten – kein Live-Link zur Auswertung
    const member = createMember({
      name,
      roleLabel: createDraft.roleLabel,
      email: createDraft.email,
      currentSalary: createDraft.currentSalary,
      technicianId: null,
      order: maxOrder + 1,
    });
    commit([member, ...membersRef.current], { immediate: true });
    setCreateOpen(false);
    setSelectedId(member.id);
    setDetailTab("uebersicht");
    setMessage("Mitarbeiter angelegt (unabhängig von der Auswertung).");
  }

  function importFromAuswertung() {
    if (!canEdit) {
      setError("Schreibzugriff gesperrt.");
      return;
    }
    if (missingFromAuswertung.length === 0) {
      setMessage("Alle Techniker-Namen aus der Auswertung sind bereits übernommen.");
      return;
    }
    const maxOrder = membersRef.current.reduce(
      (max, member) => Math.max(max, member.order),
      0,
    );
    const imported = missingFromAuswertung.map((tech, index) =>
      createMember({
        name: tech.name,
        roleLabel: roleLabelFor(tech.role),
        email: tech.email ?? "",
        technicianId: null,
        order: maxOrder + index + 1,
      }),
    );
    commit([...imported, ...membersRef.current], { immediate: true });
    setSelectedId(imported[0]?.id ?? selectedId);
    setMessage(
      `${imported.length} Techniker aus der Auswertung übernommen – Daten bleiben unabhängig.`,
    );
  }

  function addNegotiation() {
    if (!selected || !canEdit) return;
    const negotiation = createNegotiation({
      date: negDraft.date || new Date().toISOString().slice(0, 10),
      currentSalary: negDraft.currentSalary || selected.currentSalary,
      requestedSalary: negDraft.requestedSalary,
      resultSalary: negDraft.resultSalary,
      status: negDraft.status,
      notes: negDraft.notes,
    });
    updateSelected(
      (member) => ({
        ...member,
        negotiations: [negotiation, ...member.negotiations],
        currentSalary:
          negotiation.status === "genehmigt" && negotiation.resultSalary.trim()
            ? negotiation.resultSalary.trim()
            : member.currentSalary,
      }),
      true,
    );
    setNegDraft({
      date: "",
      currentSalary: "",
      requestedSalary: "",
      resultSalary: "",
      status: "offen",
      notes: "",
    });
    setMessage("Gehaltsverhandlung erfasst.");
  }

  function setNegotiationStatus(negotiationId: string, status: NegotiationStatus) {
    if (!selected || !canEdit) return;
    updateSelected(
      (member) => {
        const negotiation = member.negotiations.find((entry) => entry.id === negotiationId);
        if (!negotiation) return member;
        return {
          ...member,
          negotiations: member.negotiations.map((entry) =>
            entry.id === negotiationId ? { ...entry, status } : entry,
          ),
          currentSalary:
            status === "genehmigt" && negotiation.resultSalary.trim()
              ? negotiation.resultSalary.trim()
              : member.currentSalary,
        };
      },
      true,
    );
    setMessage(`Status auf „${NEGOTIATION_STATUS_LABELS[status]}“ gesetzt.`);
  }

  function addNegotiationUpdate(negotiationId: string) {
    if (!selected || !canEdit) return;
    const text = (negUpdateDrafts[negotiationId] ?? "").trim();
    if (!text) {
      setError("Update-Text ist erforderlich.");
      return;
    }
    const update = createNegotiationUpdate(text);
    updateSelected(
      (member) => ({
        ...member,
        negotiations: member.negotiations.map((entry) =>
          entry.id === negotiationId
            ? { ...entry, updates: [update, ...(entry.updates ?? [])] }
            : entry,
        ),
      }),
      true,
    );
    setNegUpdateDrafts((current) => ({ ...current, [negotiationId]: "" }));
    setMessage("Update zur Verhandlung gespeichert.");
  }

  function addReview() {
    if (!selected || !canEdit) return;
    const review = createReview({
      date: reviewDraft.date || new Date().toISOString().slice(0, 10),
      type: reviewDraft.type,
      summary: reviewDraft.summary,
    });
    updateSelected(
      (member) => ({
        ...member,
        reviews: [review, ...member.reviews],
      }),
      true,
    );
    setReviewDraft({
      date: "",
      type: "jahresgespraech",
      summary: "",
    });
    setMessage("Mitarbeitergespräch erfasst.");
  }

  async function uploadMemberFiles(memberId: string, fileList: FileList | null) {
    if (!canEdit || !fileList?.length) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("kind", fileKind);
      for (const file of Array.from(fileList)) form.append("file", file);
      const res = await fetch(
        `/api/technikerverwaltung/${encodeURIComponent(memberId)}/files`,
        { method: "POST", credentials: "same-origin", body: form },
      );
      const data = (await res.json().catch(() => null)) as {
        member?: TeamMember;
        error?: string;
      } | null;
      if (!res.ok || !data?.member) {
        throw new Error(data?.error || "Upload fehlgeschlagen.");
      }
      const next = membersRef.current.map((item) =>
        item.id === data.member?.id
          ? {
              ...item,
              files: data.member.files ?? item.files,
              updatedAt: data.member.updatedAt,
            }
          : item,
      );
      membersRef.current = next;
      setMembers(next);
      setMessage(
        fileList.length === 1 ? "Datei hinterlegt." : `${fileList.length} Dateien hinterlegt.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload fehlgeschlagen.");
    } finally {
      setUploading(false);
    }
  }

  function pickMemberFiles(memberId: string) {
    if (!canEdit) return;
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.onchange = () => void uploadMemberFiles(memberId, input.files);
    input.click();
  }

  async function removeMemberFile(memberId: string, fileId: string, fileName: string) {
    if (!canEdit) return;
    if (!window.confirm(`Datei „${fileName}“ entfernen?`)) return;
    setError(null);
    try {
      const res = await fetch(
        `/api/technikerverwaltung/${encodeURIComponent(memberId)}/files/${encodeURIComponent(fileId)}`,
        { method: "DELETE", credentials: "same-origin" },
      );
      const data = (await res.json().catch(() => null)) as {
        member?: TeamMember;
        error?: string;
      } | null;
      if (!res.ok || !data?.member) {
        throw new Error(data?.error || "Datei konnte nicht entfernt werden.");
      }
      const next = membersRef.current.map((item) =>
        item.id === data.member?.id
          ? {
              ...item,
              files: data.member.files ?? item.files,
              updatedAt: data.member.updatedAt,
            }
          : item,
      );
      membersRef.current = next;
      setMembers(next);
      setMessage("Datei entfernt.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Datei konnte nicht entfernt werden.");
    }
  }

  function requestAttach(reviewId: string) {
    if (!canEdit) return;
    pendingReviewId.current = reviewId;
    fileInputRef.current?.click();
  }

  async function onFilesSelected(files: FileList | null) {
    const reviewId = pendingReviewId.current;
    pendingReviewId.current = null;
    if (!reviewId || !files?.length || !selected) return;
    try {
      const docs: TeamDocument[] = [];
      for (const file of Array.from(files)) {
        docs.push(await fileToDocument(file));
      }
      updateSelected(
        (member) => ({
          ...member,
          reviews: member.reviews.map((review) =>
            review.id === reviewId
              ? { ...review, documents: [...review.documents, ...docs] }
              : review,
          ),
        }),
        true,
      );
      setMessage(`${docs.length} Protokoll-Datei(en) angehängt.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload fehlgeschlagen.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (!trackerReady && loading) {
    return (
      <div className="page-panel">
        <div className="tracker-loading">Lade Technikerverwaltung…</div>
      </div>
    );
  }

  return (
    <div className="page-panel tv-page">
      <header className="section-header">
        <div>
          <h1>Technikerverwaltung</h1>
          <p>Team verwalten: Gehalt, Dateien, Verhandlungen und Mitarbeitergespräche</p>
          <p className="muted-meta">
            Namen können aus der Auswertung übernommen werden – Speichern und Löschen
            bleiben komplett getrennt.
          </p>
        </div>
        <div className="tv-header-actions">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!canEdit || missingFromAuswertung.length === 0}
            onClick={importFromAuswertung}
            title={
              missingFromAuswertung.length === 0
                ? "Alle Namen aus der Auswertung sind bereits übernommen"
                : `${missingFromAuswertung.length} Namen aus der Auswertung übernehmen`
            }
          >
            Aus Auswertung übernehmen
            {missingFromAuswertung.length > 0
              ? ` (${missingFromAuswertung.length})`
              : ""}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canEdit}
            onClick={openCreate}
          >
            + Mitarbeiter
          </button>
        </div>
      </header>

      <div className="tv-toolbar">
        <label className="tv-search">
          <span className="sr-only">Suche</span>
          <input
            type="search"
            placeholder="Team durchsuchen…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>

      {error ? <p className="tv-banner is-error">{error}</p> : null}
      {message ? <p className="tv-banner is-ok">{message}</p> : null}

      {loading ? (
        <p className="muted-meta">Lade Team…</p>
      ) : (
        <div className="tv-layout">
          <aside className="tv-list" aria-label="Team">
            {visible.length === 0 ? (
              <p className="muted-meta">Noch keine Mitarbeiter angelegt.</p>
            ) : (
              visible.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  className={`tv-list-item ${selectedId === member.id ? "is-active" : ""}`}
                  onClick={() => {
                    setSelectedId(member.id);
                    setDetailTab("uebersicht");
                    setMessage(null);
                  }}
                >
                  <strong>{member.name}</strong>
                  <span>{member.roleLabel || "Ohne Rolle"}</span>
                  <span className="tv-list-meta">
                    {member.location?.trim() ? `${member.location.trim()} · ` : ""}
                    Gehalt: {member.currentSalary.trim() || "—"} ·{" "}
                    {member.reviews.length} Gespräch
                    {member.reviews.length === 1 ? "" : "e"}
                    {" · "}
                    {(member.files ?? []).length} Datei
                    {(member.files ?? []).length === 1 ? "" : "en"}
                  </span>
                </button>
              ))
            )}
          </aside>

          <section className="tv-detail">
            {!selected ? (
              <div className="content-card">
                <p className="muted-meta">
                  Wähle einen Mitarbeiter oder lege einen neuen an.
                </p>
              </div>
            ) : (
              <>
                <div className="tv-detail-head">
                  <div>
                    <h2>{selected.name}</h2>
                    <p className="muted-meta">
                      {selected.roleLabel || "Ohne Rolle"}
                      {selected.location?.trim() ? ` · ${selected.location.trim()}` : ""}
                      {selected.email ? ` · ${selected.email}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-link-danger"
                    disabled={!canEdit}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `„${selected.name}“ nur aus der Technikerverwaltung entfernen?\n\nDie Technikerauswertung bleibt unverändert.`,
                        )
                      ) {
                        return;
                      }
                      commit(
                        membersRef.current.filter((item) => item.id !== selected.id),
                        { immediate: true },
                      );
                      setSelectedId(null);
                      setMessage(
                        "Nur in der Technikerverwaltung entfernt – Auswertung unverändert.",
                      );
                    }}
                  >
                    Entfernen
                  </button>
                </div>

                <div className="soft-tabs" role="tablist">
                  {(
                    [
                      ["uebersicht", "Übersicht"],
                      ["gehalt", "Gehalt & Verhandlung"],
                      ["gespraeche", "Mitarbeitergespräche"],
                      ["dateien", "Dateien"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={`soft-tab ${detailTab === id ? "is-active" : ""}`}
                      onClick={() => setDetailTab(id)}
                    >
                      {id === "dateien" && (selected.files?.length ?? 0) > 0
                        ? `${label} (${selected.files.length})`
                        : label}
                    </button>
                  ))}
                </div>

                {detailTab === "uebersicht" ? (
                  <div className="tv-panel">
                    <div className="tv-fields">
                      <label>
                        <span>Name</span>
                        <input
                          value={selected.name}
                          disabled={!canEdit}
                          onChange={(event) =>
                            updateSelected((member) => ({
                              ...member,
                              name: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        <span>Rolle / Funktion</span>
                        <input
                          value={selected.roleLabel}
                          disabled={!canEdit}
                          placeholder="z.B. Fieldservicetechniker"
                          onChange={(event) =>
                            updateSelected((member) => ({
                              ...member,
                              roleLabel: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        <span>E-Mail</span>
                        <input
                          type="email"
                          value={selected.email}
                          disabled={!canEdit}
                          onChange={(event) =>
                            updateSelected((member) => ({
                              ...member,
                              email: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        <span>Standort</span>
                        <input
                          value={selected.location ?? ""}
                          disabled={!canEdit}
                          placeholder="z.B. München, Hamburg, Remote…"
                          onChange={(event) =>
                            updateSelected((member) => ({
                              ...member,
                              location: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        <span>Eintrittsdatum</span>
                        <input
                          type="date"
                          value={selected.startDate ?? ""}
                          disabled={!canEdit}
                          onChange={(event) =>
                            updateSelected(
                              (member) => ({
                                ...member,
                                startDate: event.target.value || null,
                              }),
                              true,
                            )
                          }
                        />
                      </label>
                      <label>
                        <span>Aktuelles Gehalt</span>
                        <input
                          value={selected.currentSalary}
                          disabled={!canEdit}
                          placeholder="z.B. 3.850 €"
                          onChange={(event) =>
                            updateSelected((member) => ({
                              ...member,
                              currentSalary: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="full">
                        <span>Notizen</span>
                        <textarea
                          rows={3}
                          value={selected.notes}
                          disabled={!canEdit}
                          placeholder="Interne Notizen als technischer Leiter…"
                          onChange={(event) =>
                            updateSelected((member) => ({
                              ...member,
                              notes: event.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>
                  </div>
                ) : null}

                {detailTab === "gehalt" ? (
                  <div className="tv-panel">
                    <div className="tv-kpi-row">
                      <article className="tv-kpi">
                        <p>Aktuelles Gehalt</p>
                        <strong>{selected.currentSalary.trim() || "—"}</strong>
                      </article>
                      <article className="tv-kpi">
                        <p>Verhandlungen</p>
                        <strong>{selected.negotiations.length}</strong>
                      </article>
                    </div>

                    <div className="tv-compose">
                      <h3>Neue Gehaltsverhandlung</h3>
                      <div className="tv-fields">
                        <label>
                          <span>Datum</span>
                          <input
                            type="date"
                            value={negDraft.date}
                            disabled={!canEdit}
                            onChange={(event) =>
                              setNegDraft((current) => ({
                                ...current,
                                date: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>Status</span>
                          <select
                            value={negDraft.status}
                            disabled={!canEdit}
                            onChange={(event) =>
                              setNegDraft((current) => ({
                                ...current,
                                status: event.target.value as NegotiationStatus,
                              }))
                            }
                          >
                            {NEGOTIATION_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {NEGOTIATION_STATUS_LABELS[status]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Aktuell</span>
                          <input
                            value={negDraft.currentSalary}
                            disabled={!canEdit}
                            placeholder={selected.currentSalary || "z.B. 3.850 €"}
                            onChange={(event) =>
                              setNegDraft((current) => ({
                                ...current,
                                currentSalary: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>Gewünscht</span>
                          <input
                            value={negDraft.requestedSalary}
                            disabled={!canEdit}
                            placeholder="z.B. 4.100 €"
                            onChange={(event) =>
                              setNegDraft((current) => ({
                                ...current,
                                requestedSalary: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>Ergebnis</span>
                          <input
                            value={negDraft.resultSalary}
                            disabled={!canEdit}
                            placeholder="nach Abschluss"
                            onChange={(event) =>
                              setNegDraft((current) => ({
                                ...current,
                                resultSalary: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label className="full">
                          <span>Notizen</span>
                          <textarea
                            rows={2}
                            value={negDraft.notes}
                            disabled={!canEdit}
                            onChange={(event) =>
                              setNegDraft((current) => ({
                                ...current,
                                notes: event.target.value,
                              }))
                            }
                          />
                        </label>
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={!canEdit}
                        onClick={addNegotiation}
                      >
                        Verhandlung speichern
                      </button>
                    </div>

                    {selected.negotiations.length === 0 ? (
                      <p className="muted-meta">Noch keine Gehaltsverhandlungen.</p>
                    ) : (
                      <ul className="tv-history">
                        {selected.negotiations.map((item: SalaryNegotiation) => {
                          const isRunning =
                            item.status === "offen" || item.status === "warten";
                          const draftText = negUpdateDrafts[item.id] ?? "";
                          return (
                            <li key={item.id}>
                              <div className="tv-history-head">
                                <strong>{formatDateDe(item.date)}</strong>
                                {canEdit ? (
                                  <label className="tv-neg-status">
                                    <span className="sr-only">Status</span>
                                    <select
                                      value={item.status}
                                      onChange={(event) =>
                                        setNegotiationStatus(
                                          item.id,
                                          event.target.value as NegotiationStatus,
                                        )
                                      }
                                    >
                                      {NEGOTIATION_STATUSES.map((status) => (
                                        <option key={status} value={status}>
                                          {NEGOTIATION_STATUS_LABELS[status]}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                ) : (
                                  <span>{NEGOTIATION_STATUS_LABELS[item.status]}</span>
                                )}
                                {item.updates?.length > 0 ? (
                                  <span className="muted-meta">
                                    {item.updates.length} Update
                                    {item.updates.length === 1 ? "" : "s"}
                                  </span>
                                ) : null}
                              </div>
                              <p>
                                Aktuell {item.currentSalary || "—"} · Gewünscht{" "}
                                {item.requestedSalary || "—"} · Ergebnis{" "}
                                {item.resultSalary || "—"}
                              </p>
                              {item.notes ? (
                                <p className="tv-history-note">{item.notes}</p>
                              ) : null}

                              <div className="tv-neg-updates">
                                <div className="tv-neg-updates-head">
                                  <strong>Updates</strong>
                                  {isRunning ? (
                                    <span className="muted-meta">laufende Verhandlung</span>
                                  ) : null}
                                </div>
                                {canEdit ? (
                                  <div className="tv-neg-update-compose">
                                    <textarea
                                      rows={2}
                                      placeholder="Update zur Verhandlung schreiben…"
                                      value={draftText}
                                      onChange={(event) =>
                                        setNegUpdateDrafts((current) => ({
                                          ...current,
                                          [item.id]: event.target.value,
                                        }))
                                      }
                                    />
                                    <button
                                      type="button"
                                      className="btn btn-secondary"
                                      disabled={!draftText.trim()}
                                      onClick={() => addNegotiationUpdate(item.id)}
                                    >
                                      Update speichern
                                    </button>
                                  </div>
                                ) : null}
                                {!(item.updates?.length > 0) ? (
                                  <p className="muted-meta">Noch keine Updates.</p>
                                ) : (
                                  <ul className="tv-neg-update-list">
                                    {(item.updates ?? []).map((entry) => (
                                      <li key={entry.id}>
                                        <div className="tv-neg-update-meta">
                                          <span>{formatDateTimeDe(entry.createdAt)}</span>
                                        </div>
                                        <p>{entry.text}</p>
                                        {canEdit ? (
                                          <button
                                            type="button"
                                            className="tv-remove-link"
                                            onClick={() =>
                                              updateSelected(
                                                (member) => ({
                                                  ...member,
                                                  negotiations: member.negotiations.map(
                                                    (neg) =>
                                                      neg.id === item.id
                                                        ? {
                                                            ...neg,
                                                            updates: (neg.updates ?? []).filter(
                                                              (u) => u.id !== entry.id,
                                                            ),
                                                          }
                                                        : neg,
                                                  ),
                                                }),
                                                true,
                                              )
                                            }
                                          >
                                            Update entfernen
                                          </button>
                                        ) : null}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>

                              {canEdit ? (
                                <button
                                  type="button"
                                  className="tv-remove-link"
                                  onClick={() =>
                                    updateSelected(
                                      (member) => ({
                                        ...member,
                                        negotiations: member.negotiations.filter(
                                          (entry) => entry.id !== item.id,
                                        ),
                                      }),
                                      true,
                                    )
                                  }
                                >
                                  Verhandlung entfernen
                                </button>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                ) : null}

                {detailTab === "gespraeche" ? (
                  <div className="tv-panel">
                    <div className="tv-compose">
                      <h3>Neues Mitarbeitergespräch</h3>
                      <div className="tv-fields">
                        <label>
                          <span>Datum</span>
                          <input
                            type="date"
                            value={reviewDraft.date}
                            disabled={!canEdit}
                            onChange={(event) =>
                              setReviewDraft((current) => ({
                                ...current,
                                date: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>Art</span>
                          <select
                            value={reviewDraft.type}
                            disabled={!canEdit}
                            onChange={(event) =>
                              setReviewDraft((current) => ({
                                ...current,
                                type: event.target.value as ReviewType,
                              }))
                            }
                          >
                            {REVIEW_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {REVIEW_TYPE_LABELS[type]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="full">
                          <span>Zusammenfassung</span>
                          <textarea
                            rows={3}
                            value={reviewDraft.summary}
                            disabled={!canEdit}
                            placeholder="Ergebnisse, Ziele, Vereinbarungen…"
                            onChange={(event) =>
                              setReviewDraft((current) => ({
                                ...current,
                                summary: event.target.value,
                              }))
                            }
                          />
                        </label>
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={!canEdit}
                        onClick={addReview}
                      >
                        Gespräch speichern
                      </button>
                    </div>

                    {selected.reviews.length === 0 ? (
                      <p className="muted-meta">Noch keine Mitarbeitergespräche.</p>
                    ) : (
                      <ul className="tv-history">
                        {selected.reviews.map((review: EmployeeReview) => (
                          <li key={review.id}>
                            <div className="tv-history-head">
                              <strong>
                                {REVIEW_TYPE_LABELS[review.type]} ·{" "}
                                {formatDateDe(review.date)}
                              </strong>
                            </div>
                            {review.summary ? (
                              <p className="tv-history-note">{review.summary}</p>
                            ) : (
                              <p className="muted-meta">Keine Zusammenfassung.</p>
                            )}
                            <div className="tv-docs">
                              <div className="tv-docs-head">
                                <span>Protokolle &amp; Dateien</span>
                                <button
                                  type="button"
                                  className="tv-link-btn"
                                  disabled={!canEdit}
                                  onClick={() => requestAttach(review.id)}
                                >
                                  + Datei hochladen
                                </button>
                              </div>
                              {review.documents.length === 0 ? (
                                <p className="muted-meta">Keine Dateien.</p>
                              ) : (
                                <ul className="tv-doc-list">
                                  {review.documents.map((doc) => (
                                    <li key={doc.id}>
                                      <a
                                        href={doc.dataUrl}
                                        download={doc.name}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        {doc.name}
                                      </a>
                                      {canEdit ? (
                                        <button
                                          type="button"
                                          className="tv-doc-remove"
                                          onClick={() =>
                                            updateSelected(
                                              (member) => ({
                                                ...member,
                                                reviews: member.reviews.map((entry) =>
                                                  entry.id === review.id
                                                    ? {
                                                        ...entry,
                                                        documents: entry.documents.filter(
                                                          (file) => file.id !== doc.id,
                                                        ),
                                                      }
                                                    : entry,
                                                ),
                                              }),
                                              true,
                                            )
                                          }
                                          aria-label={`${doc.name} entfernen`}
                                        >
                                          ×
                                        </button>
                                      ) : null}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            {canEdit ? (
                              <button
                                type="button"
                                className="tv-remove-link"
                                onClick={() =>
                                  updateSelected(
                                    (member) => ({
                                      ...member,
                                      reviews: member.reviews.filter(
                                        (entry) => entry.id !== review.id,
                                      ),
                                    }),
                                    true,
                                  )
                                }
                              >
                                Gespräch entfernen
                              </button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}

                {detailTab === "dateien" ? (
                  <div className="tv-panel">
                    <div className="tv-files-actions">
                      <label className="tv-file-kind">
                        <span>Art der Datei</span>
                        <select
                          value={fileKind}
                          disabled={!canEdit || uploading}
                          onChange={(event) =>
                            setFileKind(event.target.value as MemberFileKind)
                          }
                        >
                          {MEMBER_FILE_KINDS.map((kind) => (
                            <option key={kind} value={kind}>
                              {MEMBER_FILE_KIND_LABELS[kind]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={!canEdit || uploading}
                        onClick={() => pickMemberFiles(selected.id)}
                      >
                        {uploading ? "Lade hoch…" : "Dateien anhängen"}
                      </button>
                      <span className="muted-meta">
                        z.B. Arbeitsvertrag, Zusatzvereinbarung · PDF, Office, Bilder ·
                        max. 25 MB
                      </span>
                    </div>
                    {(selected.files ?? []).length === 0 ? (
                      <p className="muted-meta">
                        Noch keine Dateien bei diesem Mitarbeiter hinterlegt.
                      </p>
                    ) : (
                      <ul className="projekt-file-list">
                        {(selected.files ?? []).map((file) => (
                          <li key={file.id}>
                            <a
                              className="projekt-file-name"
                              href={`/api/technikerverwaltung/${encodeURIComponent(selected.id)}/files/${encodeURIComponent(file.id)}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {file.name}
                            </a>
                            <span className="tv-file-kind-badge">
                              {MEMBER_FILE_KIND_LABELS[file.kind] ?? "Sonstiges"}
                            </span>
                            <span className="muted-meta">
                              {formatFileSize(file.size)}
                              {file.uploadedBy ? ` · ${file.uploadedBy}` : ""}
                              {file.uploadedAt
                                ? ` · ${formatDateTimeDe(file.uploadedAt)}`
                                : ""}
                            </span>
                            {canEdit ? (
                              <button
                                type="button"
                                className="projekt-update-remove"
                                onClick={() =>
                                  void removeMemberFile(
                                    selected.id,
                                    file.id,
                                    file.name,
                                  )
                                }
                              >
                                Entfernen
                              </button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </>
            )}
          </section>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        className="sr-only"
        multiple
        accept="image/*,.pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
        onChange={(event) => void onFilesSelected(event.target.files)}
      />

      {createOpen ? (
        <div
          className="tv-modal-backdrop"
          role="presentation"
          onClick={() => setCreateOpen(false)}
        >
          <div
            className="tv-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tv-create-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="tv-modal-head">
              <h2 id="tv-create-title">Mitarbeiter anlegen</h2>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setCreateOpen(false)}
              >
                Schließen
              </button>
            </header>
            <div className="tv-modal-body">
              <div className="tv-fields">
                <label>
                  <span>Name aus Auswertung kopieren (optional)</span>
                  <select
                    value={createDraft.copyFromId}
                    onChange={(event) => {
                      const tech = selectableTechnicians.find(
                        (item) => item.id === event.target.value,
                      );
                      setCreateDraft((current) => ({
                        ...current,
                        copyFromId: event.target.value,
                        name: tech?.name ?? current.name,
                        email: tech?.email ?? current.email,
                        roleLabel: tech ? roleLabelFor(tech.role) : current.roleLabel,
                      }));
                    }}
                  >
                    <option value="">Manuell eingeben</option>
                    {selectableTechnicians.map((tech) => (
                      <option key={tech.id} value={tech.id}>
                        {tech.name}
                      </option>
                    ))}
                  </select>
                  <span className="muted-meta">
                    Nur Namens-/Rollenkopie – keine Verknüpfung zur Auswertung.
                  </span>
                </label>
                <label>
                  <span>Name</span>
                  <input
                    autoFocus
                    value={createDraft.name}
                    onChange={(event) =>
                      setCreateDraft((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>Rolle</span>
                  <input
                    value={createDraft.roleLabel}
                    onChange={(event) =>
                      setCreateDraft((current) => ({
                        ...current,
                        roleLabel: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>E-Mail</span>
                  <input
                    type="email"
                    value={createDraft.email}
                    onChange={(event) =>
                      setCreateDraft((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>Aktuelles Gehalt</span>
                  <input
                    value={createDraft.currentSalary}
                    placeholder="z.B. 3.850 €"
                    onChange={(event) =>
                      setCreateDraft((current) => ({
                        ...current,
                        currentSalary: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
            </div>
            <footer className="tv-modal-foot">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setCreateOpen(false)}
              >
                Abbrechen
              </button>
              <button type="button" className="btn btn-primary" onClick={submitCreate}>
                Anlegen
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
