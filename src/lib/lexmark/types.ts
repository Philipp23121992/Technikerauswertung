import { z } from "zod";

export const REVIEW_STATUSES = ["AUTO_APPROVED", "NEEDS_REVIEW", "REJECTED"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_TYPES = ["error_code", "replacement_part", "model", "relationship", "ocr"] as const;
export type ReviewType = (typeof REVIEW_TYPES)[number];

export const CONFIDENCE_REVIEW_THRESHOLD = 80;

export const SECTION_HEADINGS = [
  "applicable error codes",
  "issue description",
  "customer resolution",
  "remote resolution",
  "initial parts replacement",
  "detailed diagnostics",
  "parts catalog",
  "parts removal",
  "troubleshooting",
  "service check",
  "maintenance",
  "parts list",
] as const;

export type SectionHeading = (typeof SECTION_HEADINGS)[number];

export type Manual = {
  id: string;
  fileName: string;
  title: string;
  pageCount: number;
  ocrNeeded: boolean;
  status: ReviewStatus;
  confidence: number;
  source: string;
  created_at: string;
  updated_at: string;
};

export type PrinterModel = {
  id: string;
  manualId: string;
  model: string;
  series: string;
  machineType: string | null;
  modelNumber: string | null;
  source: string;
  page: number | null;
  created_at: string;
  updated_at: string;
};

export type ErrorCode = {
  id: string;
  manualId: string;
  code: string;
  description: string | null;
  category: string | null;
  cause: string | null;
  customerResolution: string | null;
  remoteResolution: string | null;
  detailedDiagnostics: string | null;
  initialPartsReplacement: string | null;
  source: string;
  page: number | null;
  confidence: number;
  status: ReviewStatus;
  created_at: string;
  updated_at: string;
};

export type ReplacementPart = {
  id: string;
  manualId: string;
  fru: string;
  name: string | null;
  description: string | null;
  assembly: string | null;
  removal: string | null;
  source: string;
  page: number | null;
  confidence: number;
  status: ReviewStatus;
  created_at: string;
  updated_at: string;
};

export type ModelPartRelation = {
  id: string;
  manualId: string;
  model: string;
  fru: string;
  created_at: string;
  updated_at: string;
};

export type ErrorPartRelation = {
  id: string;
  manualId: string;
  model: string;
  errorCode: string;
  fru: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type ProcessingLog = {
  id: string;
  manualId: string | null;
  level: "info" | "warn" | "error";
  message: string;
  created_at: string;
  updated_at: string;
};

export type ReviewQueueItem = {
  id: string;
  manualId: string;
  type: ReviewType;
  value: string;
  confidence: number;
  reason: string;
  status: ReviewStatus;
  created_at: string;
  updated_at: string;
};

export type LexmarkDb = {
  version: 1;
  manuals: Manual[];
  printer_models: PrinterModel[];
  error_codes: ErrorCode[];
  replacement_parts: ReplacementPart[];
  model_part_relations: ModelPartRelation[];
  error_part_relations: ErrorPartRelation[];
  processing_log: ProcessingLog[];
  review_queue: ReviewQueueItem[];
};

export function createEmptyLexmarkDb(): LexmarkDb {
  return {
    version: 1,
    manuals: [],
    printer_models: [],
    error_codes: [],
    replacement_parts: [],
    model_part_relations: [],
    error_part_relations: [],
    processing_log: [],
    review_queue: [],
  };
}

export const AiErrorCodeSchema = z.object({
  code: z.string().min(1),
  description: z.string().nullable(),
  category: z.string().nullable(),
  cause: z.string().nullable(),
  customerResolution: z.string().nullable(),
  remoteResolution: z.string().nullable(),
  detailedDiagnostics: z.string().nullable(),
  initialPartsReplacement: z.string().nullable(),
  page: z.number().int().positive().nullable(),
  frus: z.array(z.string()).default([]),
});

export const AiPartSchema = z.object({
  fru: z.string().min(1),
  name: z.string().nullable(),
  description: z.string().nullable(),
  assembly: z.string().nullable(),
  removal: z.string().nullable().optional(),
  page: z.number().int().positive().nullable(),
  models: z.array(z.string()).default([]),
});

export const AiManualSchema = z.object({
  models: z
    .array(
      z.object({
        model: z.string().min(1),
        series: z.string().nullable(),
        machineType: z.string().nullable(),
        modelNumber: z.string().nullable(),
        page: z.number().int().positive().nullable(),
      }),
    )
    .default([]),
  errorCodes: z.array(AiErrorCodeSchema).default([]),
  parts: z.array(AiPartSchema).default([]),
});

export type AiManualPayload = z.infer<typeof AiManualSchema>;

export type ExtractedPage = {
  page: number;
  text: string;
  charCount: number;
  needsOcr: boolean;
  tables: string[][][];
};

export type ExtractedSection = {
  heading: string;
  page: number;
  text: string;
};

export type ExtractedErrorDraft = {
  code: string;
  description: string | null;
  category: string | null;
  cause: string | null;
  customerResolution: string | null;
  remoteResolution: string | null;
  detailedDiagnostics: string | null;
  initialPartsReplacement: string | null;
  page: number | null;
  frus: string[];
  confidence: number;
};

export type ExtractedPartDraft = {
  fru: string;
  name: string | null;
  description: string | null;
  assembly: string | null;
  removal: string | null;
  page: number | null;
  models: string[];
  confidence: number;
};

export type ExtractedModelDraft = {
  model: string;
  series: string;
  machineType: string | null;
  modelNumber: string | null;
  page: number | null;
  confidence: number;
};

export type PdfExtractResult = {
  fileName: string;
  title: string;
  pageCount: number;
  pages: ExtractedPage[];
  sections: ExtractedSection[];
  models: ExtractedModelDraft[];
  errorCodes: ExtractedErrorDraft[];
  parts: ExtractedPartDraft[];
  ocrNeeded: boolean;
  confidence: number;
  warnings: string[];
};

export type LexmarkAnalyzePayload = {
  fileName: string;
  useAi?: boolean;
  title: string;
  pageCount: number;
  ocrNeeded: boolean;
  confidence: number;
  warnings: string[];
  models: ExtractedModelDraft[];
  errorCodes: ExtractedErrorDraft[];
  parts: ExtractedPartDraft[];
  sections?: ExtractedSection[];
  sourceExcerpt?: string;
};

export type AnalyzeFileResult = {
  fileName: string;
  ok: boolean;
  error: string | null;
  log: string[];
  stats: {
    models: number;
    errorCodes: number;
    parts: number;
    relations: number;
    review: number;
  } | null;
  manualId: string | null;
};
