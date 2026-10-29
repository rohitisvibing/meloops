import type { MediaProvider } from "@/lib/media/types";

/**
 * Music provider capability model. UI code checks capabilities, never provider ids,
 * so a feature only appears when the active provider has verified support for it.
 */

export type Capability =
  | "metadata"
  | "playerInit"
  | "playPause"
  | "seek"
  | "stateUpdates"
  | "segmentEnd"
  | "queue";

export type PlayerKind = "youtube-embed" | "spotify-embed" | "spotify-sdk";

export type TrackMeta = {
  provider: MediaProvider;
  mediaId: string;
  title: string;
  artists: string[];
  durationMs: number | null;
  artworkUrl: string | null;
  source: "youtube" | "spotify" | "manual";
};

/** Real playback state reported by the provider. Never synthesized by the UI. */
export type PlaybackState = {
  mediaId: string | null;
  positionMs: number;
  durationMs: number;
  paused: boolean;
  /** Timestamp (performance.now) when this state was read, for interpolation between reports. */
  readAt: number;
};

export type SegmentRef = {
  segmentId: string;
  provider: MediaProvider;
  mediaId: string;
  startMs: number;
  endMs: number;
};

export interface SegmentPlayer {
  playSegment(segment: SegmentRef): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  onState(listener: (state: PlaybackState | null) => void): () => void;
  onSegmentEnd(listener: (segment: SegmentRef) => void): () => void;
  disconnect(): void;
}

export const PLAYBACK_CAPABILITIES: readonly Capability[] = [
  "playerInit",
  "playPause",
  "seek",
  "stateUpdates",
  "segmentEnd",
];

export function canPlaySegments(caps: ReadonlySet<Capability>): boolean {
  return PLAYBACK_CAPABILITIES.every((cap) => caps.has(cap));
}

/**
 * The UI may show "playing" only if the provider reports state updates and the
 * reported state is unpaused on the expected track, inside the segment bounds.
 */
export function isSegmentActuallyPlaying(
  caps: ReadonlySet<Capability>,
  state: PlaybackState | null,
  segment: SegmentRef | null,
): boolean {
  if (!caps.has("stateUpdates") || !state || !segment) return false;
  if (state.paused || state.mediaId !== segment.mediaId) return false;
  return state.positionMs >= segment.startMs - 1000 && state.positionMs <= segment.endMs + 500;
}

/** Something that stops playback which the user needs to know about. */
export type PlayerIssue =
  | { kind: "autoplay_blocked" }
  | { kind: "not_embeddable" }
  | { kind: "not_found" }
  | { kind: "preview_only" }
  | { kind: "error"; message: string };
