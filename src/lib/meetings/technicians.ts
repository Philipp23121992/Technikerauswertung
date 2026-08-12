export type MeetingTechnician = {
  id: string;
  name: string;
  email: string;
};

export type MeetingTechniciansState = {
  version: 1;
  technicians: MeetingTechnician[];
};

export const MEETINGS_TECHNICIANS_KEY = "apm.meetings.technicians.v1";

export function createEmptyMeetingTechnicians(): MeetingTechniciansState {
  return { version: 1, technicians: [] };
}

export function createMeetingTechId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `mt-${crypto.randomUUID()}`;
  }
  return `mt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadMeetingTechnicians(): MeetingTechniciansState {
  if (typeof window === "undefined") return createEmptyMeetingTechnicians();
  try {
    const raw = window.localStorage.getItem(MEETINGS_TECHNICIANS_KEY);
    if (!raw) return createEmptyMeetingTechnicians();
    const parsed = JSON.parse(raw) as Partial<MeetingTechniciansState>;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.technicians)) {
      return createEmptyMeetingTechnicians();
    }
    const technicians = parsed.technicians
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const tech = item as Partial<MeetingTechnician>;
        if (!tech.id || typeof tech.name !== "string") return null;
        return {
          id: tech.id,
          name: tech.name.trim(),
          email: typeof tech.email === "string" ? tech.email.trim() : "",
        };
      })
      .filter((item): item is MeetingTechnician => Boolean(item && item.name));
    return { version: 1, technicians };
  } catch {
    return createEmptyMeetingTechnicians();
  }
}

export function saveMeetingTechnicians(state: MeetingTechniciansState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MEETINGS_TECHNICIANS_KEY, JSON.stringify(state));
}
