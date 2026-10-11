import { createId } from "@/lib/id";

export const NEGOTIATION_STATUSES = [
  "offen",
  "warten",
  "genehmigt",
  "abgelehnt",
] as const;

export type NegotiationStatus = (typeof NEGOTIATION_STATUSES)[number];

export const NEGOTIATION_STATUS_LABELS: Record<NegotiationStatus, string> = {
  offen: "Offen",
  warten: "Warten",
  genehmigt: "Genehmigt",
  abgelehnt: "Abgelehnt",
};

export const REVIEW_TYPES = [
  "jahresgespraech",
  "zwischenstand",
  "probezeit",
  "sonstiges",
] as const;

export type ReviewType = (typeof REVIEW_TYPES)[number];

export const REVIEW_TYPE_LABELS: Record<ReviewType, string> = {
  jahresgespraech: "Jahresgespräch",
  zwischenstand: "Zwischenstand",
  probezeit: "Probezeitgespräch",
  sonstiges: "Sonstiges",
};

export type TeamDocument = {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  createdAt: string;
};

export const MEMBER_FILE_KINDS = [
  "arbeitsvertrag",
  "zusatzvereinbarung",
  "zeugnis",
  "personalbogen",
  "sonstiges",
] as const;

export type MemberFileKind = (typeof MEMBER_FILE_KINDS)[number];

export const MEMBER_FILE_KIND_LABELS: Record<MemberFileKind, string> = {
  arbeitsvertrag: "Arbeitsvertrag",
  zusatzvereinbarung: "Zusatzvereinbarung",
  zeugnis: "Zeugnis",
  personalbogen: "Personalbogen",
  sonstiges: "Sonstiges",
};

export function parseMemberFileKind(value: unknown): MemberFileKind {
  return typeof value === "string" && (MEMBER_FILE_KINDS as readonly string[]).includes(value)
    ? (value as MemberFileKind)
    : "sonstiges";
}

export type TeamMemberFile = {
  id: string;
  kind: MemberFileKind;
  name: string;
  storedName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
};

export type NegotiationUpdate = {
  id: string;
  text: string;
  createdAt: string;
};

export type SalaryNegotiation = {
  id: string;
  date: string | null;
  currentSalary: string;
  requestedSalary: string;
  resultSalary: string;
  status: NegotiationStatus;
  notes: string;
  updates: NegotiationUpdate[];
  createdAt: string;
};

export type EmployeeReview = {
  id: string;
  date: string | null;
  type: ReviewType;
  summary: string;
  documents: TeamDocument[];
  createdAt: string;
};

export type TeamMember = {
  id: string;
  name: string;
  roleLabel: string;
  email: string;
  location: string;
  startDate: string | null;
  currentSalary: string;
  notes: string;
  /** Optionaler Link zur Technikerauswertung-Techniker-ID */
  technicianId: string | null;
  negotiations: SalaryNegotiation[];
  reviews: EmployeeReview[];
  files: TeamMemberFile[];
  order: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TechnikerverwaltungDb = {
  version: 1;
  members: TeamMember[];
};

export function createEmptyTechnikerverwaltungDb(): TechnikerverwaltungDb {
  return { version: 1, members: [] };
}

function isNegotiationStatus(value: unknown): value is NegotiationStatus {
  return (
    typeof value === "string" &&
    (NEGOTIATION_STATUSES as readonly string[]).includes(value)
  );
}

function migrateNegotiationStatus(value: unknown): NegotiationStatus {
  if (isNegotiationStatus(value)) return value;
  if (value === "geplant") return "offen";
  if (value === "abgeschlossen") return "genehmigt";
  return "offen";
}

function isReviewType(value: unknown): value is ReviewType {
  return typeof value === "string" && (REVIEW_TYPES as readonly string[]).includes(value);
}

function normalizeIsoDate(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function isMemberFileKind(value: unknown): value is MemberFileKind {
  return typeof value === "string" && (MEMBER_FILE_KINDS as readonly string[]).includes(value);
}

function normalizeMemberFile(raw: Partial<TeamMemberFile>): TeamMemberFile | null {
  if (!raw?.id || typeof raw.id !== "string") return null;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const storedName = typeof raw.storedName === "string" ? raw.storedName.trim() : "";
  if (!name || !storedName) return null;
  const size = typeof raw.size === "number" && Number.isFinite(raw.size) ? raw.size : 0;
  return {
    id: raw.id,
    kind: isMemberFileKind(raw.kind) ? raw.kind : "sonstiges",
    name,
    storedName,
    mimeType: typeof raw.mimeType === "string" ? raw.mimeType : "application/octet-stream",
    size: Math.max(0, size),
    uploadedAt:
      typeof raw.uploadedAt === "string" ? raw.uploadedAt : new Date().toISOString(),
    uploadedBy: typeof raw.uploadedBy === "string" ? raw.uploadedBy.trim() : "",
  };
}

function normalizeDocument(raw: Partial<TeamDocument>): TeamDocument | null {
  if (!raw?.id || typeof raw.id !== "string") return null;
  if (typeof raw.name !== "string" || !raw.name.trim()) return null;
  if (typeof raw.dataUrl !== "string" || !raw.dataUrl.startsWith("data:")) return null;
  return {
    id: raw.id,
    name: raw.name.trim(),
    mimeType: typeof raw.mimeType === "string" ? raw.mimeType : "application/octet-stream",
    dataUrl: raw.dataUrl,
    createdAt:
      typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
  };
}

function normalizeNegotiationUpdate(
  raw: Partial<NegotiationUpdate>,
): NegotiationUpdate | null {
  if (!raw?.id || typeof raw.id !== "string") return null;
  const text = typeof raw.text === "string" ? raw.text.trim() : "";
  if (!text) return null;
  return {
    id: raw.id,
    text,
    createdAt:
      typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
  };
}

function normalizeNegotiation(raw: Partial<SalaryNegotiation>): SalaryNegotiation | null {
  if (!raw?.id || typeof raw.id !== "string") return null;
  const updates = Array.isArray(raw.updates)
    ? raw.updates
        .map((item) => normalizeNegotiationUpdate(item as Partial<NegotiationUpdate>))
        .filter((item): item is NegotiationUpdate => Boolean(item))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [];
  return {
    id: raw.id,
    date: normalizeIsoDate(raw.date),
    currentSalary: typeof raw.currentSalary === "string" ? raw.currentSalary : "",
    requestedSalary: typeof raw.requestedSalary === "string" ? raw.requestedSalary : "",
    resultSalary: typeof raw.resultSalary === "string" ? raw.resultSalary : "",
    status: migrateNegotiationStatus(raw.status),
    notes: typeof raw.notes === "string" ? raw.notes : "",
    updates,
    createdAt:
      typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
  };
}

function normalizeReview(raw: Partial<EmployeeReview>): EmployeeReview | null {
  if (!raw?.id || typeof raw.id !== "string") return null;
  const documents = Array.isArray(raw.documents)
    ? raw.documents
        .map((item) => normalizeDocument(item as Partial<TeamDocument>))
        .filter((item): item is TeamDocument => Boolean(item))
    : [];
  return {
    id: raw.id,
    date: normalizeIsoDate(raw.date),
    type: isReviewType(raw.type) ? raw.type : "jahresgespraech",
    summary: typeof raw.summary === "string" ? raw.summary : "",
    documents,
    createdAt:
      typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
  };
}

export function normalizeMember(raw: Partial<TeamMember>, index = 0): TeamMember | null {
  if (!raw?.id || typeof raw.id !== "string") return null;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return null;

  const negotiations = Array.isArray(raw.negotiations)
    ? raw.negotiations
        .map((item) => normalizeNegotiation(item as Partial<SalaryNegotiation>))
        .filter((item): item is SalaryNegotiation => Boolean(item))
    : [];
  const reviews = Array.isArray(raw.reviews)
    ? raw.reviews
        .map((item) => normalizeReview(item as Partial<EmployeeReview>))
        .filter((item): item is EmployeeReview => Boolean(item))
    : [];
  const files = Array.isArray(raw.files)
    ? raw.files
        .map((item) => normalizeMemberFile(item as Partial<TeamMemberFile>))
        .filter((item): item is TeamMemberFile => Boolean(item))
        .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
    : [];

  return {
    id: raw.id,
    name,
    roleLabel: typeof raw.roleLabel === "string" ? raw.roleLabel : "",
    email: typeof raw.email === "string" ? raw.email : "",
    location: typeof raw.location === "string" ? raw.location : "",
    startDate: normalizeIsoDate(raw.startDate),
    currentSalary: typeof raw.currentSalary === "string" ? raw.currentSalary : "",
    notes: typeof raw.notes === "string" ? raw.notes : "",
    technicianId:
      typeof raw.technicianId === "string" && raw.technicianId.trim()
        ? raw.technicianId.trim()
        : null,
    negotiations,
    reviews,
    files,
    order: typeof raw.order === "number" && Number.isFinite(raw.order) ? raw.order : index,
    active: raw.active !== false,
    createdAt:
      typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    updatedAt:
      typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

export function createMember(input: {
  name: string;
  roleLabel?: string;
  email?: string;
  location?: string;
  currentSalary?: string;
  technicianId?: string | null;
  order?: number;
}): TeamMember {
  const now = new Date().toISOString();
  return {
    id: createId("tm"),
    name: input.name.trim(),
    roleLabel: input.roleLabel?.trim() ?? "",
    email: input.email?.trim() ?? "",
    location: input.location?.trim() ?? "",
    startDate: null,
    currentSalary: input.currentSalary?.trim() ?? "",
    notes: "",
    technicianId: input.technicianId ?? null,
    negotiations: [],
    reviews: [],
    files: [],
    order: input.order ?? Date.now(),
    active: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function createNegotiation(
  partial?: Partial<SalaryNegotiation>,
): SalaryNegotiation {
  return {
    id: createId("neg"),
    date: partial?.date ?? new Date().toISOString().slice(0, 10),
    currentSalary: partial?.currentSalary ?? "",
    requestedSalary: partial?.requestedSalary ?? "",
    resultSalary: partial?.resultSalary ?? "",
    status: partial?.status ?? "offen",
    notes: partial?.notes ?? "",
    updates: partial?.updates ?? [],
    createdAt: new Date().toISOString(),
  };
}

export function createNegotiationUpdate(text: string): NegotiationUpdate {
  return {
    id: createId("negup"),
    text: text.trim(),
    createdAt: new Date().toISOString(),
  };
}

export function formatDateTimeDe(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function createReview(partial?: Partial<EmployeeReview>): EmployeeReview {
  return {
    id: createId("rev"),
    date: partial?.date ?? new Date().toISOString().slice(0, 10),
    type: partial?.type ?? "jahresgespraech",
    summary: partial?.summary ?? "",
    documents: partial?.documents ?? [],
    createdAt: new Date().toISOString(),
  };
}

export function formatDateDe(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}
