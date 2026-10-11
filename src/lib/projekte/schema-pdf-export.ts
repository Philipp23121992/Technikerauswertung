"use client";

import {
  defaultBendPoint,
  edgePath,
  resolveEdgeStyle,
} from "@/lib/projekte/schema-edge-utils";
import { nodeLabelHtml, resolveNodeDimensions } from "@/lib/projekte/schema-rich-text";
import { resolveNodeStyle, type SchemaDocument } from "@/lib/projekte/schema-types";

const EXPORT_PAD = 56;
const GRID_BG =
  "repeating-linear-gradient(0deg, rgb(148 163 184 / 0.08), rgb(148 163 184 / 0.08) 1px, transparent 1px, transparent 24px)," +
  "repeating-linear-gradient(90deg, rgb(148 163 184 / 0.08), rgb(148 163 184 / 0.08) 1px, transparent 1px, transparent 24px)," +
  "#f8fafc";

export type SchemaExportBounds = {
  minX: number;
  minY: number;
  width: number;
  height: number;
  shiftX: number;
  shiftY: number;
};

export function computeSchemaExportBounds(doc: SchemaDocument): SchemaExportBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const bump = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  for (const node of doc.nodes) {
    const { width, height } = resolveNodeDimensions(node);
    bump(node.x - width / 2, node.y - height / 2);
    bump(node.x + width / 2, node.y + height / 2);
  }

  for (const edge of doc.edges) {
    const from = doc.nodes.find((n) => n.id === edge.fromId);
    const to = doc.nodes.find((n) => n.id === edge.toId);
    if (!from || !to) continue;
    bump(from.x, from.y);
    bump(to.x, to.y);
    if (edge.bendX != null && edge.bendY != null) {
      bump(edge.bendX, edge.bendY);
    } else {
      const bend = defaultBendPoint(from, to);
      bump(bend.bendX, bend.bendY);
    }
  }

  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, width: 1200, height: 720, shiftX: EXPORT_PAD, shiftY: EXPORT_PAD };
  }

  const width = Math.max(320, Math.ceil(maxX - minX + EXPORT_PAD * 2));
  const height = Math.max(240, Math.ceil(maxY - minY + EXPORT_PAD * 2));
  return {
    minX,
    minY,
    width,
    height,
    shiftX: EXPORT_PAD - minX,
    shiftY: EXPORT_PAD - minY,
  };
}

/** html2canvas rendert SVG-Marker oft nicht – Pfeilspitzen als gefüllte Dreiecke. */
function addArrowHeadsToSvg(svg: SVGSVGElement): void {
  const paths = [...svg.querySelectorAll("path")].filter(
    (p) => !p.classList.contains("schema-edge-preview"),
  );
  for (const path of paths) {
    if (!(path instanceof SVGPathElement)) continue;
    const stroke = path.getAttribute("stroke") || path.style.stroke || "#64748b";
    const len = path.getTotalLength();
    if (!Number.isFinite(len) || len < 6) continue;
    const tip = path.getPointAtLength(len);
    const base = path.getPointAtLength(Math.max(0, len - 12));
    const angle = Math.atan2(tip.y - base.y, tip.x - base.x);
    const size = 9;
    const lx = tip.x - Math.cos(angle - 0.42) * size;
    const ly = tip.y - Math.sin(angle - 0.42) * size;
    const rx = tip.x - Math.cos(angle + 0.42) * size;
    const ry = tip.y - Math.sin(angle + 0.42) * size;
    const head = document.createElementNS("http://www.w3.org/2000/svg", "path");
    head.setAttribute("d", `M ${tip.x} ${tip.y} L ${lx} ${ly} L ${rx} ${ry} Z`);
    head.setAttribute("fill", stroke);
    head.setAttribute("stroke", "none");
    svg.appendChild(head);
    path.removeAttribute("marker-end");
  }
}

function stripCanvasUi(root: HTMLElement): void {
  root.querySelectorAll("button, .schema-edge-bend, .schema-edge-preview").forEach((el) => {
    el.remove();
  });
  root.querySelectorAll(".schema-node").forEach((node) => {
    node.classList.remove("is-selected", "is-editing", "is-connect");
  });
}

function createExportWrapFromCanvas(
  canvas: HTMLElement,
  bounds: SchemaExportBounds,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "schema-export-capture";
  wrap.style.width = `${bounds.width}px`;
  wrap.style.height = `${bounds.height}px`;
  wrap.style.position = "relative";
  wrap.style.overflow = "hidden";
  wrap.style.background = GRID_BG;
  wrap.style.boxSizing = "border-box";

  const clone = canvas.cloneNode(true) as HTMLElement;
  clone.style.position = "absolute";
  clone.style.left = "0";
  clone.style.top = "0";
  clone.style.margin = "0";
  clone.style.border = "none";
  clone.style.borderRadius = "0";
  clone.style.transform = `translate(${bounds.shiftX}px, ${bounds.shiftY}px)`;
  clone.style.transformOrigin = "0 0";
  clone.style.overflow = "visible";
  stripCanvasUi(clone);

  const svg = clone.querySelector("svg.schema-edges");
  if (svg instanceof SVGSVGElement) {
    addArrowHeadsToSvg(svg);
  }

  wrap.appendChild(clone);
  return wrap;
}

function buildExportElement(doc: SchemaDocument, bounds: SchemaExportBounds): HTMLElement {
  const root = document.createElement("div");
  root.className = "schema-canvas schema-export-capture";
  root.style.width = `${bounds.width}px`;
  root.style.height = `${bounds.height}px`;
  root.style.position = "relative";
  root.style.background = GRID_BG;
  root.style.boxSizing = "border-box";

  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("class", "schema-edges");
  svg.setAttribute("width", String(bounds.width));
  svg.setAttribute("height", String(bounds.height));
  svg.style.position = "absolute";
  svg.style.inset = "0";
  svg.style.display = "block";
  svg.style.pointerEvents = "none";
  svg.style.zIndex = "0";

  const sx = bounds.shiftX;
  const sy = bounds.shiftY;

  for (const edge of doc.edges) {
    const from = doc.nodes.find((n) => n.id === edge.fromId);
    const to = doc.nodes.find((n) => n.id === edge.toId);
    if (!from || !to) continue;
    const style = resolveEdgeStyle(edge);
    const bent =
      edge.bendX != null && edge.bendY != null
        ? { bendX: edge.bendX + sx, bendY: edge.bendY + sy }
        : undefined;
    const path = document.createElementNS(svgNs, "path");
    path.setAttribute("class", "schema-edge");
    path.setAttribute("d", edgePath({ x: from.x + sx, y: from.y + sy }, { x: to.x + sx, y: to.y + sy }, bent));
    path.setAttribute("stroke", style.color);
    path.setAttribute("stroke-width", String(style.width));
    path.setAttribute("fill", "none");
    svg.appendChild(path);
  }
  addArrowHeadsToSvg(svg);
  root.appendChild(svg);

  for (const node of doc.nodes) {
    const nodeStyle = resolveNodeStyle(node);
    const dims = resolveNodeDimensions(node);
    const box = document.createElement("div");
    box.className = "schema-node";
    box.style.position = "absolute";
    box.style.left = `${node.x + sx}px`;
    box.style.top = `${node.y + sy}px`;
    box.style.width = `${dims.width}px`;
    box.style.height = `${dims.height}px`;
    box.style.zIndex = "1";
    box.style.backgroundColor = nodeStyle.backgroundColor;
    box.style.borderColor = nodeStyle.borderColor;

    const label = document.createElement("div");
    label.className = "schema-node-label schema-node-label-rich";
    label.innerHTML = nodeLabelHtml(node);
    label.style.fontSize = `${nodeStyle.fontSize}px`;
    label.style.color = nodeStyle.color;
    label.style.fontWeight = nodeStyle.fontWeight;
    label.style.textDecoration = nodeStyle.textDecoration;
    box.appendChild(label);
    root.appendChild(box);
  }

  return root;
}

function prepareExportSurface(
  doc: SchemaDocument,
  sourceCanvas?: HTMLElement | null,
): { element: HTMLElement; bounds: SchemaExportBounds } {
  const bounds = computeSchemaExportBounds(doc);
  const element =
    sourceCanvas != null
      ? createExportWrapFromCanvas(sourceCanvas, bounds)
      : buildExportElement(doc, bounds);
  return { element, bounds };
}

async function waitForExportLayout(): Promise<void> {
  try {
    await document.fonts.ready;
  } catch {
    /* ignore */
  }
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

async function rasterizeToPdf(
  element: HTMLElement,
  bounds: SchemaExportBounds,
  fileName: string,
): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const maxSide = Math.max(bounds.width, bounds.height);
  const captureScale = maxSide > 4800 ? 1 : maxSide > 3200 ? 1.5 : 2;

  const canvas = await html2canvas(element, {
    backgroundColor: "#f8fafc",
    scale: captureScale,
    useCORS: true,
    logging: false,
    width: bounds.width,
    height: bounds.height,
    windowWidth: bounds.width,
    windowHeight: bounds.height,
    onclone: (docClone) => {
      const cap = docClone.querySelector(".schema-export-capture");
      if (cap instanceof HTMLElement) {
        cap.style.opacity = "1";
        cap.style.transform = "none";
      }
    },
  });

  const img = canvas.toDataURL("image/png");
  const orientation = canvas.width >= canvas.height ? "landscape" : "portrait";
  const pdf = new jsPDF({ orientation, unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;
  const scale = Math.min(maxW / canvas.width, maxH / canvas.height);
  const drawW = canvas.width * scale;
  const drawH = canvas.height * scale;
  const x = margin + (maxW - drawW) / 2;
  const y = margin + (maxH - drawH) / 2;

  pdf.addImage(img, "PNG", x, y, drawW, drawH, undefined, "FAST");
  const safe = fileName.replace(/[^\wäöüÄÖÜß\- ]+/g, "_").trim() || "schema";
  pdf.save(`${safe}.pdf`);
}

/** Rendert das komplette Diagramm (alle Kästen/Linien) und exportiert als PDF. */
export async function exportSchemaDocumentToPdf(
  doc: SchemaDocument,
  fileName: string,
  sourceCanvas?: HTMLElement | null,
): Promise<void> {
  const { element, bounds } = prepareExportSurface(doc, sourceCanvas);
  element.style.position = "fixed";
  element.style.left = "0";
  element.style.top = "0";
  element.style.opacity = "0";
  element.style.pointerEvents = "none";
  element.style.zIndex = "2147483646";
  document.body.appendChild(element);
  try {
    await waitForExportLayout();
    await rasterizeToPdf(element, bounds, fileName);
  } finally {
    document.body.removeChild(element);
  }
}
