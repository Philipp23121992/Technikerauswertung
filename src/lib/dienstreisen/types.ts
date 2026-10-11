import { createId } from "@/lib/id";

export const TRIP_STATUSES = ["in-planung", "geplant"] as const;

export type TripStatus = (typeof TRIP_STATUSES)[number];

export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  "in-planung": "Dienstreise in Planung",
  geplant: "Dienstreise geplant",
};

export const TRIP_PRIORITIES = ["niedrig", "mittel", "hoch", "sehr-hoch"] as const;

export type TripPriority = (typeof TRIP_PRIORITIES)[number];

export const TRIP_PRIORITY_LABELS: Record<TripPriority, string> = {
  niedrig: "Niedrig",
  mittel: "Mittel",
  hoch: "Hoch",
  "sehr-hoch": "Sehr Hoch",
};

export const HOTEL_STATUSES = [
  "offen",
  "reserviert",
  "gebucht",
  "storniert",
] as const;

export type HotelStatus = (typeof HOTEL_STATUSES)[number];

export const HOTEL_STATUS_LABELS: Record<HotelStatus, string> = {
  offen: "Offen",
  reserviert: "Reserviert",
  gebucht: "Gebucht",
  storniert: "Storniert",
};

export type HotelDocument = {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  createdAt: string;
};

export type HotelStay = {
  id: string;
  date: string | null;
  city: string;
  hotelName: string;
  cost: string;
  breakfastIncluded: boolean;
  parking: boolean;
  status: HotelStatus;
  notes: string;
  documents: HotelDocument[];
};

export type BusinessTrip = {
  id: string;
  title: string;
  traveler: string;
  status: TripStatus;
  priority: TripPriority;
  dateFrom: string | null;
  dateTo: string | null;
  dueDate: string | null;
  /** Abgeleitete Summe der Unterkunftspreise (Anzeige/Cache). */
  totalCost: string;
  note: string;
  hotels: HotelStay[];
  order: number;
  archived: boolean;
  /** ISO-Zeitpunkt nach Versand der Fälligkeitsmail */
  dueMailSentAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DienstreisenDb = {
  version: 1;
  trips: BusinessTrip[];
};

export function createEmptyDienstreisenDb(): DienstreisenDb {
  return { version: 1, trips: [] };
}

function isTripStatus(value: unknown): value is TripStatus {
  return typeof value === "string" && (TRIP_STATUSES as readonly string[]).includes(value);
}

function migrateTripStatus(value: unknown): TripStatus {
  if (isTripStatus(value)) return value;
  if (value === "unterwegs") return "geplant";
  if (value === "abgeschlossen") return "geplant";
  return "in-planung";
}

function isTripPriority(value: unknown): value is TripPriority {
  return typeof value === "string" && (TRIP_PRIORITIES as readonly string[]).includes(value);
}

function isHotelStatus(value: unknown): value is HotelStatus {
  return typeof value === "string" && (HOTEL_STATUSES as readonly string[]).includes(value);
}

function normalizeIsoDate(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/** Deutsche/englische Beträge → Zahl (z. B. 1.234,50 oder 450). */
export function parseEuroAmount(value: string): number {
  const cleaned = value.trim().replace(/\s/g, "").replace(/€/gi, "");
  if (!cleaned) return 0;
  if (cleaned.includes(",")) {
    const normalized = cleaned.replace(/\./g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Number(cleaned.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatEuroAmount(value: number): string {
  return `${value.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`;
}

export function sumHotelCosts(hotels: HotelStay[]): number {
  return hotels.reduce((sum, hotel) => sum + parseEuroAmount(hotel.cost), 0);
}

export function withSyncedTotalCost(trip: BusinessTrip): BusinessTrip {
  return {
    ...trip,
    totalCost: formatEuroAmount(sumHotelCosts(trip.hotels)),
  };
}

function normalizeDocument(raw: Partial<HotelDocument>): HotelDocument | null {
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

function normalizeHotel(raw: Partial<HotelStay>): HotelStay | null {
  if (!raw?.id || typeof raw.id !== "string") return null;
  const documents = Array.isArray(raw.documents)
    ? raw.documents
        .map((item) => normalizeDocument(item as Partial<HotelDocument>))
        .filter((item): item is HotelDocument => Boolean(item))
    : [];

  return {
    id: raw.id,
    date: normalizeIsoDate(raw.date),
    city: typeof raw.city === "string" ? raw.city : "",
    hotelName: typeof raw.hotelName === "string" ? raw.hotelName : "",
    cost: typeof raw.cost === "string" ? raw.cost : "",
    breakfastIncluded: Boolean(raw.breakfastIncluded),
    parking: Boolean(raw.parking),
    status: isHotelStatus(raw.status) ? raw.status : "offen",
    notes: typeof raw.notes === "string" ? raw.notes : "",
    documents,
  };
}

export function normalizeTrip(
  raw: Partial<BusinessTrip> & { plannedNote?: string },
  index = 0,
): BusinessTrip | null {
  if (!raw?.id || typeof raw.id !== "string") return null;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title) return null;

  const status = migrateTripStatus(raw.status);
  const archived =
    Boolean(raw.archived) || (raw as { status?: string }).status === "abgeschlossen";
  const hotels = Array.isArray(raw.hotels)
    ? raw.hotels
        .map((item) => normalizeHotel(item as Partial<HotelStay>))
        .filter((item): item is HotelStay => Boolean(item))
    : [];

  const note =
    typeof raw.note === "string"
      ? raw.note
      : typeof raw.plannedNote === "string"
        ? raw.plannedNote
        : "";

  return withSyncedTotalCost({
    id: raw.id,
    title,
    traveler: typeof raw.traveler === "string" ? raw.traveler.trim() : "",
    status,
    priority: isTripPriority(raw.priority) ? raw.priority : "mittel",
    dateFrom: normalizeIsoDate(raw.dateFrom),
    dateTo: normalizeIsoDate(raw.dateTo),
    dueDate: normalizeIsoDate(raw.dueDate),
    totalCost: typeof raw.totalCost === "string" ? raw.totalCost : "",
    note,
    hotels,
    order: typeof raw.order === "number" && Number.isFinite(raw.order) ? raw.order : index,
    archived,
    dueMailSentAt:
      typeof raw.dueMailSentAt === "string" ? raw.dueMailSentAt : null,
    createdAt:
      typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    updatedAt:
      typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  });
}

export function createHotelStay(partial?: Partial<HotelStay>): HotelStay {
  return {
    id: createId("hotel"),
    date: partial?.date ?? null,
    city: partial?.city ?? "",
    hotelName: partial?.hotelName ?? "",
    cost: partial?.cost ?? "",
    breakfastIncluded: partial?.breakfastIncluded ?? false,
    parking: partial?.parking ?? false,
    status: partial?.status ?? "offen",
    notes: partial?.notes ?? "",
    documents: partial?.documents ?? [],
  };
}

export function createTrip(input: {
  title: string;
  traveler?: string;
  status?: TripStatus;
  priority?: TripPriority;
  dateFrom?: string | null;
  dateTo?: string | null;
  order?: number;
}): BusinessTrip {
  const now = new Date().toISOString();
  return {
    id: createId("trip"),
    title: input.title.trim(),
    traveler: input.traveler?.trim() ?? "",
    status: input.status ?? "in-planung",
    priority: input.priority ?? "mittel",
    dateFrom: input.dateFrom ?? null,
    dateTo: input.dateTo ?? null,
    dueDate: null,
    totalCost: formatEuroAmount(0),
    note: "",
    hotels: [],
    order: input.order ?? Date.now(),
    archived: false,
    dueMailSentAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function applyTripStatus(trip: BusinessTrip, status: TripStatus): BusinessTrip {
  return { ...trip, status, updatedAt: new Date().toISOString() };
}

export function formatDateDe(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

export function tripDateRangeLabel(trip: BusinessTrip): string {
  if (trip.dateFrom && trip.dateTo) {
    return `${formatDateDe(trip.dateFrom)} - ${formatDateDe(trip.dateTo)}`;
  }
  if (trip.dateFrom) return formatDateDe(trip.dateFrom);
  if (trip.dateTo) return formatDateDe(trip.dateTo);
  return "Kein Zeitraum";
}
