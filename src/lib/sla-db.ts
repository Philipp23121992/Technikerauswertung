import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
export const SLA_DB_PATH = path.join(DATA_DIR, "sla-db.json");

const DEFAULT_CUSTOMERS = [
  {
    id: "cust-dm-tech",
    name: "DM Tech",
    aliases: ["DMTech", "DM-Tech", "D.M. Tech", "dm tech", "DM Tech GmbH"],
    slaType: "NBD",
  },
];

const DEFAULT_TECHNICIANS = [
  {
    id: "tech-chris-zimmermann",
    name: "Chris Zimmermann",
    aliases: ["Chris Zimmerman", "C. Zimmermann"],
  },
];

export type SlaDb = {
  revision: number;
  updatedAt: string;
  customers: unknown[];
  technicians: unknown[];
  tickets: unknown[];
  imports: unknown[];
  timeTickets: unknown[];
  timeImports: unknown[];
};

function emptyDb(): SlaDb {
  return {
    revision: 1,
    updatedAt: new Date().toISOString(),
    customers: DEFAULT_CUSTOMERS,
    technicians: DEFAULT_TECHNICIANS,
    tickets: [],
    imports: [],
    timeTickets: [],
    timeImports: [],
  };
}

function normalizeDb(raw: Partial<SlaDb> | null | undefined): SlaDb {
  return {
    ...emptyDb(),
    ...raw,
    tickets: Array.isArray(raw?.tickets) ? raw.tickets : [],
    imports: Array.isArray(raw?.imports) ? raw.imports : [],
    timeTickets: Array.isArray(raw?.timeTickets) ? raw.timeTickets : [],
    timeImports: Array.isArray(raw?.timeImports) ? raw.timeImports : [],
    customers: Array.isArray(raw?.customers) ? raw.customers : DEFAULT_CUSTOMERS,
    technicians: Array.isArray(raw?.technicians)
      ? raw.technicians
      : DEFAULT_TECHNICIANS,
  };
}

export async function readSlaDb(): Promise<SlaDb> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = (await fs.readFile(SLA_DB_PATH, "utf8")).replace(/^\uFEFF/, "");
    return normalizeDb(JSON.parse(raw) as SlaDb);
  } catch {
    const seed = emptyDb();
    await fs.writeFile(SLA_DB_PATH, JSON.stringify(seed, null, 2), "utf8");
    return seed;
  }
}

export async function writeSlaDb(next: Partial<SlaDb>): Promise<SlaDb> {
  const current = await readSlaDb();
  const payload: SlaDb = {
    revision: Number(current.revision || 0) + 1,
    updatedAt: new Date().toISOString(),
    customers: Array.isArray(next.customers) ? next.customers : current.customers,
    technicians: Array.isArray(next.technicians)
      ? next.technicians
      : current.technicians,
    tickets: Array.isArray(next.tickets) ? next.tickets : current.tickets,
    imports: Array.isArray(next.imports) ? next.imports : current.imports,
    timeTickets: Array.isArray(next.timeTickets)
      ? next.timeTickets
      : current.timeTickets,
    timeImports: Array.isArray(next.timeImports)
      ? next.timeImports
      : current.timeImports,
  };
  const tmp = `${SLA_DB_PATH}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(payload, null, 2), "utf8");
  await fs.rename(tmp, SLA_DB_PATH);
  return payload;
}
