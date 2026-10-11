"use client";

import {
  classifyWorkKind,
  ticketWorkKind,
  TICKET_WORK_KIND_LABELS,
  type TicketWorkKind,
} from "@/lib/disposition/priority";
import type { DispositionTicket } from "@/lib/disposition/types";

export function WorkKindSelect({
  ticket,
  disabled,
  onChange,
}: {
  ticket: Pick<
    DispositionTicket,
    "workKindManual" | "service" | "kennzeichen" | "summary" | "title" | "note"
  >;
  disabled?: boolean;
  onChange: (value: TicketWorkKind | null) => void;
}) {
  const autoKind = classifyWorkKind(ticket);
  const resolved = ticketWorkKind(ticket);
  const value = ticket.workKindManual ?? "auto";
  return (
    <select
      className={`disp-work-select is-${resolved}`}
      value={value}
      disabled={disabled}
      aria-label="Art"
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => {
        event.stopPropagation();
        const next = event.target.value;
        onChange(next === "auto" ? null : (next as TicketWorkKind));
      }}
    >
      <option value="auto">
        Auto{autoKind !== "none" ? ` (${TICKET_WORK_KIND_LABELS[autoKind]})` : ""}
      </option>
      <option value="stoerung">{TICKET_WORK_KIND_LABELS.stoerung}</option>
      <option value="umbau">{TICKET_WORK_KIND_LABELS.umbau}</option>
      <option value="none">—</option>
    </select>
  );
}
