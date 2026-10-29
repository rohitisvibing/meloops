/**
 * Spotify iFrame Embed adapter, used for Spotify moments when the Premium SDK isn't
 * connected. The widget is shown unaltered in the dock (Embed Terms IV.3).
 * Spotify may serve a ~30 s preview instead of the full track; when it does, the
 * moment usually can't be reached, so we stop and say so instead of playing the wrong audio.
 */
"use client";

import { mountPoint } from "@/lib/client/use-embed-host";
import { abortError } from "./youtube-embed";
import { isSpotifyPreview } from "./rules";
import type { PlaybackState, PlayerIssue, SegmentPlayer, SegmentRef } from "./types";

type Controller = {
  loadUri(uri: string, preferVideo?: boolean, startAt?: number): void;
  play(): void;
  pause(): void;
  resume(): void;
  seek(seconds: number): void;
  destroy(): void;
  addListener(event: string, cb: (e: { data: Record<string, unknown> }) => void): void;
};

type IFrameAPI = {
  createController(host: HTMLElement, options: { uri: string; width?: string; height?: number }, cb: (c: Controller) => void): void;
};

declare global {
  interface Window {
    onSpotifyIframeApiReady?: (api: IFrameAPI) => void;
  }
}

const API_URL = "https://open.spotify.com/embed/iframe-api/v1";
/** If nothing starts within this time, the browser most likely blocked autoplay. */
const START_TIMEOUT_MS = 2500;
const LOAD_TIMEOUT_MS = 12_000;

let apiLoading: Promise<IFrameAPI> | null = null;

function loadApi(): Promise<IFrameAPI> {
  if (apiLoading) return apiLoading;
  apiLoading = new Promise((resolve, reject) => {
    window.onSpotifyIframeApiReady = (api) => resolve(api);
    const script = document.createElement("script");
    script.src = API_URL;
    script.async = true;
    script.onerror = () => {
      apiLoading = null;
      reject(new Error("Couldn't load the Spotify player. Check your connection."));
    };
    document.head.appendChild(script);
  });
  return apiLoading;
}

export type SegmentWithLength = SegmentRef & { trackMs?: number | null };

export class SpotifyEmbedPlayer implements SegmentPlayer {
  private stateListeners = new Set<(state: PlaybackState | null) => void>();
  private endListeners = new Set<(segment: SegmentRef) => void>();
  private issueListeners = new Set<(issue: PlayerIssue) => void>();
  private current: SegmentWithLength | null = null;
  private seeked = false;
  private startTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor(private readonly controller: Controller) {
    controller.addListener("playback_started", () => this.handleStarted());
    controller.addListener("playback_update", (e) => this.handleUpdate(e.data));
  }

  private mount: HTMLElement | null = null;

  /** Creates the widget inside `wrapper` on its own child element, loaded with the first song. */
  static async create(wrapper: HTMLElement, firstMediaId: string, signal?: AbortSignal): Promise<SpotifyEmbedPlayer> {
    const api = await loadApi();
    if (signal?.aborted) throw abortError();
    const placeholder = mountPoint(wrapper);
    const controller = await new Promise<Controller>((resolve, reject) => {
      const timer = setTimeout(() => {
        placeholder.remove();
        reject(new Error("The Spotify player didn't load."));
      }, LOAD_TIMEOUT_MS);
      let cancelled = false;
      api.createController(placeholder, { uri: `spotify:track:${firstMediaId}`, width: "100%", height: 152 }, (c) => {
        clearTimeout(timer);
        if (cancelled) return c.destroy();
        resolve(c);
      });
      // The API swaps the placeholder for its iframe; a cancelled caller removes it at once.
      const node = placeholder.isConnected ? placeholder : wrapper.lastElementChild;
      signal?.addEventListener("abort", () => {
        cancelled = true;
        clearTimeout(timer);
        node?.remove();
        reject(abortError());
      });
    });
    const player = new SpotifyEmbedPlayer(controller);
    player.mount = placeholder.isConnected ? placeholder : (wrapper.lastElementChild as HTMLElement | null);
    return player;
  }

  private emitIssue(issue: PlayerIssue) {
    for (const listener of this.issueListeners) listener(issue);
  }

  private clearStartTimer() {
    if (this.startTimer) clearTimeout(this.startTimer);
    this.startTimer = null;
  }

  private handleStarted() {
    this.clearStartTimer();
    const segment = this.current;
    // startAt is reported to be ignored in some versions, so seek explicitly once.
    if (segment && !this.seeked) {
      this.seeked = true;
      this.controller.seek(Math.floor(segment.startMs / 1000));
    }
  }

  private handleUpdate(data: Record<string, unknown>) {
    const uri = String(data.playingURI ?? "");
    const state: PlaybackState = {
      mediaId: uri.startsWith("spotify:track:") ? uri.slice("spotify:track:".length) : null,
      positionMs: Number(data.position ?? 0),
      durationMs: Number(data.duration ?? 0),
      paused: Boolean(data.isPaused),
      readAt: performance.now(),
    };
    for (const listener of this.stateListeners) listener(state);

    const segment = this.current;
    if (!segment || state.mediaId !== segment.mediaId) return;
    if (isSpotifyPreview(state.durationMs, segment.trackMs ?? null)) {
      this.current = null;
      this.controller.pause();
      this.emitIssue({ kind: "preview_only" });
      return;
    }
    if (!state.paused && this.seeked && state.positionMs >= segment.endMs - 200) {
      this.current = null;
      this.controller.pause();
      for (const listener of this.endListeners) listener(segment);
    }
  }

  async playSegment(segment: SegmentWithLength) {
    this.current = segment;
    this.seeked = false;
    this.controller.loadUri(`spotify:track:${segment.mediaId}`, false, Math.floor(segment.startMs / 1000));
    this.controller.play();
    this.clearStartTimer();
    this.startTimer = setTimeout(() => this.emitIssue({ kind: "autoplay_blocked" }), START_TIMEOUT_MS);
  }

  async pause() {
    this.controller.pause();
  }

  async resume() {
    this.controller.resume();
  }

  async seek(positionMs: number) {
    this.controller.seek(Math.floor(positionMs / 1000));
  }

  clearSegment() {
    this.current = null;
    this.clearStartTimer();
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

  /** Moves the end of the segment that is playing (the end tab was dragged). */
  updateEnd(endMs: number) {
    if (this.current) this.current = { ...this.current, endMs };
  }

  /** Moves to `positionMs` (whole seconds: the embed's seek takes seconds). */
  seekPreview(positionMs: number) {
    this.controller.seek(Math.max(0, Math.floor(positionMs / 1000)));
  }

  disconnect() {
    this.clearStartTimer();
    this.current = null;
    try {
      this.controller.destroy();
    } catch {
      // Already gone.
    }
    this.mount?.remove();
    this.mount = null;
  }
}
