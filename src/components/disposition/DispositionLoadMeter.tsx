"use client";

import type { DayLoad, LoadSlice } from "@/lib/disposition/load";
import type { DispositionBoardMode } from "@/lib/disposition/types";

export type LoadMeterFocus = DispositionBoardMode;

function MeterRow({
  label,
  slice,
  blockedLabel,
  variant,
  dim,
}: {
  label: string;
  slice: LoadSlice;
  blockedLabel?: string;
  variant?: "possible";
  dim?: boolean;
}) {
  const tone = blockedLabel ? "blocked" : slice.tone;
  const value = blockedLabel || `${slice.percent} %`;
  return (
    <div
      className={`disp-load-plan is-${tone}${variant === "possible" ? " is-possible" : ""}${dim ? " is-dim" : ""}`}
    >
      <span className="disp-load-k">{label}</span>
      <span className="disp-week-load-bar" aria-hidden>
        <i style={{ width: `${Math.min(100, Math.max(0, slice.percent))}%` }} />
      </span>
      <b>{value}</b>
    </div>
  );
}

export function DispositionLoadMeter({
  load,
  layout = "dash",
  onClick,
  focus,
}: {
  load: DayLoad;
  layout?: "dash" | "kanban";
  onClick?: () => void;
  focus?: LoadMeterFocus;
}) {
  const Tag = onClick ? "button" : "div";
  const demandLabel = layout === "kanban" ? "Nachfrage" : "Nachfr.";
  const possibleLabel = layout === "kanban" ? "Mögl. Tour" : "Mögl.";
  const showIst = load.showActual || focus === "ist";
  return (
    <Tag
      {...(onClick ? { type: "button" as const } : {})}
      className={`disp-load-meter is-${layout} is-${load.tone}${onClick ? " is-click" : ""}`}
      title={load.title}
      aria-label={load.title}
      onClick={onClick}
    >
      <MeterRow
        label="Plan"
        slice={load.plan}
        blockedLabel={load.blocked ? load.blockLabel || "Gesperrt" : undefined}
        dim={Boolean(focus && focus !== "plan")}
      />
      <MeterRow label={demandLabel} slice={load.demand} dim={Boolean(focus && focus !== "nachfrage")} />
      {showIst ? <MeterRow label="Ist" slice={load.actual} dim={Boolean(focus && focus !== "ist")} /> : null}
      <MeterRow
        label={possibleLabel}
        slice={load.possible}
        variant="possible"
        dim={Boolean(focus && focus !== "moeglich")}
      />
    </Tag>
  );
}
