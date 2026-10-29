/**
 * YouTube IFrame Player adapter. The player is always shown in the dock while it plays
 * (YouTube Developer Policies III.I.7 and III.I.9 forbid hidden or audio-only playback).
 * Segments use loadVideoById's documented startSeconds/endSeconds, with a position poll
 * as backup because endSeconds stops applying after a seek.
 */
"use client";

import { mountPoint } from "@/lib/client/use-embed-host";
import { reachedSegmentEnd, YT_STATE as STATE } from "./rules";
import type { PlaybackState, PlayerIssue, SegmentPlayer, SegmentRef } from "./types";

type YTPlayer = {
  loadVideoById(options: { videoId: string; startSeconds?: number; endSeconds?: number }): void;
  cueVideoById(options: { videoId: string; startSeconds?: number }): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getVideoData(): { video_id?: string };
  destroy(): void;
};

type YTNamespace = {
  Player: new (
    host: HTMLElement,
    options: {
      width?: string;
      height?: string;
      playerVars?: Record<string, string | number>;
      events?: Record<string, (event: { data: number; target: YTPlayer }) => void>;
    },
  ) => YTPlayer;
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const API_URL = "https://www.youtube.com/iframe_api";
const POLL_MS = 250;
const LOAD_TIMEOUT_MS = 12_000;

export function abortError(): Error {
  return new DOMException("Cancelled", "AbortError");
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}
const END_EARLY_MS = 120;

let apiLoading: Promise<YTNamespace> | null = null;

export function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiLoading) return apiLoading;
  apiLoading = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT!);
    };
    const script = document.createElement("script");
    script.src = API_URL;
    script.async = true;
    script.onerror = () => {
      apiLoading = null;
      reject(new Error("Couldn't load the YouTube player. Check your connection."));
    };
    document.head.appendChild(script);
  });
  return apiLoading;
}

export class YouTubeEmbedPlayer implements SegmentPlayer {
  private stateListeners = new Set<(state: PlaybackState | null) => void>();
  private endListeners = new Set<(segment: SegmentRef) => void>();
  private issueListeners = new Set<(issue: PlayerIssue) => void>();
  private current: SegmentRef | null = null;
  private loadedId: string | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private yt!: YTPlayer;
  private mount: HTMLElement | null = null;

  private constructor() {}

  /**
   * Creates an empty player inside `wrapper`, on a fresh child element of its own.
   * Nothing loads or plays until playSegment or cue. Rejects if the player isn't ready in time.
   */
  static async create(wrapper: HTMLElement, signal?: AbortSignal): Promise<YouTubeEmbedPlayer> {
    const YT = await loadYouTubeApi();
    if (signal?.aborted) throw abortError();
    const adapter = new YouTubeEmbedPlayer();
    adapter.mount = mountPoint(wrapper);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        adapter.disconnect();
        reject(new Error("The video didn't load."));
      }, LOAD_TIMEOUT_MS);
      // A cancelled caller (e.g. an effect cleaned up) removes its player at once.
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        adapter.disconnect();
        reject(abortError());
      });
      const placeholder = adapter.mount!;
      adapter.yt = new YT.Player(placeholder, {
        width: "100%",
        height: "100%",
        playerVars: { playsinline: 1, rel: 0, controls: 1, origin: window.location.origin },
        events: {
          onReady: () => {
            clearTimeout(timer);
            resolve();
          },
          onStateChange: (e) => adapter.handleStateChange(e.data),
          onError: (e) => adapter.handleError(e.data),
          onAutoplayBlocked: () => adapter.emitIssue({ kind: "autoplay_blocked" }),
        },
      });
      // The API swaps the placeholder for its iframe; keep that node so disconnect removes it.
      adapter.mount = placeholder.isConnected ? placeholder : (wrapper.lastElementChild as HTMLElement | null);
    });
    return adapter;
  }

  private emitIssue(issue: PlayerIssue) {
    for (const listener of this.issueListeners) listener(issue);
  }

  private handleError(code: number) {
    this.current = null;
    this.stopPolling();
    if (code === 101 || code === 150) this.emitIssue({ kind: "not_embeddable" });
    else if (code === 100) this.emitIssue({ kind: "not_found" });
    else this.emitIssue({ kind: "error", message: "YouTube couldn't play this video." });
  }

  private readState(): PlaybackState {
    const playerState = this.yt.getPlayerState();
    return {
      mediaId: this.yt.getVideoData()?.video_id ?? this.loadedId,
      positionMs: Math.round(this.yt.getCurrentTime() * 1000),
      durationMs: Math.round(this.yt.getDuration() * 1000),
      paused: playerState !== STATE.PLAYING && playerState !== STATE.BUFFERING,
      readAt: performance.now(),
    };
  }

  private emitState() {
    const state = this.readState();
    for (const listener of this.stateListeners) listener(state);
    return state;
  }

  private finishSegment() {
    const segment = this.current;
    if (!segment) return;
    this.current = null;
    this.yt.pauseVideo();
    for (const listener of this.endListeners) listener(segment);
  }

  private handleStateChange(code: number) {
    const state = this.emitState();
    if (code === STATE.PLAYING || code === STATE.BUFFERING) this.startPolling();
    else this.stopPolling();
    const segment = this.current;
    // YouTube may report PAUSED instead of ENDED when it stops itself at endSeconds.
    if (
      segment &&
      (code === STATE.ENDED || code === STATE.PAUSED) &&
      state.mediaId === segment.mediaId &&
      reachedSegmentEnd(code, state.positionMs, segment.endMs)
    ) {
      this.finishSegment();
    }
  }

  private startPolling() {
    if (this.poll) return;
    this.poll = setInterval(() => {
      const state = this.emitState();
      const segment = this.current;
      if (segment && !state.paused && state.mediaId === segment.mediaId && state.positionMs >= segment.endMs - END_EARLY_MS) {
        this.finishSegment();
      }
    }, POLL_MS);
  }

  private stopPolling() {
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
  }

  /** Synchronous so it runs inside the tap that started it (mobile autoplay rules). */
  async playSegment(segment: SegmentRef) {
    this.current = segment;
    this.loadedId = segment.mediaId;
    this.yt.loadVideoById({
      videoId: segment.mediaId,
      startSeconds: segment.startMs / 1000,
      endSeconds: segment.endMs / 1000,
    });
  }

  /** Shows the frame at `startMs` without playing (used by the trim preview). */
  cue(mediaId: string, startMs: number) {
    this.current = null;
    this.loadedId = mediaId;
    this.yt.cueVideoById({ videoId: mediaId, startSeconds: startMs / 1000 });
  }

  /**
   * Moves to `positionMs` while scrubbing. `final` lets YouTube fetch ahead (use it when the
   * drag ends). The segment end still applies: the position poll stops playback there.
   */
  seekPreview(positionMs: number, final = false) {
    this.yt.seekTo(Math.max(0, positionMs) / 1000, final);
    this.emitState();
  }

  /** Moves the end of the segment that is playing (the end tab was dragged). */
  updateEnd(endMs: number) {
    if (this.current) this.current = { ...this.current, endMs };
  }

  async pause() {
    this.yt.pauseVideo();
  }

  async resume() {
    this.yt.playVideo();
  }

  async seek(positionMs: number) {
    this.yt.seekTo(positionMs / 1000, true);
  }

  clearSegment() {
    this.current = null;
  }

  durationMs(): number | null {
    const d = this.yt.getDuration();
    return d > 0 ? Math.round(d * 1000) : null;
  }

  onState(listener: (state: PlaybackState | null) => void) {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onSegmentEnd(listener: (segment: SegmentRef) => void) {
    this.endListeners.add(listener);
    return () => this.endListeners.delete(listener);
  }

  onIssue(listener: (issue: PlayerIssue) => void) {
    this.issueListeners.add(listener);
    return () => this.issueListeners.delete(listener);
  }

  disconnect() {
    this.stopPolling();
    this.current = null;
    try {
      this.yt?.destroy();
    } catch {
      // Already gone.
    }
    this.mount?.remove();
    this.mount = null;
  }
}
