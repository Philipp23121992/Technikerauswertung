"use client";

import { SlaChrome } from "@/sla/components/SlaChrome";
import { CustomersPage } from "@/sla/pages/CustomersPage";

export default function Page() {
  return (
    <SlaChrome>
      <CustomersPage />
    </SlaChrome>
  );
}
