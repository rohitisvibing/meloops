"use client";

import { useEffect, useState } from "react";
import { usePlayer } from "@/lib/client/player-context";
import { hideSpotifyPrompt, isSpotifyPromptHidden } from "@/lib/client/spotify-prompt";
import { CloseIcon } from "./icons";
import { SunsetBands } from "./sunset";

/** Home reminder until Spotify is connected; can be dismissed on this device. */
export function SpotifyCard() {
  const { connection } = usePlayer();
  const [hidden, setHidden] = useState(true);

  useEffect(() => setHidden(isSpotifyPromptHidden("card")), []);

  if (hidden || !connection?.configured || connection.connected) return null;

  return (
    <section className="spotify-card" aria-label="Connect Spotify">
      <SunsetBands variant="edge" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2 className="row-title" style={{ whiteSpace: "normal" }}>
          Connect Spotify for full songs
        </h2>
        <p className="row-sub" style={{ whiteSpace: "normal" }}>
          With Premium, Spotify moments play in full here.
        </p>
        <a className="btn btn-primary btn-sm" href="/api/spotify/connect?next=/" style={{ marginTop: 10 }}>
          Connect Spotify
        </a>
      </div>
      <button
        type="button"
        className="icon-btn"
        aria-label="Hide this"
        onClick={() => {
          hideSpotifyPrompt("card");
          setHidden(true);
        }}
      >
        <CloseIcon size={20} />
      </button>
    </section>
  );
}
