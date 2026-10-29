"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
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
    <main className="app-frame" style={{ display: "grid", alignContent: "center", gap: 24, paddingBottom: 48 }}>
      <div className="deck" style={{ paddingTop: 32, paddingBottom: 28 }}>
        <h1 className="display" style={{ fontSize: "var(--t-3xl)" }}>
          Meloops
        </h1>
        <p style={{ marginTop: 10, fontSize: "var(--t-lg)" }}>Playlists of the best bits of songs.</p>
        <div className="lcd" style={{ marginTop: 20 }}>
          <span className="lcd-text" style={{ fontSize: "var(--t-xl)" }}>
            00:42 ▸ 01:18
          </span>
        </div>
      </div>

      {isDemoMode ? (
        <Link className="btn btn-primary btn-block" href="/">
          Continue in demo mode
        </Link>
      ) : (
        <button className="btn btn-primary btn-block" onClick={signIn} disabled={busy}>
          {busy ? "Opening Google…" : "Continue with Google"}
        </button>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <p className="muted" style={{ fontSize: "var(--t-sm)" }}>
        Google sign-in keeps your playlists. Spotify is only needed later, if you want to play moments here.
      </p>
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
