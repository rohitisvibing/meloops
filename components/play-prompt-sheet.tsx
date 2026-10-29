"use client";

import { usePathname } from "next/navigation";
import { usePlayer } from "@/lib/client/player-context";
import { mediaUrl, openLabel } from "@/lib/media/links";
import { formatTimecode } from "@/lib/time";
import { ExternalIcon } from "./icons";
import { Sheet } from "./sheet";

const TITLES = {
  not_embeddable: "YouTube won't play this video here",
  not_found: "Song not found",
  preview_only: "Spotify sent a preview",
  error: "Couldn't play this moment",
} as const;

/** Shown only when a moment genuinely can't play here; offers the honest fallback. */
export function PlayPromptSheet() {
  const { prompt, dismissPrompt, connection } = usePlayer();
  const path = usePathname();
  if (!prompt) return null;
  const { item, reason } = prompt;
  const canConnect = item.provider === "spotify" && connection?.configured && !connection.connected;

  return (
    <Sheet open onClose={dismissPrompt} title={TITLES[reason]}>
      <div style={{ display: "grid", gap: 16 }}>
        {reason === "not_embeddable" && (
          <p>
            YouTube blocked playback inside Meloops. Usually the uploader doesn&apos;t allow other sites to play the
            video; it can also be a region or age restriction. Open it on YouTube, or add a different upload of the song.
          </p>
        )}
        {reason === "not_found" && <p>The song may have been removed. Check the link, or open it to see what happened.</p>}
        {reason === "preview_only" && (
          <p>
            Spotify only gave Meloops a 30-second preview, which doesn&apos;t include this moment.
            {canConnect
              ? " Connect a Spotify Premium account to play full songs here, or open it in Spotify."
              : " Open it in Spotify and skip to the start time, or add the same song from YouTube."}
          </p>
        )}
        {reason === "error" && <p>{prompt.message}</p>}

        <div className="lcd">
          <div className="label" style={{ fontSize: "var(--t-sm)", opacity: 0.8 }}>
            {item.title}
          </div>
          <div className="lcd-text" style={{ fontSize: "var(--t-2xl)" }}>
            {formatTimecode(item.startMs)} ▸ {formatTimecode(item.endMs)}
          </div>
        </div>

        {canConnect && reason === "preview_only" && (
          <a className="btn btn-primary btn-block" href={`/api/spotify/connect?next=${encodeURIComponent(path)}`}>
            Connect Spotify
          </a>
        )}
        <a
          className={`btn btn-block ${canConnect && reason === "preview_only" ? "btn-ghost" : "btn-primary"}`}
          href={mediaUrl(item, item.startMs)}
          target="_blank"
          rel="noopener"
        >
          {openLabel(item)} <ExternalIcon size={18} />
        </a>
        <button className="btn btn-ghost btn-block" onClick={dismissPrompt}>
          Not now
        </button>
      </div>
    </Sheet>
  );
}
