type EdgeBend = { bendX?: number | null; bendY?: number | null };
type NodePoint = { id: string; x: number; y: number; width?: number; height?: number };
type NodePos = { x: number; y: number };

export const DEFAULT_EDGE_COLOR = "#64748b";
export const MIN_EDGE_WIDTH = 1;
export const MAX_EDGE_WIDTH = 10;

export type ResolvedEdgeStyle = {
  color: string;
  width: number;
};

export function resolveEdgeStyle(edge: Partial<{ color?: string; width?: number }>): ResolvedEdgeStyle {
  const width =
    typeof edge.width === "number" && edge.width >= MIN_EDGE_WIDTH && edge.width <= MAX_EDGE_WIDTH
      ? edge.width
      : 2;
  const color =
    typeof edge.color === "string" && edge.color.trim() ? edge.color.trim() : DEFAULT_EDGE_COLOR;
  return { color, width };
}

export function edgePath(from: NodePos, to: NodePos, edge?: EdgeBend): string {
  const x1 = from.x;
  const y1 = from.y;
  const x2 = to.x;
  const y2 = to.y;
  if (
    edge &&
    typeof edge.bendX === "number" &&
    Number.isFinite(edge.bendX) &&
    typeof edge.bendY === "number" &&
    Number.isFinite(edge.bendY)
  ) {
    return `M ${x1} ${y1} Q ${edge.bendX} ${edge.bendY} ${x2} ${y2}`;
  }
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

export function defaultBendPoint(from: NodePos, to: NodePos): { bendX: number; bendY: number } {
  return { bendX: (from.x + to.x) / 2, bendY: (from.y + to.y) / 2 };
}

export function findNodeAtPoint(
  nodes: NodePoint[],
  x: number,
  y: number,
  skipId?: string,
): NodePoint | undefined {
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const node = nodes[i];
    if (skipId && node.id === skipId) continue;
    const w = node.width ?? 180;
    const h = node.height ?? 96;
    if (x >= node.x - w / 2 && x <= node.x + w / 2 && y >= node.y - h / 2 && y <= node.y + h / 2) {
      return node;
    }
  }
  return undefined;
}
