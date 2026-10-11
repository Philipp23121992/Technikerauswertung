"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useEditAccess } from "@/components/EditAccessProvider";
import { useTracker } from "@/components/TrackerProvider";
import { UrlaubCsvImport } from "@/components/urlaube/UrlaubCsvImport";
import { PARTNER_TECH_ID } from "@/lib/ticket-import";
import type { UrlaubCsvAnalysis } from "@/lib/urlaube/csv-import";
import {
  buildMonthGrid,
  buildWeekBars,
  colorForApplicant,
  createVacationRequest,
  formatDateDe,
  monthLabelDe,
  overlapsMonth,
  parseVacationKindSelect,
  SERVICELEITUNG_NAMES,
  shortVacationLabel,
  vacationKindLabel,
  VACATION_KIND_OPTIONS,
  NO_REPRESENTATIVE,
  type UrlaubScope,
  type VacationKind,
  type VacationRequest,
} from "@/lib/urlaube/types";

type UrlaubPageProps = {
  scope: UrlaubScope;
  title: string;
  subtitle: string;
};

const WEEKDAYS = ["Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa.", "So."] as const;
const LANE_HEIGHT_REM = 1.55;
const WEEK_HEADER_OFFSET_REM = 1.55;
const WEEK_BOTTOM_PAD_REM = 0.45;

function currentMonthValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonthValue(value: string): { year: number; monthIndex: number } {
  const [y, m] = value.split("-").map(Number);
  return {
    year: Number.isFinite(y) ? y : new Date().getFullYear(),
    monthIndex: Number.isFinite(m) ? m - 1 : new Date().getMonth(),
  };
}

export function UrlaubPage({ scope, title, subtitle }: UrlaubPageProps) {
  const { canEdit } = useEditAccess();
  const { technicians, ready: trackerReady } = useTracker();

  const [requests, setRequests] = useState<VacationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [monthValue, setMonthValue] = useState(currentMonthValue);
  const [filterApplicant, setFilterApplicant] = useState("");

  const [draft, setDraft] = useState({
    dateFrom: "",
    dateTo: "",
    applicantName: "",
    representativeName: NO_REPRESENTATIVE,
    kind: "urlaub" as VacationKind,
    note: "",
  });

  const names = useMemo(() => {
    if (scope === "serviceleitung") {
      return [...SERVICELEITUNG_NAMES];
    }
    return [...technicians]
      .filter(
        (tech) =>
          tech.id !== PARTNER_TECH_ID &&
          tech.role !== "partner" &&
          tech.name.trim().length > 0,
      )
      .sort((a, b) => a.name.localeCompare(b.name, "de"))
      .map((tech) => tech.name);
  }, [scope, technicians]);

  const extraNames = useMemo(() => {
    const extras = new Set<string>();
    for (const item of requests) {
      if (item.scope !== scope) continue;
      extras.add(item.applicantName);
      extras.add(item.representativeName);
    }
    return [...extras]
      .filter(
        (name) =>
          name.trim().length > 0 &&
          name !== NO_REPRESENTATIVE &&
          !names.includes(name),
      )
      .sort((a, b) => a.localeCompare(b, "de"));
  }, [requests, scope, names]);

  const representativeOptions = useMemo(
    () => [
      NO_REPRESENTATIVE,
      ...names.filter((name) => name !== NO_REPRESENTATIVE),
      ...extraNames,
    ],
    [names, extraNames],
  );

  const filterNames = useMemo(
    () => [...names, ...extraNames],
    [names, extraNames],
  );

  const colorRoster = useMemo(
    () => [...new Set([...names, ...extraNames])],
    [names, extraNames],
  );

  const persist = useCallback(
    async (next: VacationRequest[]) => {
      if (!canEdit) {
        setError("Schreibzugriff gesperrt.");
        return false;
      }
      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/urlaube", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ requests: next }),
        });
        const data = (await res.json().catch(() => null)) as {
          requests?: VacationRequest[];
          error?: string;
        } | null;
        if (!res.ok) throw new Error(data?.error || "Speichern fehlgeschlagen.");
        setRequests(Array.isArray(data?.requests) ? data.requests : next);
        return true;
      } catch (err) {
        setError(
          err instanceof TypeError && /fetch/i.test(err.message)
            ? "Netzwerkfehler beim Speichern. Bitte erneut versuchen."
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
      const res = await fetch("/api/urlaube", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => null)) as {
        requests?: VacationRequest[];
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(data?.error || "Urlaube konnten nicht geladen werden.");
      }
      setRequests(Array.isArray(data?.requests) ? data.requests : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Laden fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const { year, monthIndex } = useMemo(
    () => parseMonthValue(monthValue),
    [monthValue],
  );

  const scoped = useMemo(
    () => requests.filter((item) => item.scope === scope),
    [requests, scope],
  );

  const monthRequests = useMemo(() => {
    const inMonth = scoped.filter((item) => overlapsMonth(item, year, monthIndex));
    const filtered = filterApplicant
      ? inMonth.filter((item) => item.applicantName === filterApplicant)
      : inMonth;
    return filtered.sort(
      (a, b) =>
        a.dateFrom.localeCompare(b.dateFrom) ||
        a.applicantName.localeCompare(b.applicantName, "de"),
    );
  }, [scoped, year, monthIndex, filterApplicant]);

  const weeks = useMemo(
    () => buildMonthGrid(year, monthIndex),
    [year, monthIndex],
  );

  const legend = useMemo(() => {
    const unique = [...new Set(monthRequests.map((item) => item.applicantName))];
    return unique.sort((a, b) => a.localeCompare(b, "de"));
  }, [monthRequests]);

  async function submitRequest() {
    if (!canEdit) {
      setError("Schreibzugriff gesperrt.");
      return;
    }
    if (!draft.dateFrom) {
      setError("Von-Datum ist erforderlich.");
      return;
    }
    const dateTo = draft.dateTo || draft.dateFrom;
    if (dateTo < draft.dateFrom) {
      setError("Bis-Datum darf nicht vor dem Von-Datum liegen.");
      return;
    }
    if (!draft.applicantName.trim()) {
      setError("Antragsteller ist erforderlich.");
      return;
    }
    const representativeName =
      draft.representativeName.trim() || NO_REPRESENTATIVE;
    if (draft.applicantName === representativeName) {
      setError("Antragsteller und Vertreter müssen unterschiedlich sein.");
      return;
    }

    const entry = createVacationRequest({
      scope,
      dateFrom: draft.dateFrom,
      dateTo,
      applicantName: draft.applicantName,
      representativeName,
      kind: draft.kind,
      note: scope === "serviceleitung" && draft.kind === "abwesend" ? draft.note : "",
    });

    const ok = await persist([entry, ...requests]);
    if (ok) {
      setDraft({
        dateFrom: "",
        dateTo: "",
        applicantName: "",
        representativeName: NO_REPRESENTATIVE,
        kind: "urlaub",
        note: "",
      });
      setMessage(`${vacationKindLabel(draft.kind)} gespeichert.`);
      setMonthValue(draft.dateFrom.slice(0, 7));
    }
  }

  async function importFromAnalysis(analysis: UrlaubCsvAnalysis) {
    if (scope !== "techniker") return false;
    const created = analysis.ready.map((row) =>
      createVacationRequest({
        scope: "techniker",
        dateFrom: row.dateFrom,
        dateTo: row.dateTo,
        applicantName: row.applicantName,
        representativeName: row.representativeName,
        kind: row.kind,
      }),
    );
    const ok = await persist([...created, ...requests]);
    if (ok) {
      setMessage(`${created.length} Einträge importiert.`);
      const first = created[0];
      if (first) setMonthValue(first.dateFrom.slice(0, 7));
    }
    return ok;
  }

  async function saveAbsenceNote(id: string, note: string) {
    const current = requests.find((item) => item.id === id);
    if (!current || current.kind !== "abwesend") return;
    const trimmed = note.trim();
    if (trimmed === (current.note ?? "").trim()) return;
    await persist(
      requests.map((item) =>
        item.id === id
          ? { ...item, note: trimmed, updatedAt: new Date().toISOString() }
          : item,
      ),
    );
  }

  async function removeRequest(id: string) {
    if (!canEdit) return;
    if (!window.confirm("Urlaubseintrag wirklich löschen?")) return;
    const ok = await persist(requests.filter((item) => item.id !== id));
    if (ok) setMessage("Urlaubseintrag entfernt.");
  }

  function shiftMonth(delta: number) {
    const next = new Date(year, monthIndex + delta, 1);
    setMonthValue(
      `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`,
    );
  }

  function goToday() {
    setMonthValue(currentMonthValue());
  }

  return (
    <div className="page-panel urlaub-page">
      <header className="section-header">
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {scope === "techniker" ? (
          <UrlaubCsvImport
            canEdit={canEdit}
            saving={saving}
            technicians={technicians.filter(
              (tech) =>
                tech.id !== PARTNER_TECH_ID &&
                tech.role !== "partner" &&
                tech.name.trim().length > 0,
            )}
            existing={scoped}
            onConfirm={importFromAnalysis}
          />
        ) : null}
      </header>

      {error ? <p className="urlaub-banner is-error">{error}</p> : null}
      {message ? <p className="urlaub-banner is-ok">{message}</p> : null}

      <section className="content-card urlaub-compose">
        <h2>Urlaubsantrag</h2>
        <div className="urlaub-fields">
          <label>
            <span>Von</span>
            <input
              type="date"
              value={draft.dateFrom}
              disabled={!canEdit || saving}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  dateFrom: event.target.value,
                  dateTo:
                    current.dateTo && current.dateTo < event.target.value
                      ? event.target.value
                      : current.dateTo,
                }))
              }
            />
          </label>
          <label>
            <span>Bis</span>
            <input
              type="date"
              value={draft.dateTo}
              disabled={!canEdit || saving}
              min={draft.dateFrom || undefined}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  dateTo: event.target.value,
                }))
              }
            />
            <small className="muted-meta">Leer = nur 1 Tag (gleich Von)</small>
          </label>
          <label>
            <span>Art</span>
            <select
              value={draft.kind}
              disabled={!canEdit || saving}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  kind: parseVacationKindSelect(event.target.value),
                  note:
                    parseVacationKindSelect(event.target.value) === "abwesend"
                      ? current.note
                      : "",
                }))
              }
            >
              {VACATION_KIND_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Antragsteller</span>
            <select
              value={draft.applicantName}
              disabled={!canEdit || saving || (scope === "techniker" && !trackerReady)}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  applicantName: event.target.value,
                }))
              }
            >
              <option value="">Bitte wählen</option>
              {names.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Vertreter</span>
            <select
              value={draft.representativeName || NO_REPRESENTATIVE}
              disabled={!canEdit || saving || (scope === "techniker" && !trackerReady)}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  representativeName: event.target.value || NO_REPRESENTATIVE,
                }))
              }
            >
              {representativeOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {scope === "serviceleitung" && draft.kind === "abwesend" ? (
          <label className="urlaub-note-field">
            <span>Notiz</span>
            <textarea
              value={draft.note}
              disabled={!canEdit || saving}
              rows={3}
              placeholder="Grund der Abwesenheit, z. B. Schulung…"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  note: event.target.value,
                }))
              }
            />
          </label>
        ) : null}
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canEdit || saving}
          onClick={() => void submitRequest()}
        >
          {saving ? "Speichern…" : "Antrag speichern"}
        </button>
      </section>

      <section className="content-card urlaub-calendar-card">
        <div className="urlaub-month-bar">
          <button type="button" className="btn btn-secondary" onClick={goToday}>
            Heute
          </button>
          <div className="urlaub-month-nav">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => shiftMonth(-1)}
              aria-label="Vorheriger Monat"
            >
              ‹
            </button>
            <label className="urlaub-month-picker">
              <span className="sr-only">Monat</span>
              <input
                type="month"
                value={monthValue}
                onChange={(event) => setMonthValue(event.target.value)}
              />
              <strong>{monthLabelDe(year, monthIndex)}</strong>
            </label>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => shiftMonth(1)}
              aria-label="Nächster Monat"
            >
              ›
            </button>
          </div>
          <label className="urlaub-filter-person">
            <span>Antragsteller</span>
            <select
              value={filterApplicant}
              onChange={(event) => setFilterApplicant(event.target.value)}
              aria-label="Antragsteller filtern"
            >
              <option value="">Alle</option>
              {filterNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <span className="urlaub-view-badge">Monat</span>
        </div>

        <h2>Kalender</h2>
        {loading ? (
          <p className="muted-meta">Lade Urlaube…</p>
        ) : (
          <>
            <div className="urlaub-month-grid" role="grid" aria-label="Monatskalender">
              <div className="urlaub-weekday-row">
                {WEEKDAYS.map((day) => (
                  <div key={day} className="urlaub-weekday">
                    {day}
                  </div>
                ))}
              </div>

              {weeks.map((week, weekIndex) => {
                const bars = buildWeekBars(week, monthRequests);
                const laneCount = bars.reduce(
                  (max, bar) => Math.max(max, bar.lane + 1),
                  0,
                );
                const contentHeight = Math.max(
                  5.5,
                  WEEK_HEADER_OFFSET_REM +
                    laneCount * LANE_HEIGHT_REM +
                    WEEK_BOTTOM_PAD_REM,
                );

                return (
                  <div
                    key={`week-${weekIndex}-${week[0]?.iso}`}
                    className="urlaub-week-row"
                    style={{ minHeight: `${contentHeight}rem` }}
                  >
                    <div className="urlaub-week-days">
                      {week.map((cell) => (
                          <div
                            key={cell.key}
                            className={[
                              "urlaub-day-cell",
                              cell.inMonth ? "" : "is-outside",
                              cell.isToday ? "is-today" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          >
                            <span className="urlaub-day-num">{cell.day}</span>
                          </div>
                      ))}
                    </div>

                    <div className="urlaub-week-bars" aria-hidden={bars.length === 0}>
                      {bars.map((bar) => {
                        const leftPct = ((bar.startCol - 1) / 7) * 100;
                        const widthPct = ((bar.endCol - bar.startCol + 1) / 7) * 100;
                        return (
                          <div
                            key={`${bar.request.id}-${weekIndex}-${bar.startCol}`}
                            className={[
                              "urlaub-cal-bar",
                              bar.request.kind === "ueberstunden" ? "is-overtime" : "",
                              bar.request.kind === "abwesend" ? "is-absent" : "",
                              bar.continuesBefore ? "continues-before" : "",
                              bar.continuesAfter ? "continues-after" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            style={{
                              left: `calc(${leftPct}% + 2px)`,
                              width: `calc(${widthPct}% - 4px)`,
                              top: `${WEEK_HEADER_OFFSET_REM + bar.lane * LANE_HEIGHT_REM}rem`,
                              background: colorForApplicant(
                                bar.request.applicantName,
                                scope,
                                colorRoster,
                              ),
                            }}
                            title={[
                              vacationKindLabel(bar.request.kind),
                              `${formatDateDe(bar.request.dateFrom)} – ${formatDateDe(bar.request.dateTo)}`,
                              `Vertretung: ${bar.request.representativeName}`,
                              bar.request.kind === "abwesend" && bar.request.note
                                ? `Notiz: ${bar.request.note}`
                                : "",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          >
                            <span className="urlaub-cal-flag" aria-hidden>
                              ▮
                            </span>
                            <span className="urlaub-cal-text">
                              {shortVacationLabel(
                                bar.request.applicantName,
                                bar.request.kind,
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {legend.length > 0 ? (
              <ul className="urlaub-legend">
                {legend.map((name) => (
                  <li key={name}>
                    <span
                      className="urlaub-legend-swatch"
                      style={{ background: colorForApplicant(name, scope, colorRoster) }}
                    />
                    {name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted-meta">
                Keine Urlaube in {monthLabelDe(year, monthIndex)}.
              </p>
            )}
          </>
        )}
      </section>

      <section className="content-card">
        <h2>Urlaube im Monat</h2>
        {loading ? (
          <p className="muted-meta">Lade Liste…</p>
        ) : monthRequests.length === 0 ? (
          <p className="muted-meta">Keine Einträge für diesen Monat.</p>
        ) : (
          <ul className="urlaub-list">
            {monthRequests.map((item) => (
              <li key={item.id}>
                <div className="urlaub-list-main">
                  <span
                    className="urlaub-legend-swatch"
                    style={{ background: colorForApplicant(item.applicantName, scope, colorRoster) }}
                  />
                  <div>
                    <strong>
                      {item.applicantName}{" "}
                      <span
                        className={[
                          "urlaub-kind-badge",
                          item.kind === "ueberstunden" ? "is-overtime" : "",
                          item.kind === "abwesend" ? "is-absent" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {vacationKindLabel(item.kind)}
                      </span>
                    </strong>
                    <p>
                      {formatDateDe(item.dateFrom)} – {formatDateDe(item.dateTo)}
                    </p>
                    <p className="muted-meta">
                      Vertreter: {item.representativeName}
                    </p>
                    {scope === "serviceleitung" && item.kind === "abwesend" ? (
                      canEdit ? (
                        <label className="urlaub-list-note">
                          <span>Notiz</span>
                          <textarea
                            defaultValue={item.note}
                            rows={2}
                            disabled={saving}
                            placeholder="Notiz zur Abwesenheit…"
                            onBlur={(event) =>
                              void saveAbsenceNote(item.id, event.target.value)
                            }
                          />
                        </label>
                      ) : item.note ? (
                        <p className="urlaub-list-note-text">{item.note}</p>
                      ) : null
                    ) : item.note ? (
                      <p className="urlaub-list-note-text">{item.note}</p>
                    ) : null}
                  </div>
                </div>
                {canEdit ? (
                  <button
                    type="button"
                    className="btn btn-link-danger"
                    disabled={saving}
                    onClick={() => void removeRequest(item.id)}
                  >
                    Löschen
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
