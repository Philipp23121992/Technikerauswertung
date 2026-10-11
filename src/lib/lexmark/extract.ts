import { SECTION_HEADINGS, type ExtractedErrorDraft, type ExtractedModelDraft, type ExtractedPage, type ExtractedPartDraft, type ExtractedSection, type PdfExtractResult } from "./types";

export const FRU_X_RE = /\b(\d{2}X\d{4})\b/gi;
export const FRU_ALT_RE = /\b(\d{2}[A-Z]\d[A-Z]\d{2})\b/g;
export const ERROR_CODE_RE = /\b(\d{1,3}\.\d{2})\b/g;
export const DATE_RE = /\b\d{1,2}\.\d{1,2}\.\d{2,4}\b/g;
export const MODEL_RE =
  /\b((?:XC|XM|MX|MS|CS|CX|CM|CP)\s?-?\d{3,5}[A-Za-z0-9]*|C\d{4,5}[A-Za-z]?)\b/gi;
export const MACHINE_TYPE_RE = /(?:machine\s*type|maschinentyp|mt)\s*[:#]?\s*([0-9]{4}(?:-\d{2,4})?)/gi;

const SECTION_LOOKUP = SECTION_HEADINGS.map((heading) => ({
  heading,
  key: heading.replace(/\s+/g, " "),
}));

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const next = value.replace(/\s+/g, "").toUpperCase();
    if (!next || seen.has(next)) continue;
    seen.add(next);
    out.push(next);
  }
  return out;
}

export function normalizeModel(value: string): string {
  return value.replace(/\s+/g, "").replace(/-/g, "").toUpperCase();
}

export function modelSeries(model: string): string {
  const match = normalizeModel(model).match(/^[A-Z]+/);
  return match?.[0] ?? "";
}

export function extractFrus(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(FRU_X_RE)) found.push(match[1]);
  for (const match of text.matchAll(FRU_ALT_RE)) found.push(match[1]);
  return unique(found);
}

export function normalizeErrorCode(code: string): string {
  return code.trim().replace(",", ".").replace(/\s+/g, "").toUpperCase();
}

export function extractErrorCodes(text: string): string[] {
  const withoutDates = text.replace(DATE_RE, " ");
  const found: string[] = [];
  for (const match of withoutDates.matchAll(/\b(\d{1,3}[.,]\d{2}[A-Za-z]?)\b/g)) {
    found.push(normalizeErrorCode(match[1]));
  }
  return unique(found);
}

export function extractModels(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(MODEL_RE)) found.push(match[1]);
  return unique(found).map(normalizeModel);
}

export function extractMachineTypes(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(MACHINE_TYPE_RE)) found.push(match[1]);
  return unique(found);
}

function lineHeading(line: string): string | null {
  const key = line.replace(/\s+/g, " ").trim().toLowerCase().replace(/[:.]+$/, "");
  if (!key || key.length > 80) return null;
  const hit = SECTION_LOOKUP.find((item) => key === item.key || key.includes(item.key));
  return hit?.heading ?? null;
}

export function detectSections(pages: ExtractedPage[]): ExtractedSection[] {
  const sections: ExtractedSection[] = [];
  let current: ExtractedSection | null = null;
  for (const page of pages) {
    const lines = page.text.split(/\r?\n/);
    for (const raw of lines) {
      const heading = lineHeading(raw);
      if (heading) {
        if (current) sections.push(current);
        current = { heading, page: page.page, text: "" };
        continue;
      }
      if (current) {
        current.text += (current.text ? "\n" : "") + raw.trim();
      }
    }
  }
  if (current) sections.push(current);
  return sections;
}

export function sectionText(sections: ExtractedSection[], heading: string): string {
  return sections
    .filter((item) => item.heading === heading)
    .map((item) => item.text)
    .join("\n")
    .trim();
}

function pageOf(pages: ExtractedPage[], needle: string): number | null {
  const key = needle.toUpperCase();
  for (const page of pages) {
    if (page.text.toUpperCase().includes(key)) return page.page;
  }
  return null;
}

function clip(value: string | null | undefined, max = 1200): string | null {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max).trim()}…` : text;
}

function blockField(block: string, heading: string): string | null {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `${escaped}\\s*[:\\-]?\\s*([\\s\\S]*?)(?=\\n(?:applicable error codes|issue description|customer resolution|remote resolution|initial parts replacement|detailed diagnostics|parts catalog|parts removal|troubleshooting|service check|maintenance|parts list)\\b|\\n\\d{1,3}\\.\\d{2}\\b|$)`,
    "i",
  );
  const match = block.match(re);
  return clip(match?.[1] ?? null, 1500);
}

function expandErrorTitle(full: string, index: number, title: string): string {
  let text = title.replace(/\s+/g, " ").trim();
  const slice = full.slice(index, Math.min(full.length, index + 800));
  const lines = slice
    .split(/\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  for (const line of lines.slice(1, 8)) {
    if (/^\d{1,3}\.\d{2}\b/.test(line)) break;
    if (
      /^(issue description|customer resolution|remote resolution|applicable error|initial parts|detailed diagnostics|---page\b)/i.test(
        line,
      )
    ) {
      break;
    }
    if (line.length > 180) break;
    text = `${text} ${line}`.trim();
    if (text.length > 420 || /[.!?]$/.test(text)) break;
  }
  return text;
}

function errorDraftScore(draft: ExtractedErrorDraft): number {
  let score = (draft.description ?? "").length;
  if (draft.customerResolution) score += 80;
  if (draft.cause) score += 40;
  if (draft.remoteResolution) score += 20;
  if (draft.frus.length) score += 30;
  return score;
}

export function parseErrorBlocks(pages: ExtractedPage[]): ExtractedErrorDraft[] {
  const full = pages.map((page) => `---PAGE ${page.page}---\n${page.text}`).join("\n");
  const re = /(?:^|\n)\s*(\d{1,3}\.\d{2})\s+([^\n]{0,160})/g;
  const hits: { code: string; title: string; index: number }[] = [];
  for (const match of full.matchAll(re)) {
    if (/\d{1,2}\.\d{1,2}\.\d{2,4}/.test(match[0])) continue;
    hits.push({
      code: match[1],
      title: match[2].trim(),
      index: match.index ?? 0,
    });
  }
  const drafts: ExtractedErrorDraft[] = [];
  const byCode = new Map<string, number>();
  for (let i = 0; i < hits.length; i += 1) {
    const hit = hits[i];
    const description = clip(expandErrorTitle(full, hit.index, hit.title), 420);
    if (description && /^\s*(added|updated|removed|revised|moved|changed|deleted|see )\b/i.test(description)) {
      continue;
    }
    const end = i + 1 < hits.length ? hits[i + 1].index : Math.min(full.length, hit.index + 3500);
    const block = full.slice(hit.index, end);
    const pageMatch = full.slice(Math.max(0, hit.index - 200), hit.index).match(/---PAGE (\d+)---/);
    const frus = extractFrus(block);
    const draft: ExtractedErrorDraft = {
      code: hit.code,
      description,
      category: clip(blockField(block, "issue description") || description, 420),
      cause: blockField(block, "issue description"),
      customerResolution: blockField(block, "customer resolution"),
      remoteResolution: blockField(block, "remote resolution"),
      detailedDiagnostics: blockField(block, "detailed diagnostics"),
      initialPartsReplacement:
        blockField(block, "initial parts replacement") || (frus.length ? frus.join(", ") : null),
      page: pageMatch ? Number(pageMatch[1]) : pageOf(pages, hit.code),
      frus,
      confidence: description || frus.length || Boolean(blockField(block, "customer resolution")) ? 88 : 68,
    };
    const existing = byCode.get(hit.code);
    if (existing == null) {
      byCode.set(hit.code, drafts.length);
      drafts.push(draft);
      continue;
    }
    if (errorDraftScore(draft) > errorDraftScore(drafts[existing])) {
      drafts[existing] = draft;
    }
  }
  return drafts;
}

export function isJunkPartLabel(text: string | null | undefined): boolean {
  if (!text) return true;
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 3) return true;
  if (/^\s*(added|updated|removed|revised|moved|changed|deleted|see |refer to)\b/i.test(t)) return true;
  if (/\b(on page|see page|chapter|revision history|change history|editions and comments)\b/i.test(t)) return true;
  if (/^[\d\s.,;:/|()-]+$/.test(t)) return true;
  if (/^parts?\s*(catalog|list|removal|number)?$/i.test(t)) return true;
  return false;
}

export function scorePartLabel(text: string | null | undefined): number {
  if (isJunkPartLabel(text)) return 0;
  const t = text!.replace(/\s+/g, " ").trim();
  let score = Math.min(40, t.length);
  if (
    /\b(assembly|cover|roller|fuser|motor|board|sensor|cable|kit|unit|tray|hinge|door|gear|belt|pad|pick|separator|transfer|developer|cartridge|bottle|fan|panel|speaker|card|guide|spring|screw)\b/i.test(
      t,
    )
  ) {
    score += 25;
  }
  const words = t.split(" ");
  if (words.length >= 2 && words.length <= 8) score += 10;
  if (t.length > 100) score -= 20;
  if (extractVoltage(t)) score += 15;
  return score;
}

const FRU_TOKEN = String.raw`(?:\d{2}X\d{4}|\d{2}[A-Z]\d[A-Z]\d{2})`;

function cleanPartName(name: string): string {
  return name
    .replace(/\s+/g, " ")
    .replace(/^(?:PN|P\/N)\s*[-:]?\s*/i, "")
    .replace(/^(\d{1,3}\s+){1,4}/, "")
    .replace(/^[-–—:,.;]+/, "")
    .replace(/[-–—:,.;]+$/, "")
    .replace(/\s+\d{1,3}$/, "")
    .trim();
}

export function tidyPartLabel(text: string | null | undefined): string | null {
  if (!text) return null;
  const cleaned = cleanPartName(text);
  return isJunkPartLabel(cleaned) ? null : cleaned;
}

const VOLTAGE_RE = /\b(\d{2,3}(?:\s*[–—-]\s*\d{2,3})?\s*V(?:AC|DC)?)\b/i;

export function extractVoltage(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(VOLTAGE_RE);
  if (!match) return null;
  const compact = match[1].replace(/[–—]/g, "-").replace(/\s+/g, "");
  const parsed = compact.match(/^(\d{2,3}(?:-\d{2,3})?)(V(?:AC|DC)?)$/i);
  if (!parsed) return compact.toUpperCase();
  return `${parsed[1]}${parsed[2].toUpperCase()}`;
}

export function withVoltageLabel(
  label: string | null | undefined,
  ...sources: Array<string | null | undefined>
): string | null {
  const base = (label ?? "").replace(/\s+/g, " ").trim();
  if (!base) return null;
  const voltage =
    extractVoltage(base) ?? sources.map(extractVoltage).find((item): item is string => Boolean(item)) ?? null;
  if (!voltage) return base;
  if (VOLTAGE_RE.test(base)) {
    return base.replace(VOLTAGE_RE, voltage).replace(/\s+/g, " ").trim();
  }
  return `${base.replace(/[.,;:\s]+$/, "")}, ${voltage}`;
}

type PartLabelSource = {
  fru?: string | null;
  name?: string | null;
  description?: string | null;
  assembly?: string | null;
  removal?: string | null;
};

function voltageNearFru(text: string | null | undefined, fru?: string | null): string | null {
  if (!text) return null;
  if (fru) {
    const idx = text.toUpperCase().indexOf(fru.toUpperCase());
    if (idx >= 0) {
      const hit = extractVoltage(text.slice(idx, idx + 180));
      if (hit) return hit;
    }
  }
  return text.length <= 400 ? extractVoltage(text) : null;
}

export function partBezeichnung(part: PartLabelSource): string | null {
  const name = tidyPartLabel(part.name);
  const description = tidyPartLabel(part.description);
  const base = name || description;
  return withVoltageLabel(
    base,
    name,
    description,
    part.assembly,
    voltageNearFru(part.removal, part.fru),
    part.removal && part.removal.length <= 400 ? part.removal : null,
  );
}

function parseCatalogLine(line: string): { fru: string; name: string } | null {
  const trimmed = line.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;

  let match = trimmed.match(new RegExp(`^(\\d{1,3})\\s+(${FRU_TOKEN})\\s+(.+)$`, "i"));
  if (match) {
    const name = cleanPartName(match[3]);
    if (!isJunkPartLabel(name)) return { fru: match[2].toUpperCase(), name };
  }

  match = trimmed.match(new RegExp(`^(${FRU_TOKEN})\\s+([A-Za-zÄÖÜ].+)$`, "i"));
  if (match) {
    const name = cleanPartName(match[2]);
    if (!isJunkPartLabel(name)) return { fru: match[1].toUpperCase(), name };
  }

  match = trimmed.match(new RegExp(`^([A-Za-zÄÖÜ].{2,90}?)\\s+(${FRU_TOKEN})$`, "i"));
  if (match) {
    const name = cleanPartName(match[1]);
    if (!isJunkPartLabel(name)) return { fru: match[2].toUpperCase(), name };
  }

  return null;
}

function pageKind(text: string): "revision" | "catalog" | "removal" | "other" {
  const head = text.slice(0, 900).toLowerCase();
  if (/\b(revision history|change history|editions and comments|document change|added the tpm)\b/.test(head)) {
    return "revision";
  }
  if (/\b(parts catalog|parts list|part number|p\/n)\b/.test(head)) return "catalog";
  if (/\b(removal procedure|parts removal|removing the)\b/.test(head)) return "removal";
  return "other";
}

function nameKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(the|a|an|removal|removing|procedure|procedures)\b/g, " ")
    .replace(/[^a-z0-9äöüß]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

export type RemovalBlock = { title: string; frus: string[]; text: string; page: number };

export function parseRemovalBlocks(pages: ExtractedPage[]): RemovalBlock[] {
  const headingRe =
    /^(?:(?:\d{1,3})\s+)?(?:(?:removing|remove|removal of)(?:\s+the)?\s+(.{3,70}?)|(.{3,70}?)\s+removal(?:\s+procedure)?)\s*\.?$/i;
  const blocks: RemovalBlock[] = [];

  for (const page of pages) {
    const lines = page.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    let current: { title: string; lines: string[]; page: number; preludeFrus: string[] } | null = null;
    const prelude: string[] = [];

    const flush = () => {
      if (!current) return;
      const text = current.lines.join("\n").trim();
      if (text.length < 40) {
        current = null;
        return;
      }
      const frus = unique([...current.preludeFrus, ...extractFrus(text), ...extractFrus(current.title)]);
      blocks.push({
        title: current.title,
        frus,
        text: clip(text, 2500) ?? text,
        page: current.page,
      });
      current = null;
    };

    for (const line of lines) {
      const heading = line.match(headingRe);
      if (heading) {
        flush();
        const title = (heading[1] || heading[2] || "").replace(/\s+/g, " ").trim();
        if (!title || /^(parts|procedure|procedures|chapter|section)$/i.test(title)) continue;
        current = {
          title,
          lines: [],
          page: page.page,
          preludeFrus: extractFrus(prelude.slice(-8).join(" ")),
        };
        prelude.length = 0;
        continue;
      }
      if (current) {
        if (/^(warning|caution|installation notes|replacement notes|go to topic)\b/i.test(line) && current.lines.length > 2) {
          flush();
          prelude.push(line);
          continue;
        }
        current.lines.push(line);
        if (current.lines.join("\n").length > 2500) flush();
      } else {
        prelude.push(line);
        if (prelude.length > 16) prelude.shift();
      }
    }
    flush();
  }
  return blocks;
}

export function attachRemovals(parts: ExtractedPartDraft[], blocks: RemovalBlock[]): ExtractedPartDraft[] {
  const byFru = new Map(parts.map((part) => [part.fru.toUpperCase(), part]));
  for (const block of blocks) {
    const targets = new Set<ExtractedPartDraft>();
    for (const fru of block.frus) {
      const part = byFru.get(fru.toUpperCase());
      if (part) targets.add(part);
    }
    if (!targets.size) {
      const key = nameKey(block.title);
      if (key.length >= 4) {
        for (const part of parts) {
          const partKey = nameKey(part.name || part.description || "");
          if (partKey.length >= 4 && (partKey === key || partKey.includes(key) || key.includes(partKey))) {
            targets.add(part);
          }
        }
      }
    }
    for (const part of targets) {
      if (!part.removal || block.text.length > part.removal.length) part.removal = block.text;
    }
  }
  return parts;
}

export function parsePartsFromTables(pages: ExtractedPage[], models: string[]): ExtractedPartDraft[] {
  const drafts: ExtractedPartDraft[] = [];
  for (const page of pages) {
    for (const table of page.tables) {
      for (const row of table) {
        const cells = row.map((cell) => String(cell ?? "").trim()).filter(Boolean);
        if (cells.length < 2) continue;
        const blob = cells.join(" ");
        const frus = extractFrus(blob);
        if (!frus.length) continue;
        const fru = frus[0];
        const rawName = cells.find((cell) => !extractFrus(cell).length && !isJunkPartLabel(cell) && cell.length > 2) ?? null;
        const name = withVoltageLabel(rawName, blob);
        if (isJunkPartLabel(name)) continue;
        drafts.push({
          fru,
          name: clip(name, 180),
          description: clip(name, 400),
          assembly: clip(cells.find((cell) => /assembly|baugruppe|kit|board|unit/i.test(cell)) ?? null, 120),
          removal: null,
          page: page.page,
          models,
          confidence: 90,
        });
      }
    }
  }
  return drafts;
}

export function parsePartsFromText(pages: ExtractedPage[], models: string[]): ExtractedPartDraft[] {
  const drafts: ExtractedPartDraft[] = [];
  for (const page of pages) {
    if (pageKind(page.text) === "revision") continue;
    const kind = pageKind(page.text);
    let assembly: string | null = null;
    const lines = page.text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const catalog = parseCatalogLine(line);
      if (catalog) {
        const nearby = [line, lines[i + 1], lines[i + 2]].filter(Boolean).join(" ");
        const name = withVoltageLabel(catalog.name, nearby) || catalog.name;
        drafts.push({
          fru: catalog.fru,
          name: clip(name, 180),
          description: clip(name, 400),
          assembly,
          removal: null,
          page: page.page,
          models,
          confidence: kind === "catalog" ? 93 : 86,
        });
        continue;
      }
      const maybeAsm = line.replace(/\s+/g, " ").trim();
      if (
        maybeAsm.length >= 4 &&
        maybeAsm.length <= 55 &&
        /assembly|covers?|paper feed|electronics|fuser|developer|scanner/i.test(maybeAsm) &&
        !extractFrus(maybeAsm).length
      ) {
        assembly = clip(maybeAsm, 120);
      }
    }
  }
  return drafts;
}

export function mergeParts(parts: ExtractedPartDraft[]): ExtractedPartDraft[] {
  const byFru = new Map<string, ExtractedPartDraft>();
  for (const part of parts) {
    const prev = byFru.get(part.fru);
    if (!prev) {
      byFru.set(part.fru, { ...part, models: unique(part.models) });
      continue;
    }
    const useNewName = scorePartLabel(part.name) > scorePartLabel(prev.name);
    const useNewDesc = scorePartLabel(part.description) > scorePartLabel(prev.description);
    byFru.set(part.fru, {
      ...prev,
      name: useNewName ? part.name : prev.name,
      description: useNewDesc ? part.description : prev.description,
      assembly: prev.assembly || part.assembly,
      removal: (part.removal?.length ?? 0) > (prev.removal?.length ?? 0) ? part.removal : prev.removal,
      page: prev.page ?? part.page,
      models: unique([...prev.models, ...part.models]),
      confidence: Math.max(prev.confidence, part.confidence, scorePartLabel(useNewName ? part.name : prev.name) >= 30 ? 90 : 0),
    });
  }
  return [...byFru.values()];
}

export function parseModels(pages: ExtractedPage[]): ExtractedModelDraft[] {
  const text = pages.map((page) => page.text).join("\n");
  const models = extractModels(text);
  const machineTypes = extractMachineTypes(text);
  return models.map((model, index) => ({
    model,
    series: modelSeries(model),
    machineType: machineTypes[index] ?? machineTypes[0] ?? null,
    modelNumber: model,
    page: pageOf(pages, model),
    confidence: 86,
  }));
}

function applyVoltagesToParts(parts: ExtractedPartDraft[]): ExtractedPartDraft[] {
  return parts.map((part) => {
    const name = partBezeichnung(part);
    if (!name) return part;
    const description = partBezeichnung({ ...part, name: part.description, description: part.description }) || name;
    if (name === part.name && description === part.description) return part;
    return { ...part, name, description };
  });
}

export const OCR_CHAR_THRESHOLD = 40;

export function buildManualFromPages(pages: ExtractedPage[], fileName: string): PdfExtractResult {
  const warnings: string[] = [];
  const ocrNeeded = pages.length > 0 && pages.filter((page) => page.needsOcr).length > pages.length * 0.4;
  if (ocrNeeded) {
    warnings.push("Viele Seiten ohne Text – OCR wäre nötig (gescannte Seiten).");
  }

  const sections = detectSections(pages);
  const models = parseModels(pages);
  const modelNames = models.map((item) => item.model);
  const errorCodes = parseErrorBlocks(pages);
  const parts = applyVoltagesToParts(
    attachRemovals(
      mergeParts([...parsePartsFromTables(pages, modelNames), ...parsePartsFromText(pages, modelNames)]),
      parseRemovalBlocks(pages),
    ),
  );
  const title = fileName.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim() || fileName;

  return {
    fileName,
    title,
    pageCount: pages.length,
    pages,
    sections,
    models,
    errorCodes,
    parts,
    ocrNeeded,
    confidence: overallConfidence({
      ocrNeeded,
      models: models.length,
      errorCodes: errorCodes.length,
      parts: parts.length,
      sections: sections.length,
    }),
    warnings,
  };
}

export function overallConfidence(input: {
  ocrNeeded: boolean;
  models: number;
  errorCodes: number;
  parts: number;
  sections: number;
}): number {
  if (input.ocrNeeded && input.errorCodes === 0 && input.parts === 0) return 42;
  let score = 60;
  if (input.models) score += 10;
  if (input.errorCodes) score += 12;
  if (input.parts) score += 10;
  if (input.sections) score += 8;
  if (input.ocrNeeded) score -= 18;
  return Math.max(20, Math.min(97, score));
}

export function sourceContains(source: string, value: string): boolean {
  if (!value.trim()) return false;
  return (
    source.toUpperCase().includes(value.replace(/\s+/g, "").toUpperCase()) ||
    source.toUpperCase().includes(value.trim().toUpperCase())
  );
}

export function groundedText(source: string, value: string | null): string | null {
  if (!value) return null;
  return sourceContains(source, value) || value.length > 24 ? clip(value, 1500) : null;
}
