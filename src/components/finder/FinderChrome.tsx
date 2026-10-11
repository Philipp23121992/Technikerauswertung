"use client";

import { useAuth } from "@/components/AuthProvider";
import { EditLockBanner } from "@/components/EditAccessControls";

export function FinderChrome({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  return (
    <div className="finder-module">
      {user ? <EditLockBanner /> : null}
      {children}
    </div>
  );
}
