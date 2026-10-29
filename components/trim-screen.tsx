"use client";

import type { TrimPlayer } from "@/lib/client/use-trim-player";
import { mediaUrl, openLabel } from "@/lib/media/links";
import type { MediaProvider } from "@/lib/media/types";
import { Artwork } from "./artwork";

const ISSUE_TEXT = {
  autoplay_blocked: "Tap play in the player once to allow sound.",
  not_embeddable: "YouTube won't play this video here.",
  not_found: "This song can't be found.",
  preview_only: "Spotify only sent a 30-second preview, so the tape can't follow the song.",
} as const;

/**
 * The trim editor's player: the YouTube video, the Spotify widget, or, for Premium
 * playback through the SDK (which has no visible player), the song's artwork and details.
 * Nothing is drawn over a video; messages sit below it.
 */
export function TrimScreen({
  trim,
  provider,
  mediaId,
  title,
  artist,
}: {
  trim: TrimPlayer;
  provider: MediaProvider;
  mediaId: string;
  title: string;
  artist: string;
}) {
  const { issue, kind } = trim;
  const ref = { provider, mediaId };
  const hard = issue && issue.kind !== "autoplay_blocked";

  return (
    <div className="trim-screen" data-kind={kind}>
      {kind === "spotify-sdk" ? (
        <div className="trim-card">
          <Artwork provider={provider} mediaId={mediaId} title={title} size={72} />
          <div style={{ minWidth: 0 }}>
            <div className="row-title">{title}</div>
            {artist && <div className="row-sub">{artist}</div>}
            <a className="trim-credit" href={mediaUrl(ref)} target="_blank" rel="noopener">
              Playing on Spotify
            </a>
          </div>
        </div>
      ) : (
        <div className={kind === "youtube" ? "monitor-screen" : "trim-widget"}>
          <div ref={trim.wrapRef} className={kind === "youtube" ? "monitor-embed" : "trim-widget-embed"} />
          {!trim.ready && !issue && <p className="trim-loading">Loading {provider === "youtube" ? "video" : "player"}…</p>}
        </div>
      )}

      {issue && (
        <p className={hard ? "field-error" : "muted"} role="status" style={{ fontSize: "var(--t-sm)" }}>
          {issue.kind === "error" ? issue.message : ISSUE_TEXT[issue.kind]}
          {hard && (
            <>
              {" "}
              {issue.kind === "error" && (
                <button type="button" className="link-btn" onClick={trim.retry}>
                  Try again
                </button>
              )}{" "}
              <a href={mediaUrl(ref)} target="_blank" rel="noopener">
                {openLabel(ref)}
              </a>
            </>
          )}
        </p>
      )}
    </div>
  );
}
