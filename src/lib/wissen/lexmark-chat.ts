import { extractErrorCodes as extractLexmarkErrorCodes, extractFrus, extractModels, isJunkPartLabel, normalizeErrorCode, partBezeichnung } from "@/lib/lexmark/extract";
import { isRevisionNoise } from "@/lib/lexmark/relations";
import type { ErrorCode, LexmarkDb, ReplacementPart } from "@/lib/lexmark/types";
import type { ChatResult, ChatSource } from "./chat";

const PART_QUERY_RE =
  /\b(teilenummer|teile[- ]?nr|teilnr|ersatzteil(?:e|nummer|nummern)?|bestellnummer|artikelnummer|fru|p\/?n|part\s*number|part\s*no|ausbau|ausbauen|anleitung(?:en)?|removal|removing|demontage|tausch|tauschen|austauschen|austausch|wechsel|wechseln|auswechseln|ersetzen|einbau|einbauen|replace|replacing|replacement)\b/i;

const ERROR_QUERY_RE =
  /\b(fehlercode|fehler[- ]?code|error[- ]?code|störungscode|fehlermeldung|error\s*message|user\s*attendance|was\s+bedeutet|bedeutung)\b/i;

const SYMPTOM_RE =
  /\b(nicht warm|nicht heiß|nicht heiss|heizt nicht|keine hitze|papierstau|stau|klemme|streifen|linien|blass|hell|geräusch|knacken|geruch|brennen|einzug|adf|offline|wird nicht)\b/i;

const ACCESSORY_RE =
  /\b(sensor|motor|fan|lüfter|drive|belt|riemen|spring|feder|brush|bürste|guide|lamp|thermistor|cable|kabel|harness|gear|zahnrad|board|card|roller|walze|clutch|solenoid|switch|schalter)\b/i;

const SEARCH_STOP = new Set(
  [
    "der",
    "die",
    "das",
    "den",
    "dem",
    "des",
    "ein",
    "eine",
    "einer",
    "einem",
    "eines",
    "und",
    "oder",
    "für",
    "von",
    "vom",
    "zum",
    "zur",
    "beim",
    "mit",
    "bitte",
    "gib",
    "mir",
    "mich",
    "dir",
    "dich",
    "uns",
    "kann",
    "kannst",
    "hast",
    "habe",
    "mal",
    "noch",
    "nochmal",
    "jetzt",
    "dann",
    "auch",
    "nur",
    "wie",
    "was",
    "suche",
    "zeig",
    "zeige",
    "welche",
    "welcher",
    "welches",
    "the",
    "and",
    "for",
    "teil",
    "teile",
    "nummer",
    "number",
    "nr",
    "bauteil",
    "gerät",
    "drucker",
    "modell",
    "printer",
    "model",
  ].map((word) => word.toLowerCase()),
);

export function isPartQuery(query: string): boolean {
  return PART_QUERY_RE.test(query);
}

function normalizeSearchToken(token: string): string {
  const lower = token.toLowerCase();
  if (lower.length > 4 && lower.endsWith("s") && !lower.endsWith("ss")) return lower.slice(0, -1);
  return lower;
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const next = value.trim();
    if (!next || seen.has(next.toUpperCase())) continue;
    seen.add(next.toUpperCase());
    out.push(next);
  }
  return out;
}

function clip(value: string | null | undefined, max = 420): string {
  const text = collapseRepeated((value ?? "").replace(/\s+/g, " ").trim());
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max).trim()}…` : text;
}

function collapseRepeated(text: string): string {
  const words = text.split(" ").filter(Boolean);
  if (words.length >= 4 && words.length % 2 === 0) {
    const half = words.length / 2;
    const left = words.slice(0, half).join(" ");
    const right = words.slice(half).join(" ");
    if (left.toLowerCase() === right.toLowerCase()) return left;
  }
  return text;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function partLabel(part: ReplacementPart): string | null {
  const labeled = partBezeichnung({
    ...part,
    name: collapseRepeated(part.name ?? "") || part.name,
    description: collapseRepeated(part.description ?? "") || part.description,
  });
  return labeled ? collapseRepeated(labeled) : null;
}

function expandSymptomTokens(query: string): string[] {
  const lower = query.toLowerCase();
  const extra: string[] = [];
  if (/nicht warm|nicht heiß|nicht heiss|heizt nicht|keine hitze/.test(lower)) {
    extra.push("fuser", "heat", "temperature", "reach");
  }
  if (/papierstau|stau|klemme/.test(lower)) extra.push("jam", "paper", "media", "pick");
  if (/streifen|linien|striche/.test(lower)) extra.push("streak", "line", "band");
  if (/geräusch|knacken|schleifen/.test(lower)) extra.push("noise", "grinding", "gear");
  if (/geruch|brennen|rauch/.test(lower)) extra.push("fuser", "overheat", "smell");
  if (/\badf\b|einzug|scanner/.test(lower)) extra.push("adf", "scanner", "pick");
  return extra;
}

function querySearchTokens(query: string, models: string[]): string[] {
  const modelTokens = new Set(models.map((model) => model.toLowerCase()));
  return unique(
    query
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .split(/\s+/)
      .map((token) => normalizeSearchToken(token))
      .filter((token) => {
        if (token.length < 3) return false;
        if (SEARCH_STOP.has(token) || modelTokens.has(token)) return false;
        if (PART_QUERY_RE.test(token) || ERROR_QUERY_RE.test(token)) return false;
        return true;
      }),
  );
}

function clipLines(value: string | null | undefined, max = 2500): string {
  const text = (value ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max).trim()}…` : text;
}

function matchModels(db: LexmarkDb, query: string): string[] {
  const fromText = extractModels(query);
  const upper = query.toUpperCase();
  const known = unique(db.printer_models.map((item) => item.model)).sort((a, b) => b.length - a.length);
  const hits: string[] = [];
  for (const model of known) {
    if (!upper.includes(model.toUpperCase())) continue;
    hits.push(model);
    if (hits.length >= 8) break;
  }
  return unique([...fromText, ...hits]);
}

function modelsForManual(db: LexmarkDb, manualId: string): string[] {
  return unique(db.printer_models.filter((item) => item.manualId === manualId).map((item) => item.model));
}

function errorLooksUseful(error: ErrorCode): boolean {
  const blob = [error.description, error.category, error.cause, error.customerResolution].join(" ");
  if (isRevisionNoise(error.description) || isRevisionNoise(error.category)) return false;
  return Boolean(blob.replace(error.code, "").replace(/\s+/g, " ").trim());
}

function errorScore(error: ErrorCode, model: string | undefined, models: string[]): number {
  let score = 0;
  if (error.customerResolution) score += 40;
  if (error.cause) score += 20;
  if (error.remoteResolution) score += 10;
  if ((error.description ?? "").length > 24) score += 8;
  if (errorLooksUseful(error)) score += 5;
  if (model && models.some((item) => item.toUpperCase() === model.toUpperCase())) score += 50;
  else if (model && models.some((item) => item.toUpperCase().startsWith(model.toUpperCase()))) score += 30;
  return score;
}

function deutschifyManual(text: string): string {
  const original = clip(text, 220);
  const rules: Array<[RegExp, string]> = [
    [/did not reach the required|failed to heat/i, "Der Fuser hat die Solltemperatur nicht erreicht."],
    [/there was an attempt to heat|during an attempt to heat/i, "Beim Aufheizen ist ein Fehler aufgetreten."],
    [/paper fed from the mpf/i, "Papierstau oder Fehleinzug aus dem Mehrzweckeinzug (MPF)."],
    [/paper fed from tray 1/i, "Papierstau oder Fehleinzug aus Kassette 1."],
    [/remaining life of the imaging/i, "Restlebensdauer der Imaging Unit."],
    [/too\s+(warm|hot)|overtemp|overheat/i, "Übertemperatur / zu heiß."],
  ];
  for (const [re, de] of rules) {
    if (re.test(text)) {
      return original ? `${de}\nManual: ${original}` : de;
    }
  }
  return text;
}

function explainError(error: ErrorCode): string {
  const raw =
    clip(error.cause, 700) ||
    clip(error.customerResolution, 700) ||
    clip(error.description || error.category, 500) ||
    "Keine ausführliche Beschreibung im Manual.";
  return deutschifyManual(raw);
}

const ERROR_PART_HINTS: Array<{ re: RegExp; tokens: string[] }> = [
  { re: /fuser|heat|temperatur|fixier|warm/i, tokens: ["fuser"] },
  { re: /toner|cartridge|region|supply/i, tokens: ["cartridge", "toner"] },
  { re: /waste|bottle/i, tokens: ["bottle", "waste"] },
  { re: /paper fed|mpf|tray|pick|jam|media/i, tokens: ["pick", "roller"] },
  { re: /\bmotor\b/i, tokens: ["motor"] },
  { re: /\bsensor\b/i, tokens: ["sensor"] },
  { re: /\badf\b|scanner/i, tokens: ["adf"] },
  { re: /network|wireless/i, tokens: ["network", "card"] },
];

function errorBlob(error: ErrorCode): string {
  return [
    error.description,
    error.category,
    error.cause,
    error.customerResolution,
    error.remoteResolution,
    error.detailedDiagnostics,
    error.initialPartsReplacement,
  ]
    .filter(Boolean)
    .join("\n");
}

function labeledFrus(db: LexmarkDb, frus: string[], models: string[]): string[] {
  const wantedModel = models[0];
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const fru of frus) {
    const key = fru.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const hit = answerPart(db, fru, wantedModel);
    if (hit?.answer) {
      const first = hit.answer.split("\n")[0];
      lines.push(first);
      continue;
    }
    lines.push(`PN ${fru}`);
    if (lines.length >= 8) break;
  }
  return lines;
}

function hintTokensForError(error: ErrorCode): string[] {
  const blob = errorBlob(error);
  const tokens: string[] = [];
  for (const hint of ERROR_PART_HINTS) {
    if (!hint.re.test(blob)) continue;
    for (const token of hint.tokens) {
      if (!tokens.includes(token)) tokens.push(token);
    }
  }
  return tokens;
}

function answerError(db: LexmarkDb, code: string, wantedModel?: string): ChatResult | null {
  const wanted = normalizeErrorCode(code);
  let rows = db.error_codes.filter((item) => normalizeErrorCode(item.code) === wanted);
  if (!rows.length) {
    const family = wanted.replace(/[A-Z]+$/i, "");
    const prefix = `${family.split(".")[0]}.`;
    const nearby = unique(
      db.error_codes
        .map((item) => item.code)
        .filter((item) => normalizeErrorCode(item).startsWith(prefix)),
    )
      .sort()
      .slice(0, 8);
    return {
      answer: [
        `Den Fehlercode ${wanted} habe ich so nicht in den Lexmark-Listen.`,
        nearby.length ? `Ähnliche Codes: ${nearby.join(", ")}` : "Bitte Modell dazu nennen und den Code nochmal prüfen.",
      ].join("\n"),
      sources: nearby.length ? [{ title: `Ähnlich ${wanted}`, excerpt: nearby.join(", ") }] : [],
    };
  }

  const ranked = rows
    .map((error) => {
      const models = modelsForManual(db, error.manualId);
      return { error, models, score: errorScore(error, wantedModel, models) };
    })
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const scope = wantedModel
    ? ranked.filter((row) => row.models.some((item) => item.toUpperCase().startsWith(wantedModel.toUpperCase())))
    : ranked;
  const used = scope.length ? scope : ranked;
  const models = unique(used.flatMap((row) => row.models)).slice(0, 12);
  const frus = unique([
    ...used.flatMap((row) =>
      db.error_part_relations
        .filter((rel) => rel.manualId === row.error.manualId && normalizeErrorCode(rel.errorCode) === wanted)
        .map((rel) => rel.fru),
    ),
    ...used.flatMap((row) => extractFrus(errorBlob(row.error))),
  ]);

  const hintTokens = unique(used.flatMap((row) => hintTokensForError(row.error)));
  if (hintTokens.length) {
    const hinted = loosePartHits(db, hintTokens, wantedModel ? [wantedModel] : models, 6);
    for (const row of hinted) {
      if (!frus.includes(row.part.fru)) frus.push(row.part.fru);
    }
  }

  const partLines = labeledFrus(db, frus.slice(0, 8), wantedModel ? [wantedModel] : models);
  const explanation = explainError(best.error);
  const hintNote = hintTokens.includes("fuser")
    ? "Hinweis: Die Beschreibung deutet auf Fuser/Heizung hin."
    : hintTokens.includes("pick")
      ? "Hinweis: Die Beschreibung deutet auf Einzug/Stau hin."
      : "";
  const lines = [
    `Fehlercode ${best.error.code}`,
    `Kurzdiagnose: ${explanation}`,
    models.length ? `Modell: ${models.join(", ")}` : "",
    best.error.customerResolution ? `Vor Ort: ${clip(best.error.customerResolution, 500)}` : "",
    best.error.remoteResolution ? `Remote: ${clip(best.error.remoteResolution, 320)}` : "",
    hintNote,
    partLines.length ? `Mögliche Ersatzteile:\n${partLines.join("\n")}` : "Keine Ersatzteil-Zuordnung in den Listen. PDF unter Lexmark neu analysieren oder den Code mit Modell eingeben.",
  ].filter(Boolean);

  return {
    answer: lines.join("\n"),
    sources: [
      {
        title: `${models[0] || best.error.source} ${best.error.code}`,
        excerpt: lines.join(" · ").slice(0, 240),
      },
      ...partLines.slice(0, 3).map((line) => ({ title: line, excerpt: line })),
    ].slice(0, 6),
  };
}

function answerPart(db: LexmarkDb, fru: string, wantedModel?: string): ChatResult | null {
  const wanted = fru.toUpperCase();
  const rows = db.replacement_parts.filter((item) => item.fru.toUpperCase() === wanted);
  if (!rows.length) {
    const viaChain = db.error_part_relations.filter((row) => row.fru.toUpperCase() === wanted);
    if (!viaChain.length) return null;
    const codes = unique(viaChain.map((row) => row.errorCode)).slice(0, 8);
    const models = unique(viaChain.map((row) => row.model)).slice(0, 10);
    return {
      answer: [
        `PN ${wanted}`,
        models.length ? `Modell: ${models.join(", ")}` : "",
        codes.length ? `Fehlercodes: ${codes.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      sources: [{ title: `${models[0] || wanted} ${wanted}`, excerpt: `PN ${wanted}` }],
    };
  }

  const ranked = rows
    .map((part) => {
      const models = modelsForManual(db, part.manualId);
      let score = (part.description || part.name || "").length;
      if (isRevisionNoise(part.description) || isRevisionNoise(part.name)) score -= 50;
      if (wantedModel && models.some((item) => item.toUpperCase().startsWith(wantedModel.toUpperCase()))) {
        score += 80;
      }
      return { part, models, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const label = partLabel(best.part);
  const models = (wantedModel
    ? best.models.filter((item) => item.toUpperCase().startsWith(wantedModel.toUpperCase()))
    : best.models
  ).slice(0, 10);
  const codes = unique(
    db.error_part_relations
      .filter((row) => row.manualId === best.part.manualId && row.fru.toUpperCase() === wanted)
      .map((row) => row.errorCode),
  ).slice(0, 8);

  const lines = [
    `PN ${best.part.fru} — ${label || "Bezeichnung im Manual nicht erkannt (PDF neu analysieren)."}`,
    models.length ? `Modell: ${models.join(", ")}` : "",
    best.part.assembly ? `Baugruppe: ${best.part.assembly}` : "",
    codes.length ? `Fehlercodes: ${codes.join(", ")}` : "",
    best.part.removal
      ? `Ausbau:\n${clipLines(best.part.removal, 2500)}`
      : "Keine Ausbauanleitung im extrahierten Manual. Bitte das PDF unter Lexmark neu analysieren.",
  ].filter(Boolean);

  return {
    answer: lines.join("\n"),
    sources: [{ title: `${models[0] || best.part.source} ${best.part.fru}`, excerpt: lines.join(" · ").slice(0, 240) }],
  };
}

function tokenMatches(hay: string, token: string): boolean {
  const stem = normalizeSearchToken(token);
  if (hay.includes(token) || hay.includes(stem)) return true;
  if (new RegExp(`\\b${escapeRegExp(token)}`, "i").test(hay)) return true;
  if (stem !== token && new RegExp(`\\b${escapeRegExp(stem)}`, "i").test(hay)) return true;
  return false;
}

function isAccessoryLabel(label: string, tokens: string[]): boolean {
  if (!ACCESSORY_RE.test(label)) return false;
  return !tokens.some((token) => ACCESSORY_RE.test(token));
}

function scorePartForTokens(part: ReplacementPart, tokens: string[], models: string[], db: LexmarkDb): number {
  const label = partLabel(part) || "";
  const hay = `${part.fru} ${part.name ?? ""} ${part.description ?? ""} ${part.assembly ?? ""} ${label}`.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (!tokenMatches(hay, token)) return 0;
    score += token.length > 5 ? 3 : 2;
    if (label && new RegExp(`\\b${escapeRegExp(token)}\\b`, "i").test(label)) score += 8;
  }
  const manualModels = modelsForManual(db, part.manualId);
  if (models[0] && manualModels.some((item) => item.toUpperCase().startsWith(models[0].toUpperCase()))) {
    score += 25;
  } else if (models[0]) {
    return 0;
  }
  if (isJunkPartLabel(label)) score -= 20;
  if (isAccessoryLabel(label, tokens)) score -= 14;
  const core = label
    .toLowerCase()
    .replace(/\b(?:cs|cx|mx|ms|xc|csx)\d+\w*\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (tokens.length === 1 && core === tokens[0]) score += 20;
  return score;
}

function searchPartsByName(db: LexmarkDb, tokens: string[], models: string[], wantRemoval = false): ChatResult | null {
  if (!tokens.length) return null;

  const ranked = db.replacement_parts
    .map((part) => ({
      part,
      models: modelsForManual(db, part.manualId),
      score: scorePartForTokens(part, tokens, models, db),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.part.fru.localeCompare(b.part.fru));

  if (!ranked.length) return null;

  const best = ranked[0];
  const hits = ranked
    .filter((row) => row.score >= best.score - 8)
    .filter((row, index, list) => list.findIndex((item) => item.part.fru === row.part.fru) === index)
    .slice(0, 8);
  const wantedModel = models[0];

  if (hits.length === 1) {
    return answerPart(db, hits[0].part.fru, wantedModel);
  }

  const subject = tokens.map((token) => token.charAt(0).toUpperCase() + token.slice(1)).join(" ");
  const modelLine = wantedModel || hits[0].models[0] || "";
  const header = modelLine ? `${subject} für ${modelLine}:` : `${subject}:`;
  const richest = [...hits].sort((a, b) => (b.part.removal?.length ?? 0) - (a.part.removal?.length ?? 0))[0];
  const lines = [
    header,
    ...hits.map((row) => {
      const label = partLabel(row.part);
      return `PN ${row.part.fru} — ${label || "Bezeichnung im Manual nicht erkannt."}`;
    }),
  ];
  if (wantRemoval) {
    lines.push("");
    if (richest?.part.removal) {
      lines.push(`Ausbau:\n${clipLines(richest.part.removal, 2500)}`);
    } else {
      lines.push("Keine Ausbauanleitung im extrahierten Manual. Bitte das PDF unter Lexmark neu analysieren.");
    }
  }

  return {
    answer: lines.join("\n"),
    sources: hits.slice(0, 4).map((row) => ({
      title: `${row.models[0] || row.part.source} ${row.part.fru}`,
      excerpt: `${row.part.fru} — ${partLabel(row.part) || ""}`.trim(),
    })),
  };
}

function negationScore(tokens: string[], hay: string): number {
  const cold =
    tokens.includes("nicht") &&
    (tokens.includes("warm") || tokens.includes("heiß") || tokens.includes("heiss") || tokens.includes("hot"));
  if (!cold) return 0;
  if (/too\s+(warm|hot)|overtemp|overheat/i.test(hay)) return -40;
  if (/did not reach|not reach|failed to heat|low temperature|below/i.test(hay)) return 24;
  return 0;
}

function searchErrorsByText(db: LexmarkDb, tokens: string[], models: string[]): ChatResult | null {
  if (!tokens.length) return null;

  let bestScore = 0;
  let bestCode = "";

  for (const error of db.error_codes) {
    if (isRevisionNoise(error.description)) continue;
    const hay = `${error.code} ${error.description ?? ""} ${error.cause ?? ""} ${error.customerResolution ?? ""}`.toLowerCase();
    let tokenScore = 0;
    for (const token of tokens) {
      if (hay.includes(token)) tokenScore += token.length > 5 ? 3 : 2;
    }
    const extra = negationScore(tokens, hay);
    if (tokenScore <= 0 && extra === 0) continue;
    let score = tokenScore + extra;
    const manualModels = modelsForManual(db, error.manualId);
    if (models[0] && manualModels.some((item) => item.toUpperCase().startsWith(models[0].toUpperCase()))) {
      score += 20;
    } else if (models[0]) {
      score -= 8;
    }
    if (score <= 0) continue;
    if (score > bestScore) {
      bestScore = score;
      bestCode = error.code;
    }
  }

  if (bestScore < 4 || !bestCode) return null;
  return answerError(db, bestCode, models[0]);
}

export function answerFromLexmark(db: LexmarkDb, query: string): ChatResult | null {
  if (!db.manuals.length) return null;
  const cleaned = query.trim();
  if (!cleaned) return null;

  const codes = extractLexmarkErrorCodes(cleaned);
  const frus = extractFrus(cleaned);
  const models = matchModels(db, cleaned);
  const wantedModel = models[0];
  const partIntent = PART_QUERY_RE.test(cleaned);
  const tokens = querySearchTokens(cleaned, models);

  if (partIntent) {
    const fromParts = searchPartsByName(db, tokens, models, true);
    if (fromParts) return fromParts;
    if (frus.length) return answerPart(db, frus[0], wantedModel);
  }

  if (codes.length && !partIntent) {
    return answerError(db, codes[0], wantedModel);
  }
  if (frus.length && !partIntent) {
    return answerPart(db, frus[0], wantedModel);
  }

  const errorTokens = unique([...tokens, ...expandSymptomTokens(cleaned)]);
  const errorIntent = ERROR_QUERY_RE.test(cleaned);
  const symptom = SYMPTOM_RE.test(cleaned);
  const errorHits = looseErrorHits(db, errorTokens, models, 3);
  const fromParts = searchPartsByName(db, tokens, models, partIntent);

  if (symptom && errorHits[0] && !partIntent) {
    return answerError(db, errorHits[0].error.code, wantedModel);
  }
  if (fromParts && (partIntent || (!symptom && !errorIntent))) {
    return fromParts;
  }
  if (errorHits[0] && !partIntent) {
    return answerError(db, errorHits[0].error.code, wantedModel);
  }
  if (!partIntent) {
    const fromErrors = searchErrorsByText(db, errorTokens, models);
    if (fromErrors) return fromErrors;
  }
  return fromParts;
}

function looseErrorHits(db: LexmarkDb, tokens: string[], models: string[], limit = 5) {
  if (!tokens.length) return [];
  const ranked = db.error_codes
    .map((error) => {
      if (isRevisionNoise(error.description)) return null;
      const hay = `${error.code} ${error.description ?? ""} ${error.cause ?? ""} ${error.customerResolution ?? ""} ${error.remoteResolution ?? ""}`.toLowerCase();
      let score = 0;
      for (const token of tokens) {
        if (hay.includes(token)) score += token.length > 5 ? 3 : 2;
      }
      const extra = negationScore(tokens, hay);
      if (score <= 0 && extra === 0) return null;
      score += extra;
      const manualModels = modelsForManual(db, error.manualId);
      if (models[0] && manualModels.some((item) => item.toUpperCase().startsWith(models[0].toUpperCase()))) {
        score += 20;
      } else if (models[0]) {
        score -= 8;
      }
      if (score <= 0) return null;
      return { error, models: manualModels, score };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => b.score - a.score);
  const unique: typeof ranked = [];
  const seen = new Set<string>();
  for (const row of ranked) {
    const key = row.error.code.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
    if (unique.length >= limit) break;
  }
  return unique;
}

function loosePartHits(db: LexmarkDb, tokens: string[], models: string[], limit = 6) {
  if (!tokens.length) return [];
  const ranked = db.replacement_parts
    .map((part) => {
      const label = partLabel(part) || "";
      const hay = `${part.fru} ${part.name ?? ""} ${part.description ?? ""} ${part.assembly ?? ""} ${label}`.toLowerCase();
      let score = 0;
      for (const token of tokens) {
        if (!tokenMatches(hay, token)) continue;
        score += token.length > 5 ? 3 : 2;
        if (label && new RegExp(`\\b${escapeRegExp(token)}\\b`, "i").test(label)) score += 10;
      }
      if (score <= 0) return null;
      const manualModels = modelsForManual(db, part.manualId);
      if (models.length) {
        const modelHit = models.some((wanted) =>
          manualModels.some((item) => item.toUpperCase().startsWith(wanted.toUpperCase())),
        );
        if (!modelHit) return null;
        score += 25;
      }
      if (isJunkPartLabel(label)) score -= 20;
      if (isAccessoryLabel(label, tokens)) score -= 18;
      return { part, models: manualModels, score, label };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => b.score - a.score || a.part.fru.localeCompare(b.part.fru));
  const unique: typeof ranked = [];
  const seen = new Set<string>();
  for (const row of ranked) {
    if (seen.has(row.part.fru)) continue;
    seen.add(row.part.fru);
    unique.push(row);
    if (unique.length >= limit) break;
  }
  return unique;
}

export function packLexmarkContext(db: LexmarkDb, query: string, searchQuery = query): {
  direct: ChatResult | null;
  facts: string;
  sources: ChatSource[];
} {
  const direct = answerFromLexmark(db, query);
  if (!db.manuals.length) {
    return { direct, facts: "", sources: direct?.sources ?? [] };
  }
  const models = matchModels(db, searchQuery);
  const tokens = querySearchTokens(searchQuery, models);
  const errors = looseErrorHits(db, tokens, models, 5);
  const parts = loosePartHits(db, tokens, models, 6);
  const lines: string[] = [];
  if (models.length) lines.push(`Modell: ${models.join(", ")}`);
  if (direct?.answer) {
    lines.push("Direkter Treffer:");
    lines.push(direct.answer);
  }
  if (errors.length) {
    lines.push("Passende Fehlercodes aus dem Manual:");
    for (const row of errors) {
      const frus = unique(
        db.error_part_relations
          .filter((rel) => rel.manualId === row.error.manualId && rel.errorCode.toUpperCase() === row.error.code.toUpperCase())
          .map((rel) => rel.fru),
      ).slice(0, 6);
      lines.push(
        [
          `- ${row.error.code}: ${clip(row.error.description || row.error.cause, 220)}`,
          row.error.cause ? `  Ursache: ${clip(row.error.cause, 280)}` : "",
          row.error.customerResolution ? `  Vor Ort: ${clip(row.error.customerResolution, 320)}` : "",
          row.error.remoteResolution ? `  Remote: ${clip(row.error.remoteResolution, 220)}` : "",
          row.error.initialPartsReplacement ? `  Erstes Teil: ${clip(row.error.initialPartsReplacement, 160)}` : "",
          frus.length ? `  FRU: ${frus.join(", ")}` : "",
          row.models.length ? `  Modelle: ${row.models.slice(0, 8).join(", ")}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }
  }
  if (parts.length) {
    lines.push("Passende Ersatzteile:");
    for (const row of parts) {
      lines.push(
        [
          `- PN ${row.part.fru} — ${row.label || "ohne Bezeichnung"}`,
          row.models.length ? `  Modelle: ${row.models.slice(0, 8).join(", ")}` : "",
          row.part.removal ? `  Ausbau: ${clip(row.part.removal, 240)}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }
  }
  const sources = [
    ...(direct?.sources ?? []),
    ...errors.slice(0, 3).map((row) => ({
      title: `${row.models[0] || row.error.source} ${row.error.code}`,
      excerpt: clip(row.error.description || row.error.cause, 180) || row.error.code,
    })),
    ...parts.slice(0, 3).map((row) => ({
      title: `${row.models[0] || row.part.source} ${row.part.fru}`,
      excerpt: `${row.part.fru} — ${row.label || ""}`.trim(),
    })),
  ].slice(0, 8);
  return {
    direct,
    facts: lines.join("\n").slice(0, 7000),
    sources,
  };
}
