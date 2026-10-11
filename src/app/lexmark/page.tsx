import { Suspense } from "react";
import { LexmarkPage } from "@/components/lexmark/LexmarkPage";

export default function Page() {
  return (
    <Suspense fallback={<div className="page-panel">Laden…</div>}>
      <LexmarkPage />
    </Suspense>
  );
}
