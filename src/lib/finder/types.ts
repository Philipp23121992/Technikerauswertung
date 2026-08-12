export type EntityKind = "TECHNICIAN" | "PARTNER";

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface ContactEntry {
  id: string;
  kind: EntityKind;
  name: string;
  company: string;
  plz: string;
  city: string;
  street: string;
  phone: string;
  email: string;
  notes: string;
  lat: number;
  lon: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Database {
  technicians: ContactEntry[];
  partners: ContactEntry[];
  plzCache: Record<string, GeoPoint & { city?: string }>;
}

export interface NearbyMatch extends ContactEntry {
  distanceKm: number;
  /** Fahrzeit in Minuten, falls OSRM verfügbar */
  durationMin?: number;
  /** driving = echte Fahrtstrecke, air = Fallback Luftlinie */
  distanceMode?: "driving" | "air";
}

export interface SearchResult {
  query: {
    plz: string;
    city?: string;
    lat: number;
    lon: number;
    kind: EntityKind;
  };
  matches: NearbyMatch[];
}
