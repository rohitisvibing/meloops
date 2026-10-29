"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { SunsetBands } from "@/components/sunset";
import { isDemoMode } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

function LoginView() {
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error") ? "Sign-in didn't finish. Try again." : null);

  const signIn = async () => {
    setBusy(true);
    // Middleware shows this page in place of protected pages, so the current path is the target.
    const here = window.location.pathname === "/login" ? "/" : window.location.pathname + window.location.search;
    const next = params.get("next") ?? here;
    const { error: err } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <main className="signin">
      <SunsetBands variant="full" />
      <div className="signin-inner">
        <header className="signin-head">
          <h1 className="signin-mark display">Meloops</h1>
          <p className="signin-sub">The best bits of songs, on repeat.</p>
        </header>

        <section className="signin-panel" aria-label="Sign in">
          <div className="lcd signin-lcd" aria-hidden="true">
            <span className="lcd-text">00:42 ▸ 01:18</span>
          </div>
          {isDemoMode ? (
            <Link className="btn btn-peach btn-block" href="/">
              Continue in demo mode
            </Link>
          ) : (
            <button className="btn btn-peach btn-block" onClick={signIn} disabled={busy}>
              {busy ? "Opening Google…" : "Continue with Google"}
            </button>
          )}
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <p className="signin-note">Spotify Premium is optional. You can connect it next.</p>
        </section>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginView />
    </Suspense>
  );
}
