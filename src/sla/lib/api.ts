import type {
  Customer,
  ImportBatch,
  Technician,
  Ticket,
  TimeTicket,
} from "../types";

export interface SyncState {
  revision: number;
  updatedAt: string;
  customers: Customer[];
  technicians: Technician[];
  tickets: Ticket[];
  imports: ImportBatch[];
  timeTickets?: TimeTicket[];
  timeImports?: ImportBatch[];
}

export function getApiBaseUrl(): string {
  return "/api/sla";
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });

    if (response.status === 304) {
      return { ok: false, status: 304, error: "not-modified" };
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: `HTTP ${response.status}`,
      };
    }

    const data = (await response.json()) as T;
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : "Netzwerkfehler",
    };
  }
}

export async function fetchHealth() {
  return request<{ ok: boolean; updatedAt: string }>("/health");
}

export async function fetchState(sinceRevision = 0) {
  return request<SyncState>(`/state?since=${sinceRevision}`);
}

export async function saveState(state: Omit<SyncState, "revision" | "updatedAt">) {
  return request<SyncState>("/state", {
    method: "PUT",
    body: JSON.stringify({
      ...state,
      timeTickets: state.timeTickets ?? [],
      timeImports: state.timeImports ?? [],
    }),
  });
}
