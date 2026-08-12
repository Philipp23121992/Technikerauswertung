"use client";

import { SlaChrome } from "@/sla/components/SlaChrome";
import { DashboardPage } from "@/sla/pages/DashboardPage";

export default function SlaHomePage() {
  return (
    <SlaChrome>
      <DashboardPage />
    </SlaChrome>
  );
}
