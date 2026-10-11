export type LabeledNodeLike = {
  label: string;
  labelHtml?: string;
  width?: number;
  height?: number;
};

export const DEFAULT_SCHEMA_NODE_WIDTH = 180;
export const DEFAULT_SCHEMA_NODE_HEIGHT = 96;
export const MIN_SCHEMA_NODE_WIDTH = 80;
export const MIN_SCHEMA_NODE_HEIGHT = 56;
export const MAX_SCHEMA_NODE_WIDTH = 560;
export const MAX_SCHEMA_NODE_HEIGHT = 960;

/** Platz für Griff, Padding und Resize-Ecke */
export const SCHEMA_NODE_CHROME_HEIGHT = 38;
export const SCHEMA_NODE_CHROME_WIDTH = 20;

export function clampNodeSize(width: number, height: number): { width: number; height: number } {
  return {
    width: Math.min(MAX_SCHEMA_NODE_WIDTH, Math.max(MIN_SCHEMA_NODE_WIDTH, width)),
    height: Math.min(MAX_SCHEMA_NODE_HEIGHT, Math.max(MIN_SCHEMA_NODE_HEIGHT, height)),
  };
}

export function resolveNodeDimensions(node: Pick<LabeledNodeLike, "width" | "height">): {
  width: number;
  height: number;
} {
  return clampNodeSize(
    typeof node.width === "number" ? node.width : DEFAULT_SCHEMA_NODE_WIDTH,
    typeof node.height === "number" ? node.height : DEFAULT_SCHEMA_NODE_HEIGHT,
  );
}

/** Kasten so groß wie Inhalt (ohne Scroll). Bei userSized: nie kleiner als manuell gesetzt. */
export function sizeForNodeContent(
  contentEl: HTMLElement,
  current: { width: number; height: number },
  userSized: boolean,
): { width: number; height: number } {
  const innerW = Math.max(
    MIN_SCHEMA_NODE_WIDTH - SCHEMA_NODE_CHROME_WIDTH,
    current.width - SCHEMA_NODE_CHROME_WIDTH,
  );
  contentEl.style.width = `${innerW}px`;
  contentEl.style.height = "auto";
  contentEl.style.overflow = "hidden";

  let width = Math.max(contentEl.scrollWidth + SCHEMA_NODE_CHROME_WIDTH, MIN_SCHEMA_NODE_WIDTH);
  contentEl.style.width = `${width - SCHEMA_NODE_CHROME_WIDTH}px`;
  let height = Math.max(contentEl.scrollHeight + SCHEMA_NODE_CHROME_HEIGHT, MIN_SCHEMA_NODE_HEIGHT);

  if (userSized) {
    width = Math.max(width, current.width);
    height = Math.max(height, current.height);
  }

  return clampNodeSize(Math.ceil(width), Math.ceil(height));
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function plainTextFromHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<div[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Erlaubt nur einfache Formatierung (Farbe, fett, unterstrichen). */
export function sanitizeLabelHtml(raw: string): string {
  if (!raw.trim()) return "";
  let html = raw.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  html = html.replace(/\son\w+="[^"]*"/gi, "");
  html = html.replace(/\son\w+='[^']*'/gi, "");
  html = html.replace(/<(?!(\/)?(span|br|b|strong|u|i)\b)[^>]+>/gi, "");
  html = html.replace(/<span([^>]*)>/gi, (_, attrs: string) => {
    const colorMatch = /color\s*:\s*([^;"']+)/i.exec(attrs);
    const styleMatch = /style="([^"]*)"/i.exec(attrs);
    const styleRaw = styleMatch?.[1] ?? attrs;
    const colorFromStyle = /color\s*:\s*([^;"']+)/i.exec(styleRaw)?.[1]?.trim();
    const color = (colorMatch?.[1] ?? colorFromStyle ?? "").trim();
    if (!color || !/^[#a-zA-Z0-9(),.%\s-]+$/.test(color)) return "<span>";
    return `<span style="color:${color.replace(/"/g, "")}">`;
  });
  return html.slice(0, 16_000);
}

export function nodeLabelHtml(node: LabeledNodeLike): string {
  if (node.labelHtml?.trim()) return node.labelHtml;
  return escapeHtml(node.label).replace(/\n/g, "<br>");
}

export function nodePlainLabel(node: LabeledNodeLike): string {
  if (node.labelHtml?.trim()) {
    const plain = plainTextFromHtml(node.labelHtml);
    if (plain) return plain;
  }
  return node.label;
}

export function applyInlineColor(root: HTMLElement, color: string): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return false;

  const span = document.createElement("span");
  span.style.color = color;
  try {
    range.surroundContents(span);
  } catch {
    const extracted = range.extractContents();
    span.appendChild(extracted);
    range.insertNode(span);
  }
  sel.collapse(span, span.childNodes.length);
  return true;
}

export function applyInlineCommand(root: HTMLElement, command: "bold" | "underline"): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
  if (!root.contains(sel.anchorNode)) return false;
  document.execCommand(command, false);
  return true;
}
