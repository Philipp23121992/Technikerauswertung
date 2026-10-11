"use client";

import { Suspense } from "react";
import { GarantiefaellePage } from "@/components/garantiefaelle/GarantiefaellePage";

export default function Page() {
  return (
    <Suspense fallback={<p>Laden…</p>}>
      <GarantiefaellePage />
    </Suspense>
  );
}
