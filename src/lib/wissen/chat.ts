import type { KnowledgeChunk, KnowledgeDb } from "@/lib/wissen/types";
import { searchKnowledge, type RetrievedChunk } from "@/lib/wissen/types";
import { answerFromTickets } from "@/lib/wissen/ticket-chat";
import type { KnowledgeTicket } from "@/lib/wissen/tickets";

export type ChatSource = { title: string; excerpt: string };
export type ChatResult = { answer: string; sources: ChatSource[]; model?: string | null };

type ChatIntent = "part" | "error" | "general";

const PART_PN_RE = /\b(\d{2}X\d{4}|\d{2}[A-Z]\d[A-Z]\d{2})\b/gi;
const ERROR_CODE_RE = /\b(\d{1,3}\.\d{2}[A-Za-z]?)\b/g;

const PART_INTENT_RE =
  /\b(teilenummer|teile[- ]?nr|teilnr|ersatzteil(?:e|nummer|nummern)?|bestellnummer|artikelnummer|fru|p\/?n|part\s*number|part\s*no|ausbau|ausbauen|anleitung(?:en)?|removal|removing|demontage|tausch|tauschen|austauschen|austausch|wechsel|wechseln|auswechseln|ersetzen|einbau|einbauen|replace|replacing|replacement)\b/i;

const ERROR_INTENT_RE =
  /\b(fehlercode|fehler[- ]?code|error[- ]?code|störungscode|fehlermeldung|error\s*message|user\s*attendance|was\s+bedeutet|bedeutung)\b/i;

const STOP_WORDS = new Set(
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
    "eines",
    "einem",
    "einen",
    "und",
    "oder",
    "für",
    "von",
    "vom",
    "mit",
    "ohne",
    "bei",
    "zum",
    "zur",
    "aus",
    "ist",
    "sind",
    "hat",
    "habe",
    "haben",
    "welche",
    "welcher",
    "welches",
    "welchen",
    "was",
    "wie",
    "wo",
    "bitte",
    "mir",
    "mich",
    "gibt",
    "gibt's",
    "suche",
    "zeig",
    "zeige",
    "nenn",
    "nenne",
    "lautet",
    "laut",
    "the",
    "a",
    "an",
    "of",
    "for",
    "to",
    "in",
    "on",
    "and",
    "or",
    "is",
    "are",
    "what",
    "which",
    "teilenummer",
    "teile",
    "nr",
    "teilnr",
    "ersatzteil",
    "ersatzteile",
    "ersatzteilnummer",
    "ersatzteilnummern",
    "bestellnummer",
    "artikelnummer",
    "fru",
    "pn",
    "p",
    "n",
    "part",
    "number",
    "no",
    "fehlercode",
    "fehler",
    "code",
    "error",
    "störungscode",
    "fehlermeldung",
    "message",
    "bedeutet",
    "bedeutung",
    "erklärung",
    "erlaeuterung",
    "erläuterung",
  ].map((w) => w.toLowerCase()),
);

function activeChunks(db: KnowledgeDb): KnowledgeChunk[] {
  const activeIds = new Set(db.docs.filter((doc) => doc.active).map((doc) => doc.id));
  return db.chunks.filter((chunk) => activeIds.has(chunk.docId));
}

function normalizeSpace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function cleanDescription(value: string): string {
  let text = normalizeSpace(value)
    .replace(/\s*--+\s*$/g, "")
    .replace(/\bRemoval\b.*$/i, "")
    .replace(/\bprocedure\b.*$/i, "")
    .trim();

  // PDF tables often repeat the label twice: "Left cover Left cover"
  const words = text.split(" ");
  if (words.length >= 4 && words.length % 2 === 0) {
    const half = words.length / 2;
    const left = words.slice(0, half).join(" ");
    const right = words.slice(half).join(" ");
    if (left.toLowerCase() === right.toLowerCase()) text = left;
  }

  return text;
}

function extractPnsFromQuery(query: string): string[] {
  const found = new Set<string>();
  for (const match of query.matchAll(PART_PN_RE)) {
    found.add(match[1].toUpperCase());
  }
  return [...found];
}

function extractErrorCodesFromQuery(query: string): string[] {
  const found = new Set<string>();
  for (const match of query.matchAll(ERROR_CODE_RE)) {
    found.add(match[1].toUpperCase());
  }
  return [...found];
}

function detectIntent(query: string): ChatIntent {
  const hasPn = extractPnsFromQuery(query).length > 0;
  const hasError = extractErrorCodesFromQuery(query).length > 0;
  const partIntent = PART_INTENT_RE.test(query);
  const errorIntent = ERROR_INTENT_RE.test(query);

  if (hasError && (errorIntent || !hasPn)) return "error";
  if (hasPn && (partIntent || !hasError)) return "part";
  if (errorIntent && !partIntent) return "error";
  if (partIntent) return "part";
  return "general";
}

function queryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function scoreText(haystack: string, tokens: string[]): number {
  const hay = haystack.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (!hay.includes(token)) continue;
    score += token.length > 5 ? 3 : 2;
    if (new RegExp(`\\b${token}\\b`, "i").test(haystack)) score += 1;
  }
  return score;
}

type PartHit = {
  pn: string;
  description: string;
  title: string;
  score: number;
};

function collectPartHits(chunks: KnowledgeChunk[], tokens: string[], preferPn?: string): PartHit[] {
  const hits: PartHit[] = [];
  const prefer = preferPn?.toUpperCase();

  for (const chunk of chunks) {
    const text = chunk.text;
    const rowRe = /\b(\d{2}X\d{4})\s+(\d+)\s+(\d+)\s+([^\n]{2,160})/gi;
    for (const match of text.matchAll(rowRe)) {
      const pn = match[1].toUpperCase();
      if (prefer && pn !== prefer) continue;
      const description = cleanDescription(match[4]);
      if (!description || description.length < 2) continue;
      const descScore = scoreText(description, tokens);
      if (!prefer && tokens.length && descScore <= 0) continue;
      const score = (prefer ? 100 : descScore) + 20;
      hits.push({ pn, description, title: chunk.title, score });
    }

    const labeledRe =
      /\b(?:PN|P\/N|FRU)\s*(\d{2}X\d{4}|\d{2}[A-Z]\d[A-Z]\d{2})\s*(?:\(([^)]{2,120})\)|[-–—:]\s*([^\n.]{2,120}))?/gi;
    for (const match of text.matchAll(labeledRe)) {
      const pn = match[1].toUpperCase();
      if (prefer && pn !== prefer) continue;
      const description = cleanDescription(match[2] || match[3] || "");
      if (!description) {
        if (!prefer) continue;
        hits.push({
          pn,
          description: pn,
          title: chunk.title,
          score: 50,
        });
        continue;
      }
      const descScore = scoreText(description, tokens);
      if (!prefer && tokens.length && descScore <= 0) continue;
      hits.push({
        pn,
        description,
        title: chunk.title,
        score: (prefer ? 90 : descScore) + 10,
      });
    }

    const lineRe = /\b(\d{2}X\d{4}|\d{2}[A-Z]\d[A-Z]\d{2})\s*[-–—]\s*([^\n]{2,160})/gi;
    for (const match of text.matchAll(lineRe)) {
      const pn = match[1].toUpperCase();
      if (prefer && pn !== prefer) continue;
      const description = cleanDescription(match[2] || "");
      if (!description) continue;
      const descScore = scoreText(description, tokens);
      if (!prefer && tokens.length && descScore <= 0) continue;
      hits.push({
        pn,
        description,
        title: chunk.title,
        score: (prefer ? 85 : descScore) + 8,
      });
    }
  }

  hits.sort((a, b) => b.score - a.score || a.pn.localeCompare(b.pn));
  const unique: PartHit[] = [];
  const seenPn = new Set<string>();
  for (const hit of hits) {
    if (seenPn.has(hit.pn)) continue;
    seenPn.add(hit.pn);
    unique.push(hit);
  }
  return unique;
}

type ErrorHit = {
  code: string;
  explanation: string;
  title: string;
  score: number;
};

function extractErrorBlock(text: string, code: string): string | null {
  const escaped = code.replace(/\./g, "\\.");
  const re = new RegExp(
    `(?:^|\\n|[\\s])(${escaped})\\s+([\\s\\S]*?)(?=(?:\\n\\s*\\d{1,3}\\.\\d{2}[A-Za-z]?\\s+)|$)`,
    "i",
  );
  const match = text.match(re);
  let explanation = match?.[2] ? normalizeSpace(match[2]) : "";
  if (!explanation && text.toUpperCase().includes(code.toUpperCase())) {
    explanation = normalizeSpace(text.replace(new RegExp(escaped, "ig"), " "));
  }
  explanation = explanation
    .replace(/\s*See\s+[^.]+(?:on page\s+\d+)?\.?/gi, "")
    .replace(/\s*Siehe\s+[^.]+(?:auf Seite\s+\d+)?\.?/gi, "")
    .trim();
  if (explanation.length > 420) explanation = `${explanation.slice(0, 420).trim()}…`;
  return explanation || null;
}

function collectErrorHits(chunks: KnowledgeChunk[], codes: string[], tokens: string[]): ErrorHit[] {
  const hits: ErrorHit[] = [];
  const wanted = codes.map((c) => c.toUpperCase());

  for (const chunk of chunks) {
    if (wanted.length) {
      for (const code of wanted) {
        if (!chunk.text.toUpperCase().includes(code)) continue;
        const explanation = extractErrorBlock(chunk.text, code);
        if (!explanation) continue;
        hits.push({
          code,
          explanation,
          title: chunk.title,
          score: 100 + scoreText(explanation, tokens),
        });
      }
      continue;
    }

    const codeRe = /(?:^|\n)\s*(\d{2,3}\.\d{1,3}[A-Za-z]?)\s+([^\n]{8,200})/g;
    for (const match of chunk.text.matchAll(codeRe)) {
      const code = match[1].toUpperCase();
      const explanation = normalizeSpace(match[2]);
      const score = scoreText(`${code} ${explanation}`, tokens);
      if (score <= 0) continue;
      hits.push({ code, explanation, title: chunk.title, score });
    }
  }

  hits.sort((a, b) => b.score - a.score);
  const unique: ErrorHit[] = [];
  const seen = new Set<string>();
  for (const hit of hits) {
    const key = hit.code;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(hit);
  }
  return unique;
}

function answerPart(db: KnowledgeDb, query: string): ChatResult {
  const chunks = activeChunks(db);
  const pns = extractPnsFromQuery(query);
  const tokens = queryTokens(query);
  const preferPn = pns[0];
  const hits = collectPartHits(chunks, tokens, preferPn);

  if (!hits.length && preferPn) {
    return {
      answer: `Zur Teilenummer ${preferPn} habe ich in den aktiven Dokumenten keinen Katalogeintrag gefunden.`,
      sources: [],
    };
  }

  if (!hits.length) {
    return {
      answer:
        "Dazu habe ich keine passende Teilenummer gefunden. Nenne bitte das Bauteil genauer (z. B. „Teilenummer Left cover“ oder „PN 41X2889“).",
      sources: [],
    };
  }

  // Gezielte Antwort: beste PN; nur bei Gleichstand knapp mehrere
  const best = hits[0];
  const close = hits
    .filter((hit) => hit.score >= best.score - 0.5)
    .slice(0, preferPn ? 1 : 2);

  if (preferPn || tokens.length > 0) {
    const hit = close[0];
    return {
      answer: hit.description.toUpperCase() === hit.pn ? hit.pn : `${hit.pn} — ${hit.description}`,
      sources: [{ title: hit.title, excerpt: `${hit.pn} — ${hit.description}` }],
    };
  }

  return {
    answer: close.map((hit) => `${hit.pn} — ${hit.description}`).join("\n"),
    sources: close.map((hit) => ({
      title: hit.title,
      excerpt: `${hit.pn} — ${hit.description}`,
    })),
  };
}

function answerError(db: KnowledgeDb, query: string): ChatResult {
  const chunks = activeChunks(db);
  const codes = extractErrorCodesFromQuery(query);
  const tokens = queryTokens(query);
  const hits = collectErrorHits(chunks, codes, tokens);

  if (!hits.length && codes.length) {
    return {
      answer: `Zum Fehlercode ${codes[0]} habe ich in den aktiven Dokumenten keine Erläuterung gefunden.`,
      sources: [],
    };
  }

  if (!hits.length) {
    return {
      answer:
        "Dazu habe ich keinen passenden Fehlercode gefunden. Frage z. B. „Fehlercode 42.49“ oder „Was bedeutet 42.60?“.",
      sources: [],
    };
  }

  const hit = hits[0];
  return {
    answer: `${hit.code} — ${hit.explanation}`,
    sources: [{ title: hit.title, excerpt: `${hit.code} — ${hit.explanation}` }],
  };
}

function answerGeneral(db: KnowledgeDb, query: string): ChatResult {
  const hits = searchKnowledge(db, query, 3);
  if (!hits.length) {
    return {
      answer:
        "Dazu habe ich in den aktiven Manualen und Leitfäden nichts Passendes gefunden. Bitte prüfe die Wissensdatenbank oder formuliere die Frage anders.",
      sources: [],
    };
  }

  const best = pickBestExcerpt(hits[0], query);
  const sources = hits.slice(0, 2).map((hit) => ({
    title: hit.title,
    excerpt: pickBestExcerpt(hit, query),
  }));

  return {
    answer: best,
    sources,
  };
}

function pickBestExcerpt(hit: RetrievedChunk, query: string): string {
  const tokens = queryTokens(query);
  const text = hit.text.replace(/\r\n/g, "\n");
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => normalizeSpace(s))
    .filter((s) => s.length > 40);

  let best = sentences[0] || normalizeSpace(text).slice(0, 280);
  let bestScore = -1;
  for (const sentence of sentences.slice(0, 40)) {
    const score = scoreText(sentence, tokens);
    if (score > bestScore) {
      bestScore = score;
      best = sentence;
    }
  }

  if (best.length > 360) best = `${best.slice(0, 360).trim()}…`;
  return best;
}

export function answerKnowledgeQuery(
  db: KnowledgeDb,
  query: string,
  tickets: KnowledgeTicket[] = [],
): ChatResult {
  const cleaned = query.trim();
  if (!cleaned) {
    return { answer: "Bitte stelle eine Frage.", sources: [] };
  }

  const fromTickets = answerFromTickets(tickets, cleaned);
  const intent = detectIntent(cleaned);

  if (fromTickets?.sources.length) {
    if (intent === "error" || intent === "part") {
      const fromDocs = intent === "part" ? answerPart(db, cleaned) : answerError(db, cleaned);
      const usefulDoc =
        fromDocs.sources.length > 0 &&
        !/keine|nicht gefunden/i.test(fromDocs.answer);
      if (usefulDoc) {
        return {
          answer: `${fromTickets.answer}\n\nAus den Manualen: ${fromDocs.answer}`,
          sources: [...fromTickets.sources, ...fromDocs.sources].slice(0, 6),
        };
      }
    }
    return fromTickets;
  }

  if (intent === "part") return answerPart(db, cleaned);
  if (intent === "error") return answerError(db, cleaned);
  return answerGeneral(db, cleaned);
}
