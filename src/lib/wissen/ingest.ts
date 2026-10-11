import {
  createId,
  type KnowledgeChunk,
  type KnowledgeDb,
  type KnowledgeDoc,
} from "./types";
import type { KnowledgePiece } from "./lexmark-knowledge";

export function upsertKnowledgeDoc(
  db: KnowledgeDb,
  input: {
    key: string;
    title: string;
    fileName?: string;
    mimeType: string;
    category: KnowledgeDoc["category"];
    pieces: KnowledgePiece[];
  },
): KnowledgeDoc {
  const pieces = input.pieces.filter((piece) => piece.text.trim());
  const existing = db.docs.find(
    (doc) =>
      doc.fileName.toLowerCase() === input.key.toLowerCase() ||
      doc.fileName.toLowerCase() === (input.fileName || input.key).toLowerCase() ||
      doc.id === input.key,
  );
  const now = new Date().toISOString();
  const id = existing?.id ?? createId("doc");
  const doc: KnowledgeDoc = {
    id,
    title: input.title,
    fileName: input.fileName || input.key,
    mimeType: input.mimeType,
    category: input.category,
    active: existing?.active ?? true,
    charCount: pieces.reduce((sum, piece) => sum + piece.text.length, 0),
    chunkCount: pieces.length,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  db.docs = [doc, ...db.docs.filter((item) => item.id !== id)];
  db.chunks = [
    ...db.chunks.filter((chunk) => chunk.docId !== id),
    ...pieces.map((piece, index) => ({
      id: createId("chunk"),
      docId: id,
      title: piece.title || input.title,
      text: piece.text,
      index,
    } satisfies KnowledgeChunk)),
  ];
  return doc;
}
