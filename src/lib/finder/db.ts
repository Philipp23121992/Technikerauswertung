import { promises as fs } from "fs";
import path from "path";
import { PLZ_FALLBACK } from "./geo";
import type { ContactEntry, Database, EntityKind } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "finder-db.json");

export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function entry(
  kind: EntityKind,
  data: Omit<ContactEntry, "id" | "kind" | "active" | "createdAt" | "updatedAt"> & {
    id?: string;
  },
): ContactEntry {
  const now = new Date().toISOString();
  return {
    id: data.id ?? uid(kind === "TECHNICIAN" ? "tec" : "par"),
    kind,
    name: data.name,
    company: data.company,
    plz: data.plz,
    city: data.city,
    street: data.street,
    phone: data.phone,
    email: data.email,
    notes: data.notes,
    lat: data.lat,
    lon: data.lon,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
}

async function buildSeed(): Promise<Database> {
  const technicians: ContactEntry[] = [
    entry("TECHNICIAN", {
      id: "tec_1",
      name: "Max Berg",
      company: "Elektro Berg GmbH",
      plz: "80331",
      city: "München",
      street: "Sendlinger Str. 12",
      phone: "+49 89 111111",
      email: "max@elektro-berg.de",
      notes: "Elektro & Smart Home",
      lat: PLZ_FALLBACK["80331"].lat,
      lon: PLZ_FALLBACK["80331"].lon,
    }),
    entry("TECHNICIAN", {
      id: "tec_2",
      name: "Lena Hartmann",
      company: "Wärme Plus",
      plz: "86150",
      city: "Augsburg",
      street: "Königsplatz 3",
      phone: "+49 821 222222",
      email: "lena@waerme-plus.de",
      notes: "Heizung & Sanitär",
      lat: PLZ_FALLBACK["86150"].lat,
      lon: PLZ_FALLBACK["86150"].lon,
    }),
    entry("TECHNICIAN", {
      id: "tec_3",
      name: "Jonas Richter",
      company: "Netzwerk Fix",
      plz: "90402",
      city: "Nürnberg",
      street: "Königstraße 8",
      phone: "+49 911 333333",
      email: "jonas@netzwerkfix",
      notes: "IT & Netzwerk",
      lat: PLZ_FALLBACK["90402"].lat,
      lon: PLZ_FALLBACK["90402"].lon,
    }),
    entry("TECHNICIAN", {
      id: "tec_4",
      name: "Sara Neumann",
      company: "Holz Fein",
      plz: "70173",
      city: "Stuttgart",
      street: "Königstraße 20",
      phone: "+49 711 444444",
      email: "sara@holz-fein.de",
      notes: "Schreinerin",
      lat: PLZ_FALLBACK["70173"].lat,
      lon: PLZ_FALLBACK["70173"].lon,
    }),
    entry("TECHNICIAN", {
      id: "tec_5",
      name: "Timo Vogel",
      company: "Solar West",
      plz: "79104",
      city: "Freiburg",
      street: "Kaiser-Joseph-Str. 5",
      phone: "+49 761 555555",
      email: "timo@solarwest.de",
      notes: "PV & Wallbox",
      lat: PLZ_FALLBACK["79104"].lat,
      lon: PLZ_FALLBACK["79104"].lon,
    }),
    entry("TECHNICIAN", {
      id: "tec_6",
      name: "Paula Kraft",
      company: "Kraft Technik",
      plz: "50667",
      city: "Köln",
      street: "Hohe Str. 40",
      phone: "+49 221 666666",
      email: "paula@kraft-technik.de",
      notes: "Elektro Notdienst",
      lat: PLZ_FALLBACK["50667"].lat,
      lon: PLZ_FALLBACK["50667"].lon,
    }),
  ];

  const partners: ContactEntry[] = [
    entry("PARTNER", {
      id: "par_1",
      name: "Großhandel Süd",
      company: "TechParts Süd AG",
      plz: "85049",
      city: "Ingolstadt",
      street: "Industriepark 1",
      phone: "+49 841 100100",
      email: "service@techparts-sued.de",
      notes: "Ersatzteile Elektrotechnik",
      lat: PLZ_FALLBACK["85049"].lat,
      lon: PLZ_FALLBACK["85049"].lon,
    }),
    entry("PARTNER", {
      id: "par_2",
      name: "Logistik Mitte",
      company: "PartnerLog GmbH",
      plz: "60311",
      city: "Frankfurt am Main",
      street: "Zeil 70",
      phone: "+49 69 200200",
      email: "dispatch@partnerlog.de",
      notes: "Express-Lieferung",
      lat: PLZ_FALLBACK["60311"].lat,
      lon: PLZ_FALLBACK["60311"].lon,
    }),
    entry("PARTNER", {
      id: "par_3",
      name: "Service Nord",
      company: "NordPartner KG",
      plz: "20095",
      city: "Hamburg",
      street: "Mönckebergstr. 11",
      phone: "+49 40 300300",
      email: "info@nordpartner.de",
      notes: "Partner für Norddeutschland",
      lat: PLZ_FALLBACK["20095"].lat,
      lon: PLZ_FALLBACK["20095"].lon,
    }),
    entry("PARTNER", {
      id: "par_4",
      name: "Werkstatt Ost",
      company: "OstWerk GmbH",
      plz: "04109",
      city: "Leipzig",
      street: "Petersstr. 15",
      phone: "+49 341 400400",
      email: "kontakt@ostwerk.de",
      notes: "Reparaturpartner",
      lat: PLZ_FALLBACK["04109"].lat,
      lon: PLZ_FALLBACK["04109"].lon,
    }),
    entry("PARTNER", {
      id: "par_5",
      name: "Depot West",
      company: "RheinDepot",
      plz: "40213",
      city: "Düsseldorf",
      street: "Königsallee 2",
      phone: "+49 211 500500",
      email: "depot@rheindepot.de",
      notes: "Lager & Abholung",
      lat: PLZ_FALLBACK["40213"].lat,
      lon: PLZ_FALLBACK["40213"].lon,
    }),
  ];

  const plzCache: Database["plzCache"] = {};
  for (const [plz, geo] of Object.entries(PLZ_FALLBACK)) {
    plzCache[plz] = { lat: geo.lat, lon: geo.lon, city: geo.city };
  }

  return {
    technicians,
    partners,
    plzCache,
  };
}

async function ensureDb(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DB_PATH);
  } catch {
    const seed = await buildSeed();
    await fs.writeFile(DB_PATH, JSON.stringify(seed, null, 2), "utf8");
  }
}

export async function readDb(): Promise<Database> {
  await ensureDb();
  const raw = (await fs.readFile(DB_PATH, "utf8")).replace(/^\uFEFF/, "");
  const db = JSON.parse(raw) as Database;
  db.technicians ??= [];
  db.partners ??= [];
  db.plzCache ??= {};
  return db;
}

export async function writeDb(db: Database): Promise<void> {
  await ensureDb();
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

export async function updateDb(
  mutator: (db: Database) => void | Promise<void>,
): Promise<Database> {
  const db = await readDb();
  await mutator(db);
  await writeDb(db);
  return db;
}

export function listByKind(db: Database, kind: EntityKind): ContactEntry[] {
  return kind === "TECHNICIAN" ? db.technicians : db.partners;
}
