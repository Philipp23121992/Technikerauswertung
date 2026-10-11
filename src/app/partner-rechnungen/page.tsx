"use client";

import { Suspense } from "react";
import { PartnerRechnungenPage } from "@/components/partner-rechnungen/PartnerRechnungenPage";

export default function Page() {
  return (
    <Suspense fallback={<p>Laden…</p>}>
      <PartnerRechnungenPage />
    </Suspense>
  );
}
