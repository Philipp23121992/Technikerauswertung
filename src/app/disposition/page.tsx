import type { Metadata } from "next";
import { Suspense } from "react";
import { DispositionPage } from "@/components/disposition/DispositionPage";

export const metadata: Metadata = {
  title: "Disposition · APM Servicetools",
};

export default function Page() {
  return (
    <Suspense fallback={<p>Laden…</p>}>
      <DispositionPage />
    </Suspense>
  );
}
