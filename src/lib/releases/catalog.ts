import type { ReleaseFlagDef } from "./types";

/**
 * Neue UI-/API-Änderungen hier eintragen (defaultStatus: "preview").
 * Admins sehen sie sofort, Bearbeiter erst nach Sprint-Freigabe unter
 * Einstellung → Releases.
 *
 * Shared Data (CSV-Import, Ticket-Edits) ist immer global – Flags gelten
 * nur für Funktionen/Oberflächen, nicht für denselben Datenbestand.
 */
export const RELEASE_CATALOG: ReleaseFlagDef[] = [];
