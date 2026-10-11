import { createId } from "@/lib/id";
import {
  DEFAULT_EDGE_COLOR,
  MAX_EDGE_WIDTH,
  MIN_EDGE_WIDTH,
} from "@/lib/projekte/schema-edge-utils";
import {
  clampNodeSize,
  DEFAULT_SCHEMA_NODE_HEIGHT,
  DEFAULT_SCHEMA_NODE_WIDTH,
  nodePlainLabel,
  sanitizeLabelHtml,
} from "@/lib/projekte/schema-rich-text";

export const SCHEMA_MODES = ["mindmap", "flowchart"] as const;
export type SchemaMode = (typeof SCHEMA_MODES)[number];

export const SCHEMA_MODE_LABELS: Record<SchemaMode, string> = {
  mindmap: "Mindmap",
  flowchart: "Flussdiagramm",
};

export type SchemaNodeStyle = {
  fontSize: number;
  color: string;
  fontWeight: "normal" | "bold";
  textDecoration: "none" | "underline";
  backgroundColor: string;
  borderColor: string;
};

export const DEFAULT_SCHEMA_NODE_STYLE: SchemaNodeStyle = {
  fontSize: 14,
  color: "#0f172a",
  fontWeight: "normal",
  textDecoration: "none",
  backgroundColor: "#ffffff",
  borderColor: "#94a3b8",
};

export type SchemaNode = {
  id: string;
  label: string;
  /** Formatierter Inhalt (Teilfarben, fett …) */
  labelHtml?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  /** Nutzer hat Größe per Ziehen gesetzt (Auto-Fit vergrößert nur, schrumpft nicht darunter) */
  userSized?: boolean;
  style?: Partial<SchemaNodeStyle>;
};

export type SchemaEdge = {
  id: string;
  fromId: string;
  toId: string;
  color?: string;
  width?: number;
  /** Manuell gezogener Kurvenpunkt (Quadratic Bezier) */
  bendX?: number | null;
  bendY?: number | null;
};

export type SchemaDocument = {
  version: 1;
  mode: SchemaMode;
  nodes: SchemaNode[];
  edges: SchemaEdge[];
  /** Mindmap: neuen Zweig automatisch mit Eltern verbinden */
  autoLinkBranches?: boolean;
  /** Voreinstellung für neu gezeichnete Linien */
  defaultEdgeColor?: string;
  defaultEdgeWidth?: number;
};

export function createEmptySchemaDocument(mode: SchemaMode): SchemaDocument {
  const rootId = createId("snode");
  return {
    version: 1,
    mode,
    nodes: [
      {
        id: rootId,
        label: mode === "mindmap" ? "Thema" : "Start",
        x: mode === "mindmap" ? 420 : 160,
        y: 260,
        width: DEFAULT_SCHEMA_NODE_WIDTH,
        height: DEFAULT_SCHEMA_NODE_HEIGHT,
      },
    ],
    edges: [],
    autoLinkBranches: false,
    defaultEdgeColor: DEFAULT_EDGE_COLOR,
    defaultEdgeWidth: 2,
  };
}

function normalizeNodeStyle(raw: Partial<SchemaNodeStyle> | undefined): SchemaNodeStyle {
  const base = DEFAULT_SCHEMA_NODE_STYLE;
  if (!raw || typeof raw !== "object") return { ...base };
  const fontSize =
    typeof raw.fontSize === "number" && raw.fontSize >= 10 && raw.fontSize <= 48
      ? raw.fontSize
      : base.fontSize;
  const color = typeof raw.color === "string" && raw.color.trim() ? raw.color.trim() : base.color;
  const backgroundColor =
    typeof raw.backgroundColor === "string" && raw.backgroundColor.trim()
      ? raw.backgroundColor.trim()
      : base.backgroundColor;
  const borderColor =
    typeof raw.borderColor === "string" && raw.borderColor.trim()
      ? raw.borderColor.trim()
      : base.borderColor;
  return {
    fontSize,
    color,
    fontWeight: raw.fontWeight === "bold" ? "bold" : "normal",
    textDecoration: raw.textDecoration === "underline" ? "underline" : "none",
    backgroundColor,
    borderColor,
  };
}

export function resolveNodeStyle(node: SchemaNode): SchemaNodeStyle {
  return normalizeNodeStyle(node.style);
}

function normalizeNode(raw: Partial<SchemaNode>): SchemaNode | null {
  if (!raw?.id || typeof raw.id !== "string") return null;
  const labelHtml =
    typeof raw.labelHtml === "string" && raw.labelHtml.trim()
      ? sanitizeLabelHtml(raw.labelHtml)
      : undefined;
  const trimmed = typeof raw.label === "string" ? raw.label.trim() : "";
  const draft: SchemaNode = {
    id: raw.id,
    label: trimmed || "Knoten",
    labelHtml,
    x: typeof raw.x === "number" && Number.isFinite(raw.x) ? raw.x : 0,
    y: typeof raw.y === "number" && Number.isFinite(raw.y) ? raw.y : 0,
    style: normalizeNodeStyle(raw.style as Partial<SchemaNodeStyle> | undefined),
  };
  const label = nodePlainLabel(draft) || "Knoten";
  const size = clampNodeSize(
    typeof raw.width === "number" ? raw.width : DEFAULT_SCHEMA_NODE_WIDTH,
    typeof raw.height === "number" ? raw.height : DEFAULT_SCHEMA_NODE_HEIGHT,
  );
  return {
    ...draft,
    label,
    width: size.width,
    height: size.height,
    userSized: Boolean(raw.userSized),
  };
}

function normalizeEdge(raw: Partial<SchemaEdge>, nodeIds: Set<string>): SchemaEdge | null {
  if (!raw?.id || typeof raw.id !== "string") return null;
  if (typeof raw.fromId !== "string" || typeof raw.toId !== "string") return null;
  if (raw.fromId === raw.toId) return null;
  if (!nodeIds.has(raw.fromId) || !nodeIds.has(raw.toId)) return null;
  const width =
    typeof raw.width === "number" && raw.width >= MIN_EDGE_WIDTH && raw.width <= MAX_EDGE_WIDTH
      ? raw.width
      : 2;
  const color =
    typeof raw.color === "string" && raw.color.trim() ? raw.color.trim() : DEFAULT_EDGE_COLOR;
  const bendX =
    typeof raw.bendX === "number" && Number.isFinite(raw.bendX) ? raw.bendX : null;
  const bendY =
    typeof raw.bendY === "number" && Number.isFinite(raw.bendY) ? raw.bendY : null;
  return { id: raw.id, fromId: raw.fromId, toId: raw.toId, color, width, bendX, bendY };
}

export function normalizeSchemaDocument(raw: unknown): SchemaDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Partial<SchemaDocument>;
  const mode =
    obj.mode === "flowchart" || obj.mode === "mindmap" ? obj.mode : "mindmap";
  const nodes = Array.isArray(obj.nodes)
    ? obj.nodes
        .map((item) => normalizeNode(item as Partial<SchemaNode>))
        .filter((item): item is SchemaNode => Boolean(item))
    : [];
  if (nodes.length === 0) return createEmptySchemaDocument(mode);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = Array.isArray(obj.edges)
    ? obj.edges
        .map((item) => normalizeEdge(item as Partial<SchemaEdge>, nodeIds))
        .filter((item): item is SchemaEdge => Boolean(item))
    : [];
  return {
    version: 1,
    mode,
    nodes,
    edges,
    autoLinkBranches: Boolean(obj.autoLinkBranches),
    defaultEdgeColor:
      typeof obj.defaultEdgeColor === "string" && obj.defaultEdgeColor.trim()
        ? obj.defaultEdgeColor.trim()
        : DEFAULT_EDGE_COLOR,
    defaultEdgeWidth:
      typeof obj.defaultEdgeWidth === "number" &&
      obj.defaultEdgeWidth >= MIN_EDGE_WIDTH &&
      obj.defaultEdgeWidth <= MAX_EDGE_WIDTH
        ? obj.defaultEdgeWidth
        : 2,
  };
}

export function isSchemaMode(value: string): value is SchemaMode {
  return (SCHEMA_MODES as readonly string[]).includes(value);
}
