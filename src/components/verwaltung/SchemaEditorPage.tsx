"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useEditAccess } from "@/components/EditAccessProvider";
import { SchemaNodeRichLabel } from "@/components/verwaltung/SchemaNodeRichLabel";
import {
  SchemaToolPanel,
  type SchemaToolMode,
} from "@/components/verwaltung/SchemaToolPanel";
import { createId } from "@/lib/id";
import {
  defaultBendPoint,
  edgePath,
  findNodeAtPoint,
  resolveEdgeStyle,
} from "@/lib/projekte/schema-edge-utils";
import {
  computeSchemaExportBounds,
  exportSchemaDocumentToPdf,
} from "@/lib/projekte/schema-pdf-export";
import { deleteProjectById, saveSchemaProject } from "@/lib/projekte/save-projekte";
import {
  applyInlineColor,
  applyInlineCommand,
  clampNodeSize,
  DEFAULT_SCHEMA_NODE_HEIGHT,
  DEFAULT_SCHEMA_NODE_WIDTH,
  plainTextFromHtml,
  resolveNodeDimensions,
  sanitizeLabelHtml,
  sizeForNodeContent,
} from "@/lib/projekte/schema-rich-text";
import {
  createEmptySchemaDocument,
  resolveNodeStyle,
  type SchemaDocument,
  type SchemaEdge,
  type SchemaMode,
  type SchemaNode,
  type SchemaNodeStyle,
} from "@/lib/projekte/schema-types";
import { isSchemaProject, type Project } from "@/lib/projekte/types";

type DragState = {
  nodeId: string;
  offsetX: number;
  offsetY: number;
};

type ResizeState = {
  nodeId: string;
  pointerStartX: number;
  pointerStartY: number;
  startW: number;
  startH: number;
};

type LineDragState = {
  fromId: string;
  x: number;
  y: number;
};

type BendDragState = {
  edgeId: string;
};

function canvasPoint(
  canvas: HTMLDivElement | null,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

function nodeBoxStyle(style: SchemaNodeStyle): CSSProperties {
  return {
    backgroundColor: style.backgroundColor,
    borderColor: style.borderColor,
  };
}

function nodeTextStyle(style: SchemaNodeStyle): CSSProperties {
  return {
    fontSize: style.fontSize,
    color: style.color,
    fontWeight: style.fontWeight,
    textDecoration: style.textDecoration,
  };
}

export function SchemaEditorPage({ projectId }: { projectId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { canEdit } = useEditAccess();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [toolMode, setToolMode] = useState<SchemaToolMode>("select");
  const [lineDrag, setLineDrag] = useState<LineDragState | null>(null);
  const [bendDrag, setBendDrag] = useState<BendDragState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [resize, setResize] = useState<ResizeState | null>(null);
  const [selectionColor, setSelectionColor] = useState("#dc2626");
  const [exportingPdf, setExportingPdf] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ w: 1200, h: 720 });
  const hydratedIdRef = useRef<string | null>(null);
  const focusNodeRef = useRef<string | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const fitAllOnceRef = useRef(false);
  const dragRef = useRef(drag);
  const resizeRef = useRef(resize);
  const lineDragRef = useRef(lineDrag);
  const bendDragRef = useRef(bendDrag);

  useEffect(() => {
    dragRef.current = drag;
    resizeRef.current = resize;
    lineDragRef.current = lineDrag;
    bendDragRef.current = bendDrag;
  }, [bendDrag, drag, lineDrag, resize]);

  const project = useMemo(
    () => projects.find((p) => p.id === projectId && isSchemaProject(p)),
    [projects, projectId],
  );

  const [title, setTitle] = useState("");
  const [doc, setDoc] = useState<SchemaDocument>(() => createEmptySchemaDocument("mindmap"));
  const docRef = useRef(doc);
  const titleRef = useRef(title);

  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  useEffect(() => {
    hydratedIdRef.current = null;
    fitAllOnceRef.current = false;
  }, [projectId]);

  useEffect(() => {
    if (!project) return;
    if (hydratedIdRef.current === project.id) return;
    hydratedIdRef.current = project.id;
    setTitle(project.title);
    setDoc(project.schemaDocument ?? createEmptySchemaDocument("mindmap"));
    setSelectedId(project.schemaDocument?.nodes[0]?.id ?? null);
  }, [project]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/projekte", { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) throw new Error("Projekte konnten nicht geladen werden.");
      const data = (await res.json()) as { projects?: Project[] };
      setProjects(Array.isArray(data.projects) ? data.projects : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Laden fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const wrap = canvasWrapRef.current;
    if (!wrap) return;
    const measure = () => {
      setViewportSize({
        w: Math.max(320, wrap.clientWidth),
        h: Math.max(240, wrap.clientHeight),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [loading, project]);

  const canvasSize = useMemo(() => {
    const bounds = computeSchemaExportBounds(doc);
    return {
      w: Math.max(viewportSize.w, bounds.width),
      h: Math.max(viewportSize.h, bounds.height),
    };
  }, [doc, viewportSize.h, viewportSize.w]);

  const autoFitNode = useCallback((nodeId: string, autosave = false) => {
    if (dragRef.current || resizeRef.current) return;
    const root = canvasRef.current?.querySelector(`[data-schema-node="${nodeId}"]`);
    const content = root?.querySelector(".schema-node-editor, .schema-node-label");
    const node = docRef.current.nodes.find((n) => n.id === nodeId);
    if (!(content instanceof HTMLElement) || !node) return;
    const current = resolveNodeDimensions(node);
    const next = sizeForNodeContent(content, current, Boolean(node.userSized));
    if (next.width === current.width && next.height === current.height) return;
    const nodes = docRef.current.nodes.map((n) =>
      n.id === nodeId ? { ...n, width: next.width, height: next.height } : n,
    );
    const nextDoc = { ...docRef.current, nodes };
    docRef.current = nextDoc;
    setDoc(nextDoc);
    if (autosave) scheduleSave(nextDoc);
  }, []);

  useLayoutEffect(() => {
    if (loading || fitAllOnceRef.current || doc.nodes.length === 0) return;
    fitAllOnceRef.current = true;
    requestAnimationFrame(() => {
      for (const node of docRef.current.nodes) {
        autoFitNode(node.id, false);
      }
    });
  }, [autoFitNode, doc.nodes.length, loading]);

  useEffect(() => {
    if (!drag && !resize && !lineDrag && !bendDrag) return;
    const finish = () => {
      const r = resizeRef.current;
      const d = dragRef.current;
      const line = lineDragRef.current;
      const bend = bendDragRef.current;
      if (line) {
        const target = findNodeAtPoint(docRef.current.nodes, line.x, line.y, line.fromId);
        if (target) {
          setDoc((prev) => {
            const exists = prev.edges.some(
              (e) => e.fromId === line.fromId && e.toId === target.id,
            );
            if (exists) return prev;
            const from = prev.nodes.find((n) => n.id === line.fromId);
            const bend = from ? defaultBendPoint(from, target) : { bendX: line.x, bendY: line.y };
            const edge: SchemaEdge = {
              id: createId("sedge"),
              fromId: line.fromId,
              toId: target.id,
              color: prev.defaultEdgeColor,
              width: prev.defaultEdgeWidth,
              bendX: bend.bendX,
              bendY: bend.bendY,
            };
            const next = { ...prev, edges: [...prev.edges, edge] };
            docRef.current = next;
            scheduleSave(next);
            return next;
          });
          setSelectedEdgeId(null);
        }
        setLineDrag(null);
      }
      if (bend) {
        scheduleSave(docRef.current);
        setBendDrag(null);
      }
      if (r) {
        const id = r.nodeId;
        setDoc((prev) => {
          const next = {
            ...prev,
            nodes: prev.nodes.map((n) => (n.id === id ? { ...n, userSized: true } : n)),
          };
          docRef.current = next;
          scheduleSave(next);
          return next;
        });
        requestAnimationFrame(() => autoFitNode(id, true));
      } else if (d) {
        scheduleSave(docRef.current);
      }
      setDrag(null);
      setResize(null);
    };
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [autoFitNode, bendDrag, drag, lineDrag, resize]);

  const persist = useCallback(
    async (nextProject: Project) => {
      if (!canEdit) {
        setError("Schreibzugriff gesperrt.");
        return false;
      }
      if (!nextProject.schemaDocument) {
        setError("Schema-Daten fehlen.");
        return false;
      }
      setError(null);
      try {
        const saved = await saveSchemaProject({
          projectId: nextProject.id,
          title: nextProject.title,
          schemaDocument: nextProject.schemaDocument,
        });
        setProjects((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
        setSavedHint("Gespeichert.");
        window.setTimeout(() => setSavedHint(null), 2000);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
        return false;
      }
    },
    [canEdit],
  );

  function buildProject(nextDoc: SchemaDocument, nextTitle: string): Project | null {
    if (!project) return null;
    const now = new Date().toISOString();
    return {
      ...project,
      title: nextTitle.trim() || project.title,
      schemaDocument: nextDoc,
      updatedAt: now,
    };
  }

  function scheduleSave(nextDoc: SchemaDocument, nextTitle: string = titleRef.current) {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      const built = buildProject(nextDoc, nextTitle);
      if (built) void persist(built);
    }, 450);
  }

  async function saveNow(nextDoc: SchemaDocument = docRef.current, nextTitle: string = titleRef.current) {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const built = buildProject(nextDoc, nextTitle);
    if (!built) return;
    await persist(built);
  }

  function updateDoc(updater: (prev: SchemaDocument) => SchemaDocument, autosave = false) {
    setDoc((prev) => {
      const next = updater(prev);
      if (autosave) scheduleSave(next);
      return next;
    });
  }

  function patchNode(nodeId: string, patch: Partial<SchemaNode>, autosave = true) {
    updateDoc(
      (prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)),
      }),
      autosave,
    );
  }

  function patchNodeStyle(nodeId: string, stylePatch: Partial<SchemaNodeStyle>) {
    if (!selectedId) return;
    patchNodeStyleFor(nodeId, stylePatch);
  }

  function patchNodeStyleFor(nodeId: string, stylePatch: Partial<SchemaNodeStyle>) {
    updateDoc(
      (prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) => {
          if (n.id !== nodeId) return n;
          const merged = { ...resolveNodeStyle(n), ...stylePatch };
          return { ...n, style: merged };
        }),
      }),
      true,
    );
  }

  function patchEdge(edgeId: string, patch: Partial<SchemaEdge>, autosave = true) {
    updateDoc(
      (prev) => ({
        ...prev,
        edges: prev.edges.map((e) => (e.id === edgeId ? { ...e, ...patch } : e)),
      }),
      autosave,
    );
  }

  function setDefaultEdgeColor(color: string) {
    updateDoc((prev) => ({ ...prev, defaultEdgeColor: color }), true);
  }

  function setDefaultEdgeWidth(width: number) {
    updateDoc((prev) => ({ ...prev, defaultEdgeWidth: width }), true);
  }

  async function handleExportPdf() {
    setExportingPdf(true);
    try {
      await exportSchemaDocumentToPdf(
        docRef.current,
        title.trim() || "schema",
        canvasRef.current,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF-Export fehlgeschlagen.");
    } finally {
      setExportingPdf(false);
    }
  }

  async function handleDeleteProject() {
    if (!canEdit || !project) return;
    if (!window.confirm(`Schema-Projekt „${title}“ endgültig löschen?`)) return;
    try {
      const next = await deleteProjectById(project.id, projects);
      setProjects(next);
      router.push("/verwaltung/schema");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Löschen fehlgeschlagen.");
    }
  }

  const pdfAutoRef = useRef(false);
  useEffect(() => {
    if (searchParams.get("export") !== "pdf" || loading || !project || pdfAutoRef.current) return;
    pdfAutoRef.current = true;
    void handleExportPdf();
    router.replace(`/verwaltung/schema/${encodeURIComponent(projectId)}`);
  }, [loading, project, projectId, router, searchParams]);

  function addNode() {
    if (!canEdit) return;
    const id = createId("snode");
    const anchor = doc.nodes.find((n) => n.id === selectedId) ?? doc.nodes[0];
    const angle = doc.mode === "mindmap" ? (doc.nodes.length * 0.9) % (Math.PI * 2) : 0;
    const dist = doc.mode === "mindmap" ? 140 : 0;
    const node: SchemaNode = {
      id,
      label: doc.mode === "mindmap" ? "Neuer Zweig" : "Schritt",
      x: anchor ? anchor.x + Math.cos(angle) * dist + (doc.mode === "flowchart" ? 180 : 0) : 200,
      y: anchor ? anchor.y + Math.sin(angle) * dist + (doc.mode === "flowchart" ? 0 : 80) : 200,
      width: DEFAULT_SCHEMA_NODE_WIDTH,
      height: DEFAULT_SCHEMA_NODE_HEIGHT,
    };
    const edges: SchemaEdge[] = [...doc.edges];
    if (doc.mode === "mindmap" && doc.autoLinkBranches && anchor) {
      const bend = defaultBendPoint(anchor, node);
      edges.push({
        id: createId("sedge"),
        fromId: anchor.id,
        toId: id,
        color: doc.defaultEdgeColor,
        width: doc.defaultEdgeWidth,
        bendX: bend.bendX,
        bendY: bend.bendY,
      });
    }
    const next = { ...doc, nodes: [...doc.nodes, node], edges };
    setDoc(next);
    setSelectedId(id);
    focusNodeRef.current = id;
    scheduleSave(next);
  }

  function deleteSelected() {
    if (!canEdit || !selectedId) return;
    if (doc.nodes.length <= 1) {
      setError("Mindestens ein Knoten muss bleiben.");
      return;
    }
    const nodes = doc.nodes.filter((n) => n.id !== selectedId);
    const edges = doc.edges.filter((e) => e.fromId !== selectedId && e.toId !== selectedId);
    const next = { ...doc, nodes, edges };
    setDoc(next);
    setSelectedId(nodes[0]?.id ?? null);
    void saveNow(next);
  }

  function removeEdge(edgeId: string) {
    if (!canEdit) return;
    const next = { ...doc, edges: doc.edges.filter((e) => e.id !== edgeId) };
    setDoc(next);
    scheduleSave(next);
  }

  function onDragHandlePointerDown(e: React.PointerEvent, node: SchemaNode) {
    if (!canEdit) return;
    e.stopPropagation();
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setSelectedId(node.id);
    setDrag({
      nodeId: node.id,
      offsetX: e.clientX - rect.left - node.x,
      offsetY: e.clientY - rect.top - node.y,
    });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onResizePointerDown(e: React.PointerEvent, node: SchemaNode) {
    if (!canEdit) return;
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(node.id);
    const el = canvasRef.current?.querySelector(`[data-schema-node="${node.id}"]`);
    const rect = el?.getBoundingClientRect();
    const dims = resolveNodeDimensions(node);
    setResize({
      nodeId: node.id,
      pointerStartX: e.clientX,
      pointerStartY: e.clientY,
      startW: rect?.width ?? dims.width,
      startH: rect?.height ?? dims.height,
    });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function startLineFromNode(e: React.PointerEvent, node: SchemaNode) {
    if (!canEdit) return;
    e.stopPropagation();
    e.preventDefault();
    const p = canvasPoint(canvasRef.current, e.clientX, e.clientY);
    if (!p) return;
    setToolMode("line");
    setSelectedId(node.id);
    setSelectedEdgeId(null);
    setLineDrag({ fromId: node.id, x: p.x, y: p.y });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onBendPointerDown(e: React.PointerEvent, edgeId: string) {
    if (!canEdit) return;
    e.stopPropagation();
    e.preventDefault();
    setBendDrag({ edgeId });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onCanvasPointerMove(e: React.PointerEvent) {
    if (!canEdit) return;
    const p = canvasPoint(canvasRef.current, e.clientX, e.clientY);
    if (lineDrag && p) {
      setLineDrag({ ...lineDrag, x: p.x, y: p.y });
      return;
    }
    if (bendDrag && p) {
      patchEdge(bendDrag.edgeId, { bendX: p.x, bendY: p.y }, false);
      return;
    }
    if (resize) {
      const dw = e.clientX - resize.pointerStartX;
      const dh = e.clientY - resize.pointerStartY;
      const { width, height } = clampNodeSize(resize.startW + dw, resize.startH + dh);
      updateDoc(
        (prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) =>
            n.id === resize.nodeId ? { ...n, width, height } : n,
          ),
        }),
        false,
      );
      return;
    }
    if (!drag) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const maxX = canvasRef.current?.scrollWidth ?? canvasSize.w;
    const maxY = canvasRef.current?.scrollHeight ?? canvasSize.h;
    const x = Math.min(maxX - 40, Math.max(40, e.clientX - rect.left - drag.offsetX));
    const y = Math.min(maxY - 28, Math.max(28, e.clientY - rect.top - drag.offsetY));
    updateDoc(
      (prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) => (n.id === drag.nodeId ? { ...n, x, y } : n)),
      }),
      false,
    );
  }

  function onCanvasPointerUp() {
    /* Abschluss per window pointerup (auch außerhalb der Canvas) */
  }

  function applySelectionColor() {
    if (!selectedId || !canEdit) return;
    const editor = canvasRef.current?.querySelector(
      `[data-schema-node="${selectedId}"] .schema-node-editor`,
    );
    if (!(editor instanceof HTMLElement)) {
      setError("Text markieren, dann Farbe anwenden.");
      return;
    }
    if (!applyInlineColor(editor, selectionColor)) {
      setError("Bitte zuerst einen Textbereich im Kasten markieren.");
      return;
    }
    setError(null);
    const html = sanitizeLabelHtml(editor.innerHTML);
    const label = plainTextFromHtml(html) || "Knoten";
    patchNode(selectedId, { labelHtml: html, label }, true);
    requestAnimationFrame(() => autoFitNode(selectedId, true));
  }

  function applySelectionStyle(command: "bold" | "underline") {
    if (!selectedId || !canEdit) return;
    const editor = canvasRef.current?.querySelector(
      `[data-schema-node="${selectedId}"] .schema-node-editor`,
    );
    if (!(editor instanceof HTMLElement)) return;
    if (!applyInlineCommand(editor, command)) {
      setError("Bitte zuerst einen Textbereich markieren.");
      return;
    }
    setError(null);
    const html = sanitizeLabelHtml(editor.innerHTML);
    const label = plainTextFromHtml(html) || "Knoten";
    patchNode(selectedId, { labelHtml: html, label }, true);
    requestAnimationFrame(() => autoFitNode(selectedId, true));
  }

  function handleNodeSelect(node: SchemaNode, e: React.MouseEvent) {
    e.stopPropagation();
    if (toolMode === "line") return;
    setSelectedId(node.id);
    setSelectedEdgeId(null);
    requestAnimationFrame(() => autoFitNode(node.id, false));
  }

  function changeMode(mode: SchemaMode) {
    if (mode === doc.mode) return;
    const next = createEmptySchemaDocument(mode);
    next.nodes[0] = { ...next.nodes[0], label: doc.nodes[0]?.label ?? next.nodes[0].label };
    setDoc(next);
    setSelectedId(next.nodes[0].id);
    void saveNow(next);
  }

  function toggleAutoLink(checked: boolean) {
    const next = { ...doc, autoLinkBranches: checked };
    setDoc(next);
    scheduleSave(next);
  }

  const selectedNode = doc.nodes.find((n) => n.id === selectedId);
  const selectedStyle = selectedNode ? resolveNodeStyle(selectedNode) : null;
  const selectedEdge = doc.edges.find((e) => e.id === selectedEdgeId) ?? null;

  function getBendHandle(edge: SchemaEdge): { x: number; y: number } | null {
    const from = doc.nodes.find((n) => n.id === edge.fromId);
    const to = doc.nodes.find((n) => n.id === edge.toId);
    if (!from || !to) return null;
    if (edge.bendX != null && edge.bendY != null) return { x: edge.bendX, y: edge.bendY };
    const bend = defaultBendPoint(from, to);
    return { x: bend.bendX, y: bend.bendY };
  }

  if (loading) {
    return (
      <main className="page-shell schema-page">
        <p>Lade …</p>
      </main>
    );
  }

  if (!project) {
    return (
      <main className="page-shell schema-page">
        <p className="form-error">Schema-Projekt nicht gefunden.</p>
        <Link href="/verwaltung/schema">Zurück zur Übersicht</Link>
      </main>
    );
  }

  return (
    <main className="page-shell schema-page schema-editor">
      <header className="schema-editor-header">
        <div className="schema-editor-toolbar">
          <Link href="/verwaltung/schema" className="btn-secondary">
            ← Übersicht
          </Link>
          <input
            className="schema-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => void saveNow(docRef.current, title)}
            disabled={!canEdit}
            aria-label="Projektitel"
          />
          {savedHint ? <span className="schema-saved-hint">{savedHint}</span> : null}
        </div>

        <SchemaToolPanel
          layout="header"
          canEdit={canEdit}
          toolMode={toolMode}
          onToolModeChange={setToolMode}
          doc={doc}
          selectedNode={selectedNode ?? null}
          selectedStyle={selectedStyle}
          selectedEdge={selectedEdge}
          selectionColor={selectionColor}
          onSelectionColorChange={setSelectionColor}
          onApplySelectionColor={applySelectionColor}
          onApplySelectionBold={() => applySelectionStyle("bold")}
          onApplySelectionUnderline={() => applySelectionStyle("underline")}
          onPatchNodeStyle={(patch) => selectedNode && patchNodeStyleFor(selectedNode.id, patch)}
          onToggleAutoLink={toggleAutoLink}
          onChangeDocMode={changeMode}
          onDefaultEdgeColor={setDefaultEdgeColor}
          onDefaultEdgeWidth={setDefaultEdgeWidth}
          onPatchEdge={patchEdge}
          onSelectEdge={(id) => {
            setSelectedEdgeId(id);
            setSelectedId(null);
          }}
          onRemoveEdge={removeEdge}
          onDeleteNode={deleteSelected}
          onAddNode={addNode}
          onSave={() => void saveNow()}
          onExportPdf={() => void handleExportPdf()}
          onDeleteProject={() => void handleDeleteProject()}
          exportingPdf={exportingPdf}
        />
      </header>

      {error ? <p className="form-error schema-editor-error">{error}</p> : null}

      <div ref={canvasWrapRef} className="schema-canvas-wrap">
        <div
          ref={canvasRef}
          className="schema-canvas"
          style={{ width: canvasSize.w, height: canvasSize.h, minWidth: "100%", minHeight: "100%" }}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          onPointerLeave={onCanvasPointerUp}
          onClick={() => {
            setSelectedId(null);
            setSelectedEdgeId(null);
          }}
        >
          <svg className="schema-edges" width={canvasSize.w} height={canvasSize.h}>
            <defs>
              {doc.edges.map((edge) => {
                const style = resolveEdgeStyle(edge);
                return (
                  <marker
                    key={`m-${edge.id}`}
                    id={`schema-arrow-${edge.id}`}
                    markerWidth="8"
                    markerHeight="8"
                    refX="6"
                    refY="4"
                    orient="auto"
                  >
                    <path d="M0,0 L8,4 L0,8 Z" fill={style.color} />
                  </marker>
                );
              })}
            </defs>
            {doc.edges.map((edge) => {
              const from = doc.nodes.find((n) => n.id === edge.fromId);
              const to = doc.nodes.find((n) => n.id === edge.toId);
              if (!from || !to) return null;
              const style = resolveEdgeStyle(edge);
              return (
                <path
                  key={edge.id}
                  d={edgePath(from, to, edge)}
                  className={`schema-edge${selectedEdgeId === edge.id ? " is-selected" : ""}`}
                  stroke={style.color}
                  strokeWidth={style.width}
                  markerEnd={`url(#schema-arrow-${edge.id})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedEdgeId(edge.id);
                    setSelectedId(null);
                  }}
                />
              );
            })}
            {lineDrag ? (
              <line
                x1={doc.nodes.find((n) => n.id === lineDrag.fromId)?.x ?? lineDrag.x}
                y1={doc.nodes.find((n) => n.id === lineDrag.fromId)?.y ?? lineDrag.y}
                x2={lineDrag.x}
                y2={lineDrag.y}
                className="schema-edge-preview"
                stroke={doc.defaultEdgeColor ?? resolveEdgeStyle({}).color}
                strokeWidth={doc.defaultEdgeWidth ?? 2}
                strokeDasharray="6 4"
              />
            ) : null}
            {selectedEdge && canEdit
              ? (() => {
                  const bend = getBendHandle(selectedEdge);
                  if (!bend) return null;
                  return (
                    <circle
                      cx={bend.x}
                      cy={bend.y}
                      r={7}
                      className="schema-edge-bend"
                      onPointerDown={(e) => onBendPointerDown(e, selectedEdge.id)}
                    />
                  );
                })()
              : null}
          </svg>
          {doc.nodes.map((node) => {
            const isSelected = node.id === selectedId;
            const style = resolveNodeStyle(node);
            const dims = resolveNodeDimensions(node);
            return (
              <div
                key={node.id}
                data-schema-node={node.id}
                className={`schema-node${isSelected ? " is-selected is-editing" : ""}${
                  lineDrag?.fromId === node.id ? " is-connect" : ""
                }`}
                style={{
                  left: node.x,
                  top: node.y,
                  width: dims.width,
                  height: dims.height,
                  ...nodeBoxStyle(style),
                }}
                onClick={(e) => handleNodeSelect(node, e)}
              >
                <button
                  type="button"
                  className="schema-node-drag"
                  title="Verschieben"
                  aria-label="Knoten verschieben"
                  disabled={!canEdit}
                  onPointerDown={(e) => onDragHandlePointerDown(e, node)}
                >
                  ⠿
                </button>
                <SchemaNodeRichLabel
                  nodeId={node.id}
                  node={node}
                  isSelected={isSelected}
                  canEdit={canEdit}
                  textStyle={nodeTextStyle(style)}
                  autoFocus={focusNodeRef.current === node.id}
                  onContentChange={(patch, autosave) => {
                    if (focusNodeRef.current === node.id) focusNodeRef.current = null;
                    patchNode(node.id, patch, autosave);
                  }}
                  onCommit={() => {
                    autoFitNode(node.id, false);
                    void saveNow();
                  }}
                  onAutoFit={() => autoFitNode(node.id, true)}
                />
                {canEdit ? (
                  <>
                    <button
                      type="button"
                      className="schema-node-port"
                      title="Linie ziehen"
                      aria-label="Linie zu anderem Kasten ziehen"
                      onPointerDown={(e) => startLineFromNode(e, node)}
                    />
                    <button
                      type="button"
                      className="schema-node-resize"
                      title="Größe ziehen"
                      aria-label="Kastengröße anpassen"
                      onPointerDown={(e) => onResizePointerDown(e, node)}
                    />
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
