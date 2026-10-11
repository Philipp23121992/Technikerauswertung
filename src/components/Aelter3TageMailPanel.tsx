"use client";



import Link from "next/link";

import { useCallback, useEffect, useState } from "react";

import {

  AELTER_3_MAIL_TAB_LABELS,

  type Aelter3TageMailTab,

} from "@/lib/auswertung/aelter-3-tage-mail-types";



type MailTemplateForm = {

  tab: Aelter3TageMailTab;

  subject: string;

  body: string;

};



type MailPlan = {

  tab: Aelter3TageMailTab;

  tabLabel: string;

  referenceDate: string;

  ticketCount: number;

  recipients: {

    technicianName: string;

    email: string;

    ticketCount: number;

    subject: string;

    textPreview: string;

    memberId: string;

  }[];

  missing: {

    technicianName: string;

    ticketCount: number;

    reason: string;

    memberId: string | null;

    message: string;

  }[];

};



type Props = {

  tab: Aelter3TageMailTab;

  referenceDate: string;

  onlyOlder: boolean;

  canEdit: boolean;

};



export function Aelter3TageMailPanel({ tab, referenceDate, onlyOlder, canEdit }: Props) {

  const [allTemplates, setAllTemplates] = useState<MailTemplateForm[]>([]);

  const [plan, setPlan] = useState<MailPlan | null>(null);

  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());

  const [cc, setCc] = useState("");

  const [busy, setBusy] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [message, setMessage] = useState<string | null>(null);



  const current = allTemplates.find((item) => item.tab === tab);



  const loadTemplates = useCallback(async () => {

    const res = await fetch("/api/auswertung/aelter-3-tage/mail", { credentials: "same-origin" });

    const data = (await res.json().catch(() => null)) as { templates?: MailTemplateForm[] } | null;

    if (res.ok && data?.templates) {

      setAllTemplates(data.templates);

    }

  }, []);



  useEffect(() => {

    void loadTemplates();

  }, [loadTemplates]);



  useEffect(() => {

    setPlan(null);

    setSelectedMemberIds(new Set());

  }, [tab, referenceDate, onlyOlder]);



  function updateCurrent(field: "subject" | "body", value: string) {

    setAllTemplates((prev) =>

      prev.map((item) => (item.tab === tab ? { ...item, [field]: value } : item)),

    );

    setPlan(null);

    setSelectedMemberIds(new Set());

  }



  function applyPlan(next: MailPlan) {

    setPlan(next);

    setSelectedMemberIds(new Set(next.recipients.map((item) => item.memberId)));

  }



  function toggleMember(memberId: string, checked: boolean) {

    setSelectedMemberIds((prev) => {

      const next = new Set(prev);

      if (checked) next.add(memberId);

      else next.delete(memberId);

      return next;

    });

  }



  function toggleAllMembers(checked: boolean) {

    if (!plan) return;

    if (checked) {

      setSelectedMemberIds(new Set(plan.recipients.map((item) => item.memberId)));

    } else {

      setSelectedMemberIds(new Set());

    }

  }



  async function saveTemplates() {

    if (!canEdit) return;

    setBusy(true);

    setError(null);

    setMessage(null);

    try {

      const res = await fetch("/api/auswertung/aelter-3-tage/mail", {

        method: "PUT",

        credentials: "same-origin",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({ templates: allTemplates }),

      });

      const data = (await res.json().catch(() => null)) as { error?: string } | null;

      if (!res.ok) throw new Error(data?.error ?? "Speichern fehlgeschlagen.");

      setMessage("Textbausteine gespeichert.");

    } catch (err) {

      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");

    } finally {

      setBusy(false);

    }

  }



  async function runMail(send: boolean) {

    if (!canEdit) return;

    if (!current) return;

    if (send && plan && selectedMemberIds.size === 0) {

      setError("Bitte mindestens einen Techniker auswählen.");

      return;

    }

    setBusy(true);

    setError(null);

    setMessage(null);

    try {

      const res = await fetch("/api/auswertung/aelter-3-tage/mail", {

        method: "POST",

        credentials: "same-origin",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({

          tab,

          referenceDate,

          onlyOlder,

          subject: current.subject,

          bodyText: current.body,

          cc: cc.trim() || undefined,

          memberIds: send ? (plan ? [...selectedMemberIds] : undefined) : undefined,

          send,

        }),

      });

      const data = (await res.json().catch(() => null)) as {

        error?: string;

        plan?: MailPlan;

        sent?: number;

      } | null;

      if (!res.ok) throw new Error(data?.error ?? "Anfrage fehlgeschlagen.");

      if (send && data?.sent != null) {

        if (data.plan) applyPlan(data.plan);

        setMessage(`${data.sent} E-Mail(s) versendet${cc.trim() ? " (mit CC)" : ""}.`);

        return;

      }

      if (data?.plan) {

        applyPlan(data.plan);

        setMessage(null);

      }

    } catch (err) {

      setPlan(null);

      setSelectedMemberIds(new Set());

      setError(err instanceof Error ? err.message : "Anfrage fehlgeschlagen.");

    } finally {

      setBusy(false);

    }

  }



  if (!current) {

    return (

      <section className="content-card aelter-3-mail-panel">

        <p>Lade Textbausteine…</p>

      </section>

    );

  }



  const allSelected =

    plan != null &&

    plan.recipients.length > 0 &&

    plan.recipients.every((item) => selectedMemberIds.has(item.memberId));



  return (

    <section className="content-card aelter-3-mail-panel" aria-labelledby="aelter-3-mail-title">

      <h3 id="aelter-3-mail-title">E-Mail an Techniker · {AELTER_3_MAIL_TAB_LABELS[tab]}</h3>

      <p className="aelter-3-mail-hint">

        Empfänger nur aus der{" "}

        <Link href="/technikerverwaltung">Technikerverwaltung</Link>. Es werden die Tickets dieser

        Registerkarte verwendet{onlyOlder ? " (inkl. Filter „Nur > 3 AT“)" : ""}.

      </p>

      <p className="aelter-3-mail-vars">

        Platzhalter: <code>{"{{technicianName}}"}</code>, <code>{"{{ticketList}}"}</code>,{" "}

        <code>{"{{ticketCount}}"}</code>, <code>{"{{referenceDate}}"}</code>,{" "}

        <code>{"{{tabLabel}}"}</code>

      </p>



      <label className="aelter-3-mail-field">

        CC (optional)

        <input

          type="text"

          value={cc}

          disabled={!canEdit || busy}

          placeholder="cc@beispiel.de, weitere@…"

          onChange={(event) => setCc(event.target.value)}

        />

      </label>



      <label className="aelter-3-mail-field">

        Betreff

        <input

          type="text"

          value={current.subject}

          disabled={!canEdit || busy}

          onChange={(event) => updateCurrent("subject", event.target.value)}

        />

      </label>

      <label className="aelter-3-mail-field">

        Nachricht

        <textarea

          rows={10}

          value={current.body}

          disabled={!canEdit || busy}

          onChange={(event) => updateCurrent("body", event.target.value)}

        />

      </label>



      <div className="aelter-3-import-actions">

        <button

          type="button"

          className="btn btn-secondary"

          disabled={!canEdit || busy}

          onClick={() => void saveTemplates()}

        >

          Textbaustein speichern

        </button>

        <button

          type="button"

          className="btn btn-secondary"

          disabled={!canEdit || busy}

          onClick={() => void runMail(false)}

        >

          Vorschau

        </button>

        <button

          type="button"

          className="btn btn-primary"

          disabled={!canEdit || busy || (plan != null && selectedMemberIds.size === 0)}

          onClick={() => void runMail(true)}

        >

          {busy

            ? "Sende…"

            : plan

              ? `${selectedMemberIds.size} E-Mail(s) senden`

              : "E-Mails senden (alle)"}

        </button>

      </div>



      {error ? (

        <div className="error-banner aelter-3-mail-errors" role="alert">

          {error.split("\n").map((line) => (

            <p key={line}>{line}</p>

          ))}

        </div>

      ) : null}

      {message ? (

        <div className="success-banner" role="status">

          {message}

        </div>

      ) : null}



      {plan ? (

        <div className="aelter-3-mail-preview">

          <h4>

            Vorschau · {plan.ticketCount} Tickets · {plan.recipients.length} Techniker mit E-Mail

          </h4>

          {plan.recipients.length > 0 ? (

            <div className="aelter-3-mail-select-all">

              <label className="aelter-3-mail-check">

                <input

                  type="checkbox"

                  checked={allSelected}

                  disabled={!canEdit || busy}

                  onChange={(event) => toggleAllMembers(event.target.checked)}

                />

                Alle Techniker auswählen

              </label>

            </div>

          ) : null}

          {plan.missing.length > 0 ? (

            <ul className="aelter-3-mail-missing">

              {plan.missing.map((item) => (

                <li key={`${item.technicianName}-${item.reason}`}>

                  {item.message} ({item.ticketCount} Ticket(s))

                  {item.memberId ? (

                    <>

                      {" "}

                      · <Link href="/technikerverwaltung">Technikerverwaltung öffnen</Link>

                    </>

                  ) : null}

                </li>

              ))}

            </ul>

          ) : null}

          {plan.recipients.map((recipient) => (

            <details

              key={recipient.memberId}

              className="aelter-3-mail-recipient"

              open={selectedMemberIds.has(recipient.memberId)}

            >

              <summary>

                <label

                  className="aelter-3-mail-recipient-check"

                  onClick={(event) => event.stopPropagation()}

                >

                  <input

                    type="checkbox"

                    checked={selectedMemberIds.has(recipient.memberId)}

                    disabled={!canEdit || busy}

                    onChange={(event) => toggleMember(recipient.memberId, event.target.checked)}

                  />

                </label>

                {recipient.technicianName} · {recipient.email} · {recipient.ticketCount} Ticket(s)

              </summary>

              <p>

                <strong>Betreff:</strong> {recipient.subject}

              </p>

              {cc.trim() ? (

                <p>

                  <strong>CC:</strong> {cc.trim()}

                </p>

              ) : null}

              <pre>{recipient.textPreview}</pre>

            </details>

          ))}

        </div>

      ) : null}

    </section>

  );

}


