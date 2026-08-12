export type KnowledgeDoc = {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  category: "manual" | "leitfaden" | "sonstiges";
  active: boolean;
  charCount: number;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeChunk = {
  id: string;
  docId: string;
  title: string;
  text: string;
  index: number;
};

export type KnowledgeDb = {
  version: 1;
  docs: KnowledgeDoc[];
  chunks: KnowledgeChunk[];
};

export function createEmptyKnowledgeDb(): KnowledgeDb {
  return { version: 1, docs: [], chunks: [] };
}

export function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function chunkText(text: string, size = 900, overlap = 120): string[] {
  const clean = text.replace(/\r\n/g, "\n").replace(/\t/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(clean.length, start + size);
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks.filter(Boolean);
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

export type RetrievedChunk = KnowledgeChunk & { score: number };

export function searchKnowledge(
  db: KnowledgeDb,
  query: string,
  limit = 5,
): RetrievedChunk[] {
  const terms = tokenize(query);
  if (!terms.length) return [];

  const activeIds = new Set(
    db.docs.filter((doc) => doc.active).map((doc) => doc.id),
  );

  const scored: RetrievedChunk[] = [];
  for (const chunk of db.chunks) {
    if (!activeIds.has(chunk.docId)) continue;
    const hay = `${chunk.title} ${chunk.text}`.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (!hay.includes(term)) continue;
      const matches = hay.split(term).length - 1;
      score += matches * (term.length > 5 ? 2 : 1);
      if (chunk.title.toLowerCase().includes(term)) score += 2;
    }
    if (score > 0) scored.push({ ...chunk, score });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** @deprecated Use answerKnowledgeQuery from @/lib/wissen/chat */
export function buildChatAnswer(
  query: string,
  hits: RetrievedChunk[],
): { answer: string; sources: { title: string; excerpt: string }[] } {
  if (!hits.length) {
    return {
      answer:
        "Dazu habe ich in den aktiven Manualen und Leitfäden nichts Passendes gefunden. Bitte prüfe die Wissensdatenbank oder formuliere die Frage anders.",
      sources: [],
    };
  }

  const best = hits[0];
  const excerpt =
    best.text.length > 360 ? `${best.text.slice(0, 360).trim()}…` : best.text.trim();

  return {
    answer: excerpt,
    sources: hits.slice(0, 2).map((hit) => ({
      title: hit.title,
      excerpt: hit.text.slice(0, 220).trim() + (hit.text.length > 220 ? "…" : ""),
    })),
  };
}
