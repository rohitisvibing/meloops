"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { SunsetBands } from "@/components/sunset";
import { usePlayer } from "@/lib/client/player-context";
import { hideSpotifyPrompt, isSpotifyPromptHidden, safeNext } from "@/lib/client/spotify-prompt";

/**
 * One-time step after Google sign-in: offer Spotify for full-song playback.
 * Skipped automatically when Spotify isn't set up, is already connected, or was skipped before.
 */
function WelcomeView() {
  const params = useSearchParams();
  const router = useRouter();
  const { connection } = usePlayer();
  const next = safeNext(params.get("next"));
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!connection) return;
    if (!connection.configured || connection.connected || isSpotifyPromptHidden("step")) router.replace(next);
    else setShow(true);
  }, [connection, next, router]);

  if (!show) return <p className="page-head muted">Signing you in…</p>;

  const skip = () => {
    hideSpotifyPrompt("step");
    router.replace(next);
  };

  return (
    <div className="welcome">
      <SunsetBands variant="strip" />
      <div className="welcome-panel">
        <h1 className="display welcome-title">Play full songs from Spotify</h1>
        <p>
          Connect a Spotify Premium account to hear whole Spotify songs inside Meloops. YouTube songs play without it.
        </p>
        <ul className="welcome-points">
          <li>Premium plays the full song, from your start time to your end time.</li>
          <li>Free accounts still work, with previews and Open in Spotify.</li>
          <li>Disconnect any time in Profile. Your playlists stay.</li>
        </ul>
        <a
          className="btn btn-primary btn-block"
          href={`/api/spotify/connect?${new URLSearchParams({ next })}`}
          onClick={() => hideSpotifyPrompt("step")}
        >
          Connect Spotify
        </a>
        <button type="button" className="btn btn-ghost btn-block" onClick={skip}>
          Skip for now
        </button>
      </div>
    </div>
  );
}

export default function WelcomePage() {
  return (
    <Suspense>
      <WelcomeView />
    </Suspense>
  );
}
