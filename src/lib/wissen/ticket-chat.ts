import {
  countValues,
  extractErrorCodes,
  extractModels,
  extractPartNumbers,
  ticketSearchBlob,
  type CountHit,
  type KnowledgeTicket,
} from "@/lib/wissen/tickets";

type ChatSource = { title: string; excerpt: string };
type ChatResult = { answer: string; sources: ChatSource[] };

function formatCountList(hits: CountHit[], limit = 3): string {
  if (!hits.length) return "";
  return hits
    .slice(0, limit)
    .map((hit) => `${hit.value} (${hit.count}×)`)
    .join(", ");
}

function ticketSources(tickets: KnowledgeTicket[], limit = 4): ChatSource[] {
  return tickets.slice(0, limit).map((ticket) => ({
    title: ticket.ticketNo || "Altticket",
    excerpt: [
      ticket.model ? `Maschine ${ticket.model}` : "",
      ticket.errorCodes.length ? `Fehler ${ticket.errorCodes.join(", ")}` : "",
      ticket.partNumbers.length ? `Teile ${ticket.partNumbers.join(", ")}` : "",
      ticket.summary || ticket.note,
    ]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 220),
  }));
}

function scoreTicket(ticket: KnowledgeTicket, tokens: string[]): number {
  if (!tokens.length) return 0;
  const hay = ticketSearchBlob(ticket).toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (!hay.includes(token)) continue;
    score += token.length > 5 ? 3 : 2;
  }
  return score;
}

function queryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function summarizeSet(tickets: KnowledgeTicket[], headline: string): ChatResult {
  const models = countValues(tickets.map((item) => item.model));
  const parts = countValues(tickets.flatMap((item) => item.partNumbers));
  const errors = countValues(tickets.flatMap((item) => item.errorCodes));
  const lines = [headline];
  const modelLine = formatCountList(models);
  const partLine = formatCountList(parts);
  const errorLine = formatCountList(errors);
  if (modelLine) lines.push(`Häufigste Maschinen: ${modelLine}.`);
  if (partLine) lines.push(`Häufigste Ersatzteile: ${partLine}.`);
  if (errorLine && !/^Fehler /i.test(headline)) lines.push(`Häufigste Fehler: ${errorLine}.`);
  if (tickets.length >= 5) {
    lines.push("Je mehr Alttickets in der Datenbank liegen, desto belastbarer ist dieses Muster.");
  }
  return {
    answer: lines.join("\n"),
    sources: ticketSources(tickets),
  };
}

export function searchTickets(tickets: KnowledgeTicket[], query: string, limit = 8): KnowledgeTicket[] {
  const tokens = queryTokens(query);
  const codes = extractErrorCodes(query);
  const parts = extractPartNumbers(query);
  const models = extractModels(query);
  const scored = tickets
    .map((ticket) => {
      let score = scoreTicket(ticket, tokens);
      if (codes.some((code) => ticket.errorCodes.includes(code))) score += 40;
      if (parts.some((part) => ticket.partNumbers.includes(part))) score += 40;
      if (models.some((model) => ticket.model === model)) score += 20;
      return { ticket, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((item) => item.ticket);
}

export function answerFromTickets(tickets: KnowledgeTicket[], query: string): ChatResult | null {
  if (!tickets.length) return null;
  const cleaned = query.trim();
  if (!cleaned) return null;

  const codes = extractErrorCodes(cleaned);
  const parts = extractPartNumbers(cleaned);
  const models = extractModels(cleaned);

  if (codes.length) {
    const code = codes[0];
    let hits = tickets.filter((item) => item.errorCodes.includes(code));
    if (models[0]) {
      const byModel = hits.filter((item) => item.model === models[0]);
      if (byModel.length) hits = byModel;
    }
    if (!hits.length) {
      return {
        answer: `Zum Fehler ${code} habe ich in den importierten Alttickets noch kein Muster. Mehr geschlossene Tickets mit diesem Code machen die Aussage sicherer.`,
        sources: [],
      };
    }
    const modelHint = models[0] ? ` bei ${models[0]}` : "";
    return summarizeSet(
      hits,
      `Fehler ${code}${modelHint} kommt in ${hits.length} Ticket${hits.length === 1 ? "" : "s"} vor.`,
    );
  }

  if (parts.length) {
    const part = parts[0];
    const hits = tickets.filter((item) => item.partNumbers.includes(part));
    if (!hits.length) {
      return {
        answer: `Das Ersatzteil ${part} kommt in den importierten Alttickets noch nicht vor.`,
        sources: [],
      };
    }
    return summarizeSet(hits, `${part} wurde in ${hits.length} Ticket${hits.length === 1 ? "" : "s"} eingesetzt.`);
  }

  if (models.length) {
    const model = models[0];
    const hits = tickets.filter((item) => item.model === model);
    if (!hits.length) {
      return {
        answer: `Zur Maschine ${model} habe ich in den Alttickets noch keine Einträge.`,
        sources: [],
      };
    }
    return summarizeSet(hits, `${model}: ${hits.length} Ticket${hits.length === 1 ? "" : "s"} in der Wissensdatenbank.`);
  }

  const hits = searchTickets(tickets, cleaned, 6);
  if (!hits.length) return null;
  return summarizeSet(
    hits,
    `Dazu passen ${hits.length} Altticket${hits.length === 1 ? "" : "s"}.`,
  );
}
