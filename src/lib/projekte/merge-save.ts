import type { SchemaDocument } from "@/lib/projekte/schema-types";
import type { Project } from "@/lib/projekte/types";

function schemaRichness(doc: SchemaDocument | null | undefined): number {
  if (!doc) return 0;
  return (doc.nodes?.length ?? 0) * 10 + (doc.edges?.length ?? 0);
}

function updatedAtMs(value: string | undefined): number {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

/** Verhindert, dass Kanban-Speichern oder veraltete Clients Schema-Inhalte löschen. */
export function mergeProjectForSave(existing: Project | undefined, incoming: Project): Project {
  if (!existing) return incoming;

  const merged: Project = {
    ...incoming,
    attachments: existing.attachments?.length ? existing.attachments : incoming.attachments,
    dueMailSentAt:
      existing.dueDate !== incoming.dueDate
        ? null
        : incoming.dueMailSentAt ?? existing.dueMailSentAt ?? null,
  };

  const existingSchema =
    existing.projectKind === "schema" || schemaRichness(existing.schemaDocument) > 0;
  const incomingSchema =
    incoming.projectKind === "schema" || schemaRichness(incoming.schemaDocument) > 0;

  if (!existingSchema && !incomingSchema) return merged;

  merged.projectKind = "schema";

  const exDoc = existing.schemaDocument;
  const inDoc = incoming.schemaDocument;
  const exScore = schemaRichness(exDoc);
  const inScore = schemaRichness(inDoc);
  const incomingNewer = updatedAtMs(incoming.updatedAt) >= updatedAtMs(existing.updatedAt);

  if (inDoc && (inScore > exScore || (inScore === exScore && incomingNewer))) {
    merged.schemaDocument = inDoc;
  } else if (exDoc) {
    merged.schemaDocument = exDoc;
  } else {
    merged.schemaDocument = inDoc ?? null;
  }

  return merged;
}
