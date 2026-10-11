"use client";

import { Suspense } from "react";
import { KostenvoranschlaegePage } from "@/components/kostenvoranschlaege/KostenvoranschlaegePage";

export default function Page() {
  return (
    <Suspense fallback={<p>Laden…</p>}>
      <KostenvoranschlaegePage />
    </Suspense>
  );
}
