import { extractFrus } from "./extract";
import type { ErrorPartRelation, LexmarkDb, ReplacementPart } from "./types";

const REVISION_RE = /^\s*(added|updated|removed|revised|moved|changed|deleted|see )\b/i;

export function isRevisionNoise(text: string | null | undefined): boolean {
  return Boolean(text && REVISION_RE.test(text));
}

export type KettenRow = {
  id: string;
  model: string;
  errorCode: string;
  fru: string;
  description: string | null;
};

function matchesQuery(query: string, ...values: Array<string | null | undefined>): boolean {
  if (!query) return true;
  return values.some((value) => (value ?? "").toLowerCase().includes(query));
}

export function listKetten(db: LexmarkDb, query = "", limit = 500): KettenRow[] {
  const needle = query.trim().toLowerCase();
  const seen = new Set<string>();
  const out: KettenRow[] = [];

  function add(row: KettenRow) {
    if (out.length >= limit) return;
    if (isRevisionNoise(row.description)) return;
    if (!row.model || !row.errorCode || !row.fru) return;
    const key = `${row.model}|${row.errorCode}|${row.fru}`;
    if (seen.has(key)) return;
    if (!matchesQuery(needle, row.model, row.errorCode, row.fru, row.description)) return;
    seen.add(key);
    out.push(row);
  }

  for (const row of db.error_part_relations) {
    add({
      id: row.id,
      model: row.model,
      errorCode: row.errorCode,
      fru: row.fru,
      description: row.description,
    });
    if (out.length >= limit) return out;
  }

  const modelsByManual = new Map<string, string[]>();
  for (const model of db.printer_models) {
    const list = modelsByManual.get(model.manualId) ?? [];
    if (!list.includes(model.model)) list.push(model.model);
    modelsByManual.set(model.manualId, list);
  }

  const partsByPage = new Map<string, ReplacementPart[]>();
  for (const part of db.replacement_parts) {
    if (part.page == null) continue;
    const key = `${part.manualId}:${part.page}`;
    const list = partsByPage.get(key) ?? [];
    if (list.length < 6) list.push(part);
    partsByPage.set(key, list);
  }

  const covered = new Set(db.error_part_relations.map((row) => `${row.manualId}|${row.errorCode}`));
  const perManual = new Map<string, number>();

  for (const error of db.error_codes) {
    if (out.length >= limit) break;
    if (covered.has(`${error.manualId}|${error.code}`)) continue;
    if (isRevisionNoise(error.description)) continue;
    const used = perManual.get(error.manualId) ?? 0;
    if (used >= 40) continue;

    const fromText = extractFrus(
      [error.description, error.cause, error.customerResolution, error.remoteResolution, error.detailedDiagnostics, error.initialPartsReplacement]
        .filter(Boolean)
        .join("\n"),
    );
    const fromPage: string[] = [];
    if (error.page != null) {
      for (const page of [error.page, error.page - 1, error.page + 1]) {
        for (const part of partsByPage.get(`${error.manualId}:${page}`) ?? []) {
          if (!fromPage.includes(part.fru)) fromPage.push(part.fru);
        }
      }
    }
    const frus = [...new Set([...fromText, ...fromPage])].slice(0, 3);
    if (!frus.length) continue;
    const models = (modelsByManual.get(error.manualId) ?? []).slice(0, 8);
    if (!models.length) continue;

    for (const model of models) {
      for (const fru of frus) {
        add({
          id: `gen-${error.id}-${model}-${fru}`,
          model,
          errorCode: error.code,
          fru,
          description: error.description,
        });
      }
    }
    perManual.set(error.manualId, used + 1);
  }

  return out;
}

export function uniqueErrorPartRelations(rows: ErrorPartRelation[]): ErrorPartRelation[] {
  const seen = new Set<string>();
  const out: ErrorPartRelation[] = [];
  for (const row of rows) {
    if (isRevisionNoise(row.description)) continue;
    const key = `${row.manualId}|${row.model}|${row.errorCode}|${row.fru}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}
