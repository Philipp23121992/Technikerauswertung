"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { isPublicApp, pathToAppId, requiresAuth } from "@/lib/auth/types";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { ready, user, hasApp, homeHref } = useAuth();
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const isLogin = pathname === "/login";
  const isOutlookConnect = pathname.startsWith("/mailverwaltung/verbinden");
  const mustAuth = requiresAuth(pathname);
  const fallbackHome = homeHref && homeHref !== "/login" ? homeHref : "/";

  useEffect(() => {
    if (!ready) return;
    if (pathname.startsWith("/api/") || isOutlookConnect) return;

    if (!user && (pathname === "/" || pathname === "")) {
      router.replace("/login");
      return;
    }

    if (user && isLogin) {
      router.replace(fallbackHome);
      return;
    }

    if (!user && !isLogin && mustAuth) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }

    if (user && !isLogin) {
      const app = pathToAppId(pathname);
      if (app && !isPublicApp(app) && !hasApp(app)) {
        router.replace(fallbackHome);
      }
    }
  }, [ready, user, isLogin, isOutlookConnect, mustAuth, pathname, hasApp, fallbackHome, router]);

  if (isOutlookConnect) {
    return <>{children}</>;
  }

  if (!ready) {
    return (
      <div className="login-page">
        <div className="login-card">
          <p>Laden…</p>
        </div>
      </div>
    );
  }

  if (isLogin) {
    if (user) return null;
    return <>{children}</>;
  }

  if (!user && (pathname === "/" || pathname === "")) {
    return (
      <div className="login-page">
        <div className="login-card">
          <p>Weiterleitung zur Anmeldung…</p>
        </div>
      </div>
    );
  }

  if (!user && mustAuth) return null;

  if (user) {
    const app = pathToAppId(pathname);
    if (app && !isPublicApp(app) && !hasApp(app)) return null;
  }

  return <>{children}</>;
}
