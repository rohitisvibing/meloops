"use client";

import { Suspense } from "react";
import { useToast } from "@/components/toast";
import { usePlayer } from "@/lib/client/player-context";
import { useRepo } from "@/lib/client/repo-context";
import { DEMO_STORAGE_KEY } from "@/lib/data/local-repo";
import { isDemoMode } from "@/lib/env";

function ProfileView() {
  const { user, signOut } = useRepo();
  const { connection, disconnect } = usePlayer();
  const toast = useToast();


  return (
    <>
      <header className="page-head">
        <h1 className="page-title display">Profile</h1>
      </header>

      <section className="section" style={{ marginTop: 0 }}>
        <h2 className="section-title display">Account</h2>
        {isDemoMode ? (
          <div className="empty">
            <p>
              <span className="demo-badge">Demo mode</span>
            </p>
            <p>
              Playlists are saved in this browser only. Set up Supabase and Google sign-in to keep them across devices.
            </p>
            <button
              className="btn btn-ghost"
              onClick={() => {
                try {
                  window.localStorage.removeItem(DEMO_STORAGE_KEY);
                } catch {}
                window.location.href = "/";
              }}
            >
              Reset demo data
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {user?.avatarUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt="" width={56} height={56} style={{ borderRadius: 14 }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row-title">{user?.name ?? "Signed in"}</div>
              <div className="row-sub">{user?.email}</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={signOut}>
              Sign out
            </button>
          </div>
        )}
      </section>

      <section className="section">
        <h2 className="section-title display">Spotify</h2>
        <div className="lcd" style={{ marginBottom: 14 }}>
          <div className="lcd-text" style={{ fontSize: "var(--t-lg)" }}>
            {!connection
              ? "Checking…"
              : !connection.configured
                ? "Not set up"
                : connection.connected
                  ? connection.product === "premium"
                    ? "Premium connected"
                    : "Connected, no Premium"
                  : "Not connected"}
          </div>
          {connection?.displayName && (
            <div className="label" style={{ fontSize: "var(--t-sm)", opacity: 0.8 }}>
              {connection.displayName}
            </div>
          )}
        </div>
        <p className="muted" style={{ marginBottom: 14 }}>
          Meloops only needs Spotify to play moments here. Saving songs and playlists works without it, and
          disconnecting never deletes your playlists.
          {connection?.connected && connection.product !== "premium" &&
            " Spotify allows in-app playback for Premium accounts only, so moments open in Spotify instead."}
        </p>
        {connection?.configured && !connection.connected && (
          <a className="btn btn-primary btn-block" href="/api/spotify/connect?next=/profile">
            Connect Spotify
          </a>
        )}
        {connection?.connected && (
          <button
            className="btn btn-ghost btn-block"
            onClick={async () => {
              await disconnect();
              toast("Spotify disconnected");
            }}
          >
            Disconnect Spotify
          </button>
        )}
      </section>

      <section className="section">
        <h2 className="section-title display">About</h2>
        <p className="muted">
          Meloops saves links and timestamps. Music plays through Spotify and stays on Spotify. Song details and artwork
          come from Spotify.
        </p>
      </section>
    </>
  );
}

export default function ProfilePage() {
  return (
    <Suspense>
      <ProfileView />
    </Suspense>
  );
}
