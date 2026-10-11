"use client";

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import {
  nodeLabelHtml,
  plainTextFromHtml,
  sanitizeLabelHtml,
  type LabeledNodeLike,
} from "@/lib/projekte/schema-rich-text";

type ContentPatch = { label: string; labelHtml: string };

type Props = {
  nodeId: string;
  node: LabeledNodeLike;
  isSelected: boolean;
  canEdit: boolean;
  textStyle: CSSProperties;
  autoFocus?: boolean;
  onContentChange: (patch: ContentPatch, autosave?: boolean) => void;
  onCommit: () => void;
  onAutoFit: () => void;
};

export function SchemaNodeRichLabel({
  nodeId,
  node,
  isSelected,
  canEdit,
  textStyle,
  autoFocus,
  onContentChange,
  onCommit,
  onAutoFit,
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const loadedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isSelected || !canEdit) {
      loadedIdRef.current = null;
      return;
    }
    const el = editorRef.current;
    if (!el) return;
    if (loadedIdRef.current !== nodeId) {
      el.innerHTML = nodeLabelHtml(node);
      loadedIdRef.current = nodeId;
    }
    if (autoFocus) {
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [autoFocus, canEdit, isSelected, node, nodeId]);

  function readContent(): ContentPatch {
    const html = sanitizeLabelHtml(editorRef.current?.innerHTML ?? "");
    const label = plainTextFromHtml(html) || "Knoten";
    return { labelHtml: html, label };
  }

  if (isSelected && canEdit) {
    return (
      <div
        ref={editorRef}
        className="schema-node-editor"
        contentEditable
        suppressContentEditableWarning
        style={textStyle}
        onClick={(e) => e.stopPropagation()}
        onInput={() => {
          onContentChange(readContent(), true);
          requestAnimationFrame(() => onAutoFit());
        }}
        onBlur={() => {
          onContentChange(readContent(), false);
          onAutoFit();
          onCommit();
        }}
      />
    );
  }

  return (
    <div
      className="schema-node-label schema-node-label-rich"
      style={textStyle}
      dangerouslySetInnerHTML={{ __html: nodeLabelHtml(node) }}
    />
  );
}
