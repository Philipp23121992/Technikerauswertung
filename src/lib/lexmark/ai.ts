import { AiManualSchema, type AiManualPayload } from "./types";
import { extractErrorCodes, extractFrus, extractModels, groundedText, sourceContains } from "./extract";

export function aiConfigured(): boolean {
  return Boolean(
    process.env.OPENAI_API_KEY?.trim() ||
      process.env.AZURE_OPENAI_API_KEY?.trim() ||
      process.env.AZURE_OPENAI_KEY?.trim(),
  );
}

function endpointConfig(): { url: string; headers: Record<string, string> } | null {
  const azureKey = process.env.AZURE_OPENAI_API_KEY?.trim() || process.env.AZURE_OPENAI_KEY?.trim();
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT?.trim();
  const azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT?.trim();
  if (azureKey && azureEndpoint && azureDeployment) {
    const base = azureEndpoint.replace(/\/$/, "");
    const version = process.env.AZURE_OPENAI_API_VERSION?.trim() || "2024-10-21";
    return {
      url: `${base}/openai/deployments/${azureDeployment}/chat/completions?api-version=${encodeURIComponent(version)}`,
      headers: {
        "Content-Type": "application/json",
        "api-key": azureKey,
      },
    };
  }
  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  if (!openAiKey) return null;
  const base = (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
  return {
    url: `${base}/chat/completions`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiKey}`,
    },
  };
}

export type LlmChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function completeChat(
  messages: LlmChatMessage[],
  options?: { temperature?: number; maxTokens?: number; timeoutMs?: number },
): Promise<{ text: string | null; warning: string | null }> {
  const config = endpointConfig();
  if (!config) {
    return { text: null, warning: "Kein OpenAI-/Azure-Key in .env – KI übersprungen." };
  }
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  try {
    const res = await fetch(config.url, {
      method: "POST",
      headers: config.headers,
      signal: AbortSignal.timeout(options?.timeoutMs ?? 8000),
      body: JSON.stringify({
        model,
        temperature: options?.temperature ?? 0.2,
        max_tokens: options?.maxTokens ?? 900,
        messages,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { text: null, warning: `KI-API Fehler HTTP ${res.status}${body ? `: ${body.slice(0, 180)}` : ""}` };
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content?.trim() || null;
    if (!text) return { text: null, warning: "KI lieferte keinen Text." };
    return { text, warning: null };
  } catch (error) {
    const aborted = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return {
      text: null,
      warning: aborted
        ? "KI-API Zeitüberschreitung – Antwort kommt aus den Listen."
        : `KI-API Fehler: ${error instanceof Error ? error.message : "unbekannt"}`,
    };
  }
}

const SYSTEM_PROMPT = `Du extrahierst ausschließlich Fakten aus dem gelieferten Lexmark-Manualtext.
Regeln:
- Niemals Informationen erfinden.
- Keine FRU-Nummern erfinden.
- Keine Ersatzteile erfinden.
- Keine Modellkompatibilität vermuten.
- Keine Seitenzahlen erfinden.
- Fehlt etwas: null.
Antwort nur als JSON-Objekt mit keys models, errorCodes, parts.`;

function clipSource(text: string, max = 18000): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n[gekürzt]`;
}

function keepGrounded(payload: AiManualPayload, source: string): AiManualPayload {
  const knownFrus = new Set(extractFrus(source));
  const knownCodes = new Set(extractErrorCodes(source));
  const knownModels = new Set(extractModels(source));

  return {
    models: payload.models
      .filter((item) => knownModels.has(item.model.replace(/\s+/g, "").toUpperCase()) || sourceContains(source, item.model))
      .map((item) => ({
        ...item,
        series: groundedText(source, item.series),
        machineType: item.machineType && sourceContains(source, item.machineType) ? item.machineType : null,
        modelNumber: item.modelNumber && sourceContains(source, item.modelNumber) ? item.modelNumber : item.model,
        page: item.page,
      })),
    errorCodes: payload.errorCodes
      .filter((item) => knownCodes.has(item.code.toUpperCase()) || sourceContains(source, item.code))
      .map((item) => ({
        ...item,
        description: groundedText(source, item.description),
        category: groundedText(source, item.category),
        cause: groundedText(source, item.cause),
        customerResolution: groundedText(source, item.customerResolution),
        remoteResolution: groundedText(source, item.remoteResolution),
        detailedDiagnostics: groundedText(source, item.detailedDiagnostics),
        initialPartsReplacement: groundedText(source, item.initialPartsReplacement),
        frus: item.frus.filter((fru) => knownFrus.has(fru.toUpperCase()) || sourceContains(source, fru)),
      })),
    parts: payload.parts
      .filter((item) => knownFrus.has(item.fru.toUpperCase()) || sourceContains(source, item.fru))
      .map((item) => ({
        ...item,
        name: groundedText(source, item.name),
        description: groundedText(source, item.description),
        assembly: groundedText(source, item.assembly),
        removal: groundedText(source, item.removal ?? null),
        models: item.models.filter((model) => knownModels.has(model.replace(/\s+/g, "").toUpperCase()) || sourceContains(source, model)),
      })),
  };
}

export async function analyzeWithAi(sourceText: string): Promise<{ payload: AiManualPayload | null; warning: string | null }> {
  const config = endpointConfig();
  if (!config) {
    return { payload: null, warning: "Kein OpenAI-/Azure-Key in .env – KI übersprungen." };
  }
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  try {
    const res = await fetch(config.url, {
      method: "POST",
      headers: config.headers,
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: clipSource(sourceText) },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { payload: null, warning: `KI-API Fehler HTTP ${res.status}${body ? `: ${body.slice(0, 180)}` : ""}` };
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return { payload: null, warning: "KI lieferte keinen JSON-Inhalt." };
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { payload: null, warning: "KI-Antwort war kein valides JSON." };
    }
    const checked = AiManualSchema.safeParse(parsed);
    if (!checked.success) {
      return { payload: null, warning: "KI-JSON entsprach nicht dem Schema." };
    }
    return { payload: keepGrounded(checked.data, sourceText), warning: null };
  } catch (error) {
    return {
      payload: null,
      warning: `KI-API Fehler: ${error instanceof Error ? error.message : "unbekannt"}`,
    };
  }
}
