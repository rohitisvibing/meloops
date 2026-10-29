"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaProvider } from "@/lib/media/types";
import { isSpotifyPreview } from "@/lib/providers/rules";
import { SpotifyEmbedPlayer } from "@/lib/providers/spotify-embed";
import type { SpotifySdkPlayer } from "@/lib/providers/spotify-sdk";
import type { PlaybackState, PlayerIssue, SegmentRef } from "@/lib/providers/types";
import { isAbortError, YouTubeEmbedPlayer } from "@/lib/providers/youtube-embed";
import { usePlayer } from "./player-context";
import { useEmbedHost } from "./use-embed-host";

export type TrimKind = "youtube" | "spotify-embed" | "spotify-sdk";
export type Range = { startMs: number; endMs: number };

/** What the trim editor needs from any player. */
type TrimAdapter = {
  playSegment(segment: SegmentRef & { trackMs?: number | null }): Promise<void>;
  pause(): Promise<void>;
  seekPreview(positionMs: number, final?: boolean): void;
  updateEnd(endMs: number): void;
  clearSegment(): void;
  onState(listener: (state: PlaybackState | null) => void): () => void;
  onSegmentEnd(listener: (segment: SegmentRef) => void): () => void;
  onIssue?: (listener: (issue: PlayerIssue) => void) => () => void;
  cue?: (mediaId: string, startMs: number) => void;
};

/**
 * The trim editor's player: plays the moment being edited and follows the tape.
 * YouTube and logged-out Spotify get their own embed in the editor; a connected Premium
 * account uses the Spotify SDK device. Starting playback stops the dock, so only one
 * player is ever playing.
 */
export function useTrimPlayer({
  provider,
  mediaId,
  initialStartMs,
  trackMs,
}: {
  provider: MediaProvider;
  mediaId: string;
  initialStartMs: number;
  trackMs: number | null;
}) {
  const dock = usePlayer();
  const { wrapRef } = useEmbedHost();
  // Decided once per editor: switching players mid-edit would lose the position.
  const [kind] = useState<TrimKind>(() =>
    provider === "youtube" ? "youtube" : dock.sdkPlayer ? "spotify-sdk" : "spotify-embed",
  );
  const [adapter, setAdapter] = useState<TrimAdapter | null>(null);
  const [state, setState] = useState<PlaybackState | null>(null);
  const [issue, setIssue] = useState<PlayerIssue | null>(null);
  const [attempt, setAttempt] = useState(0);
  const range = useRef<Range | null>(null);
  const loop = useRef(true);
  const dockRef = useRef(dock);
  dockRef.current = dock;
  const firstStart = useRef(initialStartMs);
  const trackMsRef = useRef(trackMs);
  trackMsRef.current = trackMs;

  // Create (or borrow) the player. Each run gets its own embed, so React's double effect
  // runs in development can't leave the editor with a player that never loads.
  useEffect(() => {
    let live = true;
    let owned: { disconnect(): void } | null = null;
    setIssue(null);

    const attach = (a: TrimAdapter) => {
      const offs = [
        a.onState((s) => live && setState(s)),
        a.onSegmentEnd(() => {
          const r = range.current;
          if (!live || !r) return;
          if (loop.current) void a.playSegment({ segmentId: "trim", provider, mediaId, ...r, trackMs: trackMsRef.current });
        }),
        a.onIssue?.((i) => live && setIssue(i)) ?? (() => undefined),
      ];
      setAdapter(a);
      return () => offs.forEach((off) => off());
    };

    let detach: (() => void) | null = null;
    const abort = new AbortController();
    const fail = (err: Error) => live && !isAbortError(err) && setIssue({ kind: "error", message: err.message });

    if (kind === "spotify-sdk") {
      const sdk = dockRef.current.sdkPlayer as (SpotifySdkPlayer & TrimAdapter) | null;
      if (sdk) detach = attach(sdk);
      else fail(new Error("The Spotify player isn't connected."));
    } else {
      const wrapper = wrapRef.current;
      if (!wrapper) return;
      const create =
        kind === "youtube"
          ? YouTubeEmbedPlayer.create(wrapper, abort.signal)
          : SpotifyEmbedPlayer.create(wrapper, mediaId, abort.signal);
      create.then((p) => {
        if (!live) return p.disconnect();
        owned = p;
        const a = p as unknown as TrimAdapter;
        detach = attach(a);
        a.cue?.(mediaId, firstStart.current);
      }, fail);
    }

    return () => {
      live = false;
      abort.abort();
      detach?.();
      range.current = null;
      if (kind === "spotify-sdk") {
        const sdk = dockRef.current.sdkPlayer;
        sdk?.clearSegment();
        void sdk?.pause().catch(() => undefined);
      }
      owned?.disconnect();
      setAdapter(null);
      setState(null);
    };
  }, [kind, provider, mediaId, wrapRef, attempt]);

  /** Plays from `fromMs` to the end of `r`, then loops `r`. Call from a tap or release. */
  const play = useCallback(
    (fromMs: number, r: Range) => {
      if (!adapter) return;
      if (dockRef.current.session) dockRef.current.stop();
      setIssue(null);
      range.current = r;
      void adapter
        .playSegment({ segmentId: "trim", provider, mediaId, startMs: fromMs, endMs: r.endMs, trackMs: trackMsRef.current })
        .catch((err: Error) => setIssue({ kind: "error", message: err.message }));
    },
    [adapter, provider, mediaId],
  );

  const pause = useCallback(() => {
    range.current = null;
    adapter?.clearSegment();
    void adapter?.pause().catch(() => undefined);
  }, [adapter]);

  /** Scrub to `ms`. While playing, playback carries on from there. */
  const seek = useCallback((ms: number, final = false) => adapter?.seekPreview(ms, final), [adapter]);

  /** The end tab moved while playing. */
  const updateRange = useCallback(
    (r: Range) => {
      if (!range.current) return;
      range.current = r;
      adapter?.updateEnd(r.endMs);
    },
    [adapter],
  );

  const setLoop = useCallback((on: boolean) => {
    loop.current = on;
  }, []);

  const onTrack = state !== null && state.mediaId === mediaId;
  const playing = onTrack && !state.paused;
  const positionMs = onTrack ? state.positionMs : null;
  const reported = onTrack && state.durationMs > 0 ? state.durationMs : null;
  const previewOnly = issue?.kind === "preview_only";
  const durationMs =
    reported && !(kind === "spotify-embed" && isSpotifyPreview(reported, trackMs)) ? reported : null;

  return {
    kind,
    wrapRef,
    ready: adapter !== null,
    playing,
    positionMs,
    durationMs,
    issue,
    previewOnly,
    play,
    pause,
    seek,
    updateRange,
    setLoop,
    retry: () => setAttempt((n) => n + 1),
  };
}

export type TrimPlayer = ReturnType<typeof useTrimPlayer>;
