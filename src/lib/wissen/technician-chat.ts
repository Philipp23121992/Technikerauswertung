import { aiConfigured, completeChat } from "@/lib/lexmark/ai";
import { extractErrorCodes as extractLexmarkErrorCodes, extractFrus, extractModels } from "@/lib/lexmark/extract";
import type { LexmarkDb } from "@/lib/lexmark/types";
import type { ChatResult, ChatSource } from "./chat";
import { packLexmarkContext, isPartQuery } from "./lexmark-chat";
import { searchKnowledge, type KnowledgeDb } from "./types";
import { answerFromTickets, searchTickets } from "./ticket-chat";
import type { KnowledgeTicket } from "./tickets";

export type TechnicianChatMessage = { role: "user" | "assistant"; content: string };

const FOLLOWUP_RE =
  /\b(nicht geholfen|hat nicht|weiter|nächster|naechster|danach|immer noch|trotzdem|und jetzt|kein erfolg|als nächstes|als naechstes|nächster schritt)\b/i;

const SYNONYM_GROUPS: Array<{ keys: string[]; extra: string[] }> = [
  { keys: ["nicht warm", "nicht heiß", "nicht heiss", "heizt nicht", "keine hitze"], extra: ["fuser", "heat", "temperature", "reach"] },
  { keys: ["papierstau", "stau", "klemme"], extra: ["jam", "paper jam", "media jam"] },
  { keys: ["streifen", "linien", "striche"], extra: ["streak", "line", "band"] },
  { keys: ["blass", "hell", "schwach"], extra: ["light print", "fade", "toner"] },
  { keys: ["geräusch", "knacken", "schleifen"], extra: ["noise", "grinding", "gear"] },
  { keys: ["geruch", "brennen", "rauch"], extra: ["fuser", "overheat", "smell"] },
  { keys: ["einzug", "adf", "scanner"], extra: ["adf", "scanner", "pick"] },
  { keys: ["netzwerk", "wlan", "offline"], extra: ["network", "wireless"] },
];

const SYSTEM_PROMPT = `Du bist der Diagnose-Assistent für APM-Servicetechniker (Lexmark und verwandte Geräte).
Du hilfst bei der Fehlersuche vor Ort.

Regeln:
- Nutze ausschließlich den gelieferten Kontext (Manual, Ersatzteillisten, Alttickets).
- Keine FRU-/Teilenummern erfinden. Nur Nummern nennen, die im Kontext stehen.
- Keine Modelle oder Fehlercodes erfinden.
- Wenn Modell oder Fehlercode fehlen: zuerst nachfragen.
- Deutsch, knapp, praxisnah. Kein Marketington.
- Struktur wenn passend:
  1) Kurzdiagnose
  2) Prüfschritte vor Ort (aus Customer/Remote Resolution)
  3) Mögliche FRUs mit Bezeichnung und Spannung falls vorhanden
  4) Hinweis aus Alttickets, falls vorhanden
- Bei unsicherem Kontext klar sagen, was fehlt.
- Kundennamen aus Tickets nicht wiederholen.`;

export function stickyHints(history: TechnicianChatMessage[]): {
  models: string[];
  codes: string[];
  frus: string[];
} {
  const blob = history
    .slice(-8)
    .map((item) => item.content)
    .join("\n");
  return {
    models: extractModels(blob),
    codes: extractLexmarkErrorCodes(blob),
    frus: extractFrus(blob),
  };
}

function queryHasPartNoun(query: string): boolean {
  return query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .map((token) => (token.length > 4 && token.endsWith("s") && !token.endsWith("ss") ? token.slice(0, -1) : token))
    .some((token) => {
      if (token.length < 4) return false;
      if (isPartQuery(token)) return false;
      return !/^(bitte|eine|einer|einem|eines|diese|dieser|dieses|nochmal|jetzt|dann|auch|modell|drucker|gerät|gerat|printer|model)$/i.test(
        token,
      );
    });
}

export function withStickyContext(query: string, history: TechnicianChatMessage[]): string {
  const sticky = stickyHints(history.filter((item) => item.content !== query));
  let next = query.trim();
  if (!extractModels(next).length && sticky.models[0]) next += ` ${sticky.models[0]}`;
  const partFollowUp = isPartQuery(query);
  const followUp = FOLLOWUP_RE.test(query) && !partFollowUp;
  if (partFollowUp && !extractFrus(next).length && sticky.frus[0] && !queryHasPartNoun(query)) {
    next += ` ${sticky.frus[0]}`;
  }
  if (followUp && !extractLexmarkErrorCodes(next).length && sticky.codes[0]) next += ` ${sticky.codes[0]}`;
  if (followUp && !extractFrus(next).length && sticky.frus[0]) next += ` ${sticky.frus[0]}`;
  return next.replace(/\s+/g, " ").trim();
}

function restAfterModel(query: string): string {
  let next = query;
  for (const model of extractModels(query)) {
    next = next.replace(new RegExp(model.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), " ");
  }
  return next
    .replace(/\b(modell|drucker|gerät|printer|maschine|typ|typschild)\b/gi, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function isModelOnlyQuery(query: string): boolean {
  if (!extractModels(query).length) return false;
  const rest = restAfterModel(query);
  if (!rest) return true;
  return rest.split(/\s+/).every((word) => /^(bitte|das|der|die|ist|ok|okay|ja|danke)$/i.test(word));
}

export function listChatModels(db: LexmarkDb): string[] {
  const all = [
    ...new Set(
      db.printer_models
        .map((item) => item.model.replace(/\s+/g, "").toUpperCase())
        .filter(Boolean),
    ),
  ];
  return all
    .filter((model) => !all.some((other) => other !== model && model.startsWith(other) && other.length >= 5))
    .sort((a, b) => a.localeCompare(b, "de"));
}

const ASK_MODEL =
  "Welches Modell hast du vor dir?\nBitte das Typenschild nennen, z. B. CX725, MS821 oder XC4140.\nOhne Modell kann ich Fehlercode und Ersatzteile nicht sicher zuordnen.";

function withModel(result: ChatResult, model: string | null): ChatResult {
  return { ...result, model };
}

export function expandDiagnosticQuery(query: string): string {
  const lower = query.toLowerCase();
  const extra: string[] = [];
  for (const group of SYNONYM_GROUPS) {
    if (group.keys.some((key) => lower.includes(key))) extra.push(...group.extra);
  }
  if (!extra.length) return query;
  return `${query} ${extra.join(" ")}`.replace(/\s+/g, " ").trim();
}

function uniqueSources(items: ChatSource[]): ChatSource[] {
  const seen = new Set<string>();
  const out: ChatSource[] = [];
  for (const item of items) {
    const key = `${item.title}|${item.excerpt}`.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= 8) break;
  }
  return out;
}

function ticketFacts(tickets: KnowledgeTicket[], query: string): { text: string; sources: ChatSource[] } {
  const summary = answerFromTickets(tickets, query);
  const hits = searchTickets(tickets, query, 5);
  const lines = [
    summary?.answer ? `Alttickets: ${summary.answer}` : "",
    ...hits.slice(0, 4).map((ticket) => {
      return `- ${ticket.ticketNo || "Ticket"} · ${ticket.model || "ohne Modell"} · ${
        ticket.errorCodes.length ? `Fehler ${ticket.errorCodes.slice(0, 4).join(", ")}` : "kein Code"
      } · ${ticket.partNumbers.length ? `Teile ${ticket.partNumbers.slice(0, 4).join(", ")}` : "kein Teil"} · ${
        (ticket.summary || ticket.note || "").replace(/\s+/g, " ").trim().slice(0, 160)
      }`;
    }),
  ].filter(Boolean);
  return {
    text: lines.join("\n").slice(0, 2200),
    sources: summary?.sources ?? [],
  };
}

function fallbackAnswer(
  lexmark: { direct: ChatResult | null; facts: string; sources: ChatSource[] },
  tickets: { text: string; sources: ChatSource[] },
  docs: ChatSource[] = [],
): ChatResult {
  const docText = docs
    .slice(0, 2)
    .map((doc) => `- ${doc.title}: ${doc.excerpt}`)
    .join("\n");
  if (lexmark.direct?.answer) {
    const extra = tickets.text ? `\n\nAus Alttickets:\n${tickets.text}` : "";
    return {
      answer: `${lexmark.direct.answer}${extra}`,
      sources: uniqueSources([...(lexmark.direct.sources ?? []), ...lexmark.sources, ...tickets.sources, ...docs]),
    };
  }
  const chunks = [
    lexmark.facts ? `Das habe ich in den Manualen gefunden:\n${lexmark.facts}` : "",
    tickets.text,
    docText ? `Aus den importierten Listen:\n${docText}` : "",
    "Wenn der Fehlercode im Display steht, diesen bitte mit dem Modell nennen – dann wird die Anleitung genauer.",
  ].filter(Boolean);
  if (!lexmark.facts && !tickets.text && !docText) {
    return {
      answer:
        "Dazu habe ich in Manual und Alttickets nichts Passendes. Nenne bitte Modell (z. B. CX725) und den Fehlercode oder das Symptom (z. B. wird nicht warm, Papierstau).",
      sources: [],
    };
  }
  return {
    answer: chunks.join("\n\n"),
    sources: uniqueSources([...lexmark.sources, ...tickets.sources, ...docs]),
  };
}

export async function answerTechnicianChat(input: {
  lexmark: LexmarkDb;
  tickets: KnowledgeTicket[];
  knowledge: KnowledgeDb;
  messages: TechnicianChatMessage[];
  useAi?: boolean;
}): Promise<ChatResult> {
  const history = input.messages.filter((item) => item.content.trim());
  const lastUser = [...history].reverse().find((item) => item.role === "user");
  const query = lastUser?.content.trim() ?? "";
  if (!query) {
    return withModel({ answer: ASK_MODEL, sources: [] }, null);
  }

  const lookup = withStickyContext(query, history);
  const model = extractModels(lookup)[0] ?? null;
  if (!model) {
    return withModel(
      {
        answer: ASK_MODEL,
        sources: [],
      },
      null,
    );
  }
  if (
    isModelOnlyQuery(query) &&
    !extractLexmarkErrorCodes(query).length &&
    !extractFrus(query).length
  ) {
    return withModel(
      {
        answer: `Modell ${model} merke ich mir für dieses Gespräch.\nWas zeigt das Display (Fehlercode) oder welches Symptom hast du? z. B. wird nicht warm, Papierstau, Fuser.`,
        sources: [],
      },
      model,
    );
  }

  const expanded = expandDiagnosticQuery(lookup);
  const lexmark = packLexmarkContext(input.lexmark, lookup, expanded);
  const tickets = ticketFacts(input.tickets, lookup);
  const docs = searchKnowledge(input.knowledge, expanded, 3).map((chunk) => ({
    title: chunk.title,
    excerpt: chunk.text.replace(/\s+/g, " ").trim().slice(0, 280),
  }));
  const docText = docs.map((doc) => `- ${doc.title}: ${doc.excerpt}`).join("\n");
  const structured = extractLexmarkErrorCodes(lookup).length > 0 || extractFrus(lookup).length > 0;
  const canSkipModel = Boolean(lexmark.direct?.answer);

  if (canSkipModel || structured || !(input.useAi ?? aiConfigured())) {
    return withModel(fallbackAnswer(lexmark, tickets, docs), model);
  }

  const prior = history
    .slice(-8)
    .map((item) => ({ role: item.role, content: item.content.slice(0, 1200) }));

  const context = [
    "Kontext aus Lexmark-Manualen und Listen:",
    lexmark.facts || "(kein direkter Manual-Treffer)",
    tickets.text ? `\n${tickets.text}` : "",
    docText ? `\nWeitere Wissensabschnitte:\n${docText}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 9000);

  const ai = await completeChat(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: context },
      ...prior,
    ],
    { temperature: 0.2, maxTokens: 900 },
  );

  if (!ai.text) {
    return withModel(fallbackAnswer(lexmark, tickets, docs), model);
  }

  return withModel(
    {
      answer: ai.text,
      sources: uniqueSources([...lexmark.sources, ...tickets.sources, ...docs]),
    },
    model,
  );
}
