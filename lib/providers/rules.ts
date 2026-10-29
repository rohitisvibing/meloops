export type RepeatMode = "off" | "all" | "one";

export const REPEAT_ORDER: readonly RepeatMode[] = ["off", "all", "one"];

/**
 * Which moment plays after the one at `index` ends, or null to stop.
 * Auto-play applies to every provider. For Spotify this accepts the Developer Policy III.7
 * ("segue") risk for the private prototype; see docs/spotify-feasibility.md.
 */
export function nextIndex(index: number, length: number, repeat: RepeatMode): number | null {
  if (length <= 0) return null;
  if (repeat === "one") return index;
  if (index + 1 < length) return index + 1;
  return repeat === "all" ? 0 : null;
}

/** YouTube player states, from the IFrame API reference. */
export const YT_STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;

/** How close to the end a stop has to be to count as the moment finishing. */
export const END_TOLERANCE_MS = 1000;

/**
 * Whether the player has reached the end of a moment. YouTube can report PAUSED rather
 * than ENDED when it stops itself at endSeconds, so a pause within a second of the end
 * counts too; a manual pause earlier in the moment doesn't.
 */
export function reachedSegmentEnd(playerState: number, positionMs: number, endMs: number): boolean {
  if (playerState === YT_STATE.ENDED) return true;
  if (playerState === YT_STATE.PAUSED || playerState === YT_STATE.PLAYING) {
    return positionMs >= endMs - END_TOLERANCE_MS;
  }
  return false;
}

/** Spotify's embed falls back to ~30 s previews (reported on mobile and when logged out). */
export const SPOTIFY_PREVIEW_MAX_MS = 31_000;

/**
 * The embed reports a preview's own length as `duration`. Previews are a clip from
 * somewhere in the song, so positions in them don't match the song's timestamps:
 * treat any preview-length stream as a preview unless the song really is that short.
 */
export function isSpotifyPreview(reportedDurationMs: number, knownTrackMs: number | null): boolean {
  if (reportedDurationMs <= 0 || reportedDurationMs > SPOTIFY_PREVIEW_MAX_MS) return false;
  return knownTrackMs === null || knownTrackMs > SPOTIFY_PREVIEW_MAX_MS + 5_000;
}

/**
 * Where Play starts in the trim editor: at the playhead if it's inside the moment
 * (so you hear exactly where you are), otherwise at the moment's start.
 */
export function playFromPosition(playheadMs: number | null, startMs: number, endMs: number): number {
  if (playheadMs === null || playheadMs < startMs || playheadMs >= endMs - 250) return startMs;
  return playheadMs;
}
