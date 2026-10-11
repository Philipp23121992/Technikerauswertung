"use client";

import type { ReactNode } from "react";
import {
  MAX_EDGE_WIDTH,
  MIN_EDGE_WIDTH,
  resolveEdgeStyle,
} from "@/lib/projekte/schema-edge-utils";
import { nodePlainLabel } from "@/lib/projekte/schema-rich-text";
import { SCHEMA_MODE_LABELS, type SchemaDocument, type SchemaEdge, type SchemaMode, type SchemaNode, type SchemaNodeStyle } from "@/lib/projekte/schema-types";

export type SchemaToolMode = "select" | "line";

type Props = {
  canEdit: boolean;
  toolMode: SchemaToolMode;
  onToolModeChange: (mode: SchemaToolMode) => void;
  doc: SchemaDocument;
  selectedNode: SchemaNode | null;
  selectedStyle: SchemaNodeStyle | null;
  selectedEdge: SchemaEdge | null;
  selectionColor: string;
  onSelectionColorChange: (color: string) => void;
  onApplySelectionColor: () => void;
  onApplySelectionBold: () => void;
  onApplySelectionUnderline: () => void;
  onPatchNodeStyle: (patch: Partial<SchemaNodeStyle>) => void;
  onToggleAutoLink: (checked: boolean) => void;
  onChangeDocMode: (mode: SchemaMode) => void;
  onDefaultEdgeColor: (color: string) => void;
  onDefaultEdgeWidth: (width: number) => void;
  onPatchEdge: (edgeId: string, patch: Partial<SchemaEdge>) => void;
  onSelectEdge: (edgeId: string) => void;
  onRemoveEdge: (edgeId: string) => void;
  onDeleteNode: () => void;
  onAddNode: () => void;
  onSave: () => void;
  onExportPdf: () => void;
  onDeleteProject: () => void;
  exportingPdf: boolean;
  layout?: "sidebar" | "header";
};

function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="schema-tool-section">
      <h3 className="schema-tool-section-title">{title}</h3>
      {children}
    </section>
  );
}

export function SchemaToolPanel(props: Props) {
  const {
    canEdit,
    toolMode,
    onToolModeChange,
    doc,
    selectedNode,
    selectedStyle,
    selectedEdge,
    selectionColor,
    onSelectionColorChange,
    onApplySelectionColor,
    onApplySelectionBold,
    onApplySelectionUnderline,
    onPatchNodeStyle,
    onToggleAutoLink,
    onChangeDocMode,
    onDefaultEdgeColor,
    onDefaultEdgeWidth,
    onPatchEdge,
    onSelectEdge,
    onRemoveEdge,
    onDeleteNode,
    onAddNode,
    onSave,
    onExportPdf,
    onDeleteProject,
    exportingPdf,
    layout = "sidebar",
  } = props;

  const defaultEdge = resolveEdgeStyle({
    color: doc.defaultEdgeColor,
    width: doc.defaultEdgeWidth,
  });
  const edgeStyle = selectedEdge ? resolveEdgeStyle(selectedEdge) : defaultEdge;

  const panelClass =
    layout === "header" ? "schema-tool-panel is-header" : "schema-tool-panel";

  return (
    <aside className={panelClass} aria-label="Schema-Werkzeuge">
      {layout === "sidebar" ? <h2 className="schema-tool-panel-title">Werkzeuge</h2> : null}

      <PanelSection title="Modus">
        <div className="schema-tool-mode-row">
          <button
            type="button"
            className={`schema-tool-mode-btn${toolMode === "select" ? " is-active" : ""}`}
            onClick={() => onToolModeChange("select")}
          >
            Auswahl
          </button>
          <button
            type="button"
            className={`schema-tool-mode-btn${toolMode === "line" ? " is-active" : ""}`}
            disabled={!canEdit}
            onClick={() => onToolModeChange("line")}
          >
            Linie ziehen
          </button>
        </div>
        {layout === "sidebar" ? (
          <p className="schema-inspector-hint">
            Linie: am blauen Punkt am Kasten starten, zum Ziel-Kasten ziehen. Linie anklicken zum
            Bearbeiten. Kurvenpunkt ziehen.
          </p>
        ) : null}
        <label className="form-field">
          <span>Diagramm-Typ</span>
          <select
            value={doc.mode}
            disabled={!canEdit}
            onChange={(e) => onChangeDocMode(e.target.value as SchemaMode)}
          >
            <option value="mindmap">{SCHEMA_MODE_LABELS.mindmap}</option>
            <option value="flowchart">{SCHEMA_MODE_LABELS.flowchart}</option>
          </select>
        </label>
        {canEdit ? (
          <button type="button" className="btn-secondary schema-tool-full" onClick={onAddNode}>
            {doc.mode === "mindmap" ? "+ Zweig" : "+ Kasten"}
          </button>
        ) : null}
        {doc.mode === "mindmap" ? (
          <label className="schema-inspector-check">
            <input
              type="checkbox"
              checked={Boolean(doc.autoLinkBranches)}
              disabled={!canEdit}
              onChange={(e) => onToggleAutoLink(e.target.checked)}
            />
            Neue Zweige automatisch verbinden
          </label>
        ) : null}
      </PanelSection>

      <PanelSection title="Linie / Pfeil">
        <label className="form-field">
          <span>Farbe {selectedEdge ? "(ausgewählt)" : "(neu)"}</span>
          <input
            type="color"
            disabled={!canEdit}
            value={edgeStyle.color}
            onChange={(e) => {
              const color = e.target.value;
              if (selectedEdge) onPatchEdge(selectedEdge.id, { color });
              else onDefaultEdgeColor(color);
            }}
          />
        </label>
        <label className="form-field">
          <span>Stärke (px)</span>
          <input
            type="range"
            min={MIN_EDGE_WIDTH}
            max={MAX_EDGE_WIDTH}
            disabled={!canEdit}
            value={edgeStyle.width}
            onChange={(e) => {
              const width = Number(e.target.value);
              if (selectedEdge) onPatchEdge(selectedEdge.id, { width });
              else onDefaultEdgeWidth(width);
            }}
          />
          <span className="schema-range-value">{edgeStyle.width} px</span>
        </label>
        {selectedEdge && canEdit ? (
          <button
            type="button"
            className="btn-secondary schema-tool-full"
            onClick={() => onRemoveEdge(selectedEdge.id)}
          >
            Linie löschen
          </button>
        ) : null}
        {!selectedEdge ? (
          <p className="muted">Linie im Diagramm wählen oder neue Linie ziehen.</p>
        ) : null}
      </PanelSection>

      <PanelSection title="Text &amp; Kasten">
        {!selectedNode || !selectedStyle ? (
          <p className="muted">Kasten wählen, Text direkt im Kasten bearbeiten.</p>
        ) : (
          <>
            <label className="form-field">
              <span>Schriftgröße</span>
              <input
                type="number"
                min={10}
                max={48}
                disabled={!canEdit}
                value={selectedStyle.fontSize}
                onChange={(e) =>
                  onPatchNodeStyle({ fontSize: Number(e.target.value) || 14 })
                }
              />
            </label>
            <label className="form-field">
              <span>Standard-Textfarbe</span>
              <input
                type="color"
                disabled={!canEdit}
                value={selectedStyle.color}
                onChange={(e) => onPatchNodeStyle({ color: e.target.value })}
              />
            </label>
            <label className="form-field">
              <span>Markierung einfärben</span>
              <input
                type="color"
                disabled={!canEdit}
                value={selectionColor}
                onChange={(e) => onSelectionColorChange(e.target.value)}
              />
            </label>
            <div className="schema-inspector-inline-actions">
              <button type="button" className="btn-secondary" disabled={!canEdit} onClick={onApplySelectionColor}>
                Farbe auf Auswahl
              </button>
              <button type="button" className="btn-secondary" disabled={!canEdit} onClick={onApplySelectionBold}>
                Fett
              </button>
              <button type="button" className="btn-secondary" disabled={!canEdit} onClick={onApplySelectionUnderline}>
                Unterstrichen
              </button>
            </div>
            <label className="form-field">
              <span>Hintergrund</span>
              <input
                type="color"
                disabled={!canEdit}
                value={selectedStyle.backgroundColor}
                onChange={(e) => onPatchNodeStyle({ backgroundColor: e.target.value })}
              />
            </label>
            <label className="form-field">
              <span>Rahmen</span>
              <input
                type="color"
                disabled={!canEdit}
                value={selectedStyle.borderColor}
                onChange={(e) => onPatchNodeStyle({ borderColor: e.target.value })}
              />
            </label>
            <div className="schema-inspector-toggles">
              <label className="schema-inspector-check">
                <input
                  type="checkbox"
                  disabled={!canEdit}
                  checked={selectedStyle.fontWeight === "bold"}
                  onChange={(e) =>
                    onPatchNodeStyle({ fontWeight: e.target.checked ? "bold" : "normal" })
                  }
                />
                Ganzer Kasten fett
              </label>
              <label className="schema-inspector-check">
                <input
                  type="checkbox"
                  disabled={!canEdit}
                  checked={selectedStyle.textDecoration === "underline"}
                  onChange={(e) =>
                    onPatchNodeStyle({
                      textDecoration: e.target.checked ? "underline" : "none",
                    })
                  }
                />
                Ganzer Kasten unterstrichen
              </label>
            </div>
            {canEdit ? (
              <button type="button" className="btn-secondary schema-tool-full" onClick={onDeleteNode}>
                Kasten löschen
              </button>
            ) : null}
          </>
        )}
      </PanelSection>

      <PanelSection title="Verbindungen">
        {doc.edges.length === 0 ? (
          <p className="muted">Noch keine Linien.</p>
        ) : (
          <ul className="schema-tool-edge-list">
            {doc.edges.map((edge) => {
              const from = doc.nodes.find((n) => n.id === edge.fromId);
              const to = doc.nodes.find((n) => n.id === edge.toId);
              return (
                <li key={edge.id}>
                  <button
                    type="button"
                    className={`schema-tool-edge-pick${selectedEdge?.id === edge.id ? " is-active" : ""}`}
                    onClick={() => onSelectEdge(edge.id)}
                  >
                    {from ? nodePlainLabel(from) : "?"} → {to ? nodePlainLabel(to) : "?"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PanelSection>

      <PanelSection title="Projekt">
        <button type="button" className="btn-primary schema-tool-full" onClick={onSave} disabled={!canEdit}>
          Speichern
        </button>
        <button
          type="button"
          className="btn-secondary schema-tool-full"
          onClick={onExportPdf}
          disabled={exportingPdf}
        >
          {exportingPdf ? "PDF …" : "Als PDF exportieren"}
        </button>
        {canEdit ? (
          <button type="button" className="btn-secondary schema-tool-full is-danger" onClick={onDeleteProject}>
            Projekt löschen
          </button>
        ) : null}
      </PanelSection>
    </aside>
  );
}
