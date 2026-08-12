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
  const mustAuth = requiresAuth(pathname);

  useEffect(() => {
    if (!ready) return;

    // Gäste landen standardmäßig im öffentlichen Finder, nicht auf Login
    if (!user && (pathname === "/" || pathname === "")) {
      router.replace("/finder");
      return;
    }

    if (user && isLogin) {
      router.replace(homeHref === "/login" ? "/finder" : homeHref);
      return;
    }

    if (!user && !isLogin && mustAuth) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }

    if (user && !isLogin) {
      const app = pathToAppId(pathname);
      if (app && !isPublicApp(app) && !hasApp(app)) {
        router.replace(homeHref === "/login" ? "/finder" : homeHref);
      }
    }
  }, [ready, user, isLogin, mustAuth, pathname, hasApp, homeHref, router]);

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

  // Während Redirect von / → /finder kurz nichts erzwingen
  if (!user && (pathname === "/" || pathname === "")) {
    return (
      <div className="login-page">
        <div className="login-card">
          <p>Techniker Finder wird geladen…</p>
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
