import type { MediaRef } from "./types";

/** Link that opens the song on its own service. `startMs` is honoured by YouTube only. */
export function mediaUrl(ref: MediaRef, startMs?: number): string {
  if (ref.provider === "youtube") {
    const t = startMs ? `&t=${Math.floor(startMs / 1000)}s` : "";
    return `https://www.youtube.com/watch?v=${ref.mediaId}${t}`;
  }
  return `https://open.spotify.com/track/${ref.mediaId}`;
}

export function openLabel(ref: Pick<MediaRef, "provider">): string {
  return ref.provider === "youtube" ? "Open on YouTube" : "Open in Spotify";
}
