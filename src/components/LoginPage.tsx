"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

function LoginForm() {
  const { ready, user, login, homeHref } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const nextPath = searchParams.get("next");
  const afterLogin =
    nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")
      ? nextPath
      : homeHref === "/login"
        ? "/finder"
        : homeHref;

  useEffect(() => {
    if (ready && user) router.replace(afterLogin);
  }, [ready, user, afterLogin, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await login(username, password);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
  }

  if (!ready || user) {
    return (
      <div className="login-page">
        <div className="login-card">
          <p>Laden…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={onSubmit}>
        <div>
          <p className="login-kicker">APM Servicetools</p>
          <h1>Anmelden</h1>
          <p className="login-text">
            Techniker Finder ist ohne Login nutzbar. Für alle anderen Apps brauchst du
            ein Benutzerkonto.
          </p>
        </div>

        <label className="login-field">
          <span>Benutzername</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
          />
        </label>

        <label className="login-field">
          <span>Passwort</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {error ? <p className="login-error">{error}</p> : null}

        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Anmelden…" : "Anmelden"}
        </button>

        <Link href="/finder" className="login-public-link">
          Ohne Anmeldung zum Techniker Finder →
        </Link>
      </form>
    </div>
  );
}

export function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="login-page">
          <div className="login-card">
            <p>Laden…</p>
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
