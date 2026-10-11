"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { SchemaEditorPage } from "@/components/verwaltung/SchemaEditorPage";

function SchemaEditorRoute() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  return <SchemaEditorPage projectId={id} />;
}

export default function Page() {
  return (
    <Suspense fallback={<main className="page-shell schema-page"><p>Lade …</p></main>}>
      <SchemaEditorRoute />
    </Suspense>
  );
}
