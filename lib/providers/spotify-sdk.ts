/**
 * Spotify Web Playback SDK adapter. Requires a connected Premium account.
 * Plays a track from `startMs` via the Web API and pauses it at `endMs`.
 * All state reported to the UI comes from the SDK; nothing is simulated.
 */
"use client";

import type { PlaybackState, SegmentPlayer, SegmentRef } from "./types";

type SdkState = {
  paused: boolean;
  position: number;
  duration: number;
  track_window: { current_track: { id: string | null; uri: string; linked_from?: { id: string | null } } | null };
};

type SdkPlayer = {
  connect(): Promise<boolean>;
  disconnect(): void;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(ms: number): Promise<void>;
  activateElement(): Promise<void>;
  getCurrentState(): Promise<SdkState | null>;
  addListener(event: string, cb: (payload: never) => void): boolean;
};

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: {
      Player: new (options: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume?: number;
      }) => SdkPlayer;
    };
  }
}

export class PlaybackError extends Error {
  constructor(
    readonly code: "not_premium" | "auth" | "account" | "init" | "device" | "network",
    message: string,
  ) {
    super(message);
  }
}

const SDK_URL = "https://sdk.scdn.co/spotify-player.js";
/** Pause slightly early: SDK position reports lag real audio by ~100 ms. */
const END_EARLY_MS = 150;
const POLL_MS = 100;

let sdkLoading: Promise<void> | null = null;

function loadSdk(): Promise<void> {
  if (window.Spotify) return Promise.resolve();
  if (sdkLoading) return sdkLoading;
  sdkLoading = new Promise((resolve, reject) => {
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.onerror = () => {
      sdkLoading = null;
      reject(new PlaybackError("network", "Couldn't load the Spotify player. Check your connection."));
    };
    document.head.appendChild(script);
  });
  return sdkLoading;
}

type TokenSource = () => Promise<string>;

export class SpotifySdkPlayer implements SegmentPlayer {
  private stateListeners = new Set<(state: PlaybackState | null) => void>();
  private endListeners = new Set<(segment: SegmentRef) => void>();
  private current: SegmentRef | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;

  private constructor(
    private readonly sdk: SdkPlayer,
    private readonly deviceId: string,
    private readonly getToken: TokenSource,
  ) {
    sdk.addListener("player_state_changed", ((state: SdkState | null) => this.handleState(state)) as never);
  }

  static async create(getToken: TokenSource): Promise<SpotifySdkPlayer> {
    await loadSdk();
    const Player = window.Spotify!.Player;
    const sdk = new Player({
      name: "Meloops",
      getOAuthToken: (cb) => {
        getToken().then(cb, () => cb(""));
      },
      volume: 0.8,
    });

    const deviceId = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new PlaybackError("init", "The Spotify player didn't start.")), 15_000);
      sdk.addListener("ready", (({ device_id }: { device_id: string }) => {
        clearTimeout(timer);
        resolve(device_id);
      }) as never);
      sdk.addListener("initialization_error", (() => {
        clearTimeout(timer);
        reject(new PlaybackError("init", "This browser can't run the Spotify player."));
      }) as never);
      sdk.addListener("authentication_error", (() => {
        clearTimeout(timer);
        reject(new PlaybackError("auth", "Spotify sign-in expired. Connect Spotify again."));
      }) as never);
      sdk.addListener("account_error", (() => {
        clearTimeout(timer);
        reject(new PlaybackError("not_premium", "Playing inside Meloops needs Spotify Premium."));
      }) as never);
      sdk.connect().then((ok) => {
        if (!ok) {
          clearTimeout(timer);
          reject(new PlaybackError("init", "The Spotify player didn't connect."));
        }
      });
    });

    return new SpotifySdkPlayer(sdk, deviceId, getToken);
  }

  private emit(state: PlaybackState | null) {
    for (const listener of this.stateListeners) listener(state);
  }

  private toState(state: SdkState): PlaybackState {
    const track = state.track_window.current_track;
    return {
      mediaId: track?.linked_from?.id ?? track?.id ?? null,
      positionMs: state.position,
      durationMs: state.duration,
      paused: state.paused,
      readAt: performance.now(),
    };
  }

  private handleState(raw: SdkState | null) {
    if (!raw) {
      this.stopPolling();
      this.emit(null);
      return;
    }
    const state = this.toState(raw);
    this.emit(state);
    this.checkEnd(state);
    if (state.paused) this.stopPolling();
    else this.startPolling();
  }

  private checkEnd(state: PlaybackState) {
    const segment = this.current;
    if (!segment || state.paused || state.mediaId !== segment.mediaId) return;
    if (state.positionMs >= segment.endMs - END_EARLY_MS) {
      this.current = null;
      void this.sdk.pause();
      for (const listener of this.endListeners) listener(segment);
    }
  }

  private startPolling() {
    if (this.poll) return;
    this.poll = setInterval(async () => {
      const raw = await this.sdk.getCurrentState();
      if (raw) {
        const state = this.toState(raw);
        this.emit(state);
        this.checkEnd(state);
      }
    }, POLL_MS);
  }

  private stopPolling() {
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
  }

  async playSegment(segment: SegmentRef) {
    // iOS Safari and other mobile browsers only allow audio after a user gesture.
    await this.sdk.activateElement();
    this.current = segment;
    const token = await this.getToken();
    const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(this.deviceId)}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ uris: [`spotify:track:${segment.mediaId}`], position_ms: segment.startMs }),
    });
    if (res.status === 403) {
      this.current = null;
      throw new PlaybackError("not_premium", "Playing inside Meloops needs Spotify Premium.");
    }
    if (res.status === 404) {
      this.current = null;
      throw new PlaybackError("device", "The Spotify player went offline. Try again.");
    }
    if (!res.ok) {
      this.current = null;
      throw new PlaybackError("network", "Spotify didn't start the song. Try again.");
    }
  }

  async pause() {
    await this.sdk.pause();
  }

  async resume() {
    await this.sdk.activateElement();
    await this.sdk.resume();
  }

  async seek(positionMs: number) {
    await this.sdk.seek(Math.max(0, Math.round(positionMs)));
  }

  /** Moves the end of the segment that is playing (the end tab was dragged). */
  updateEnd(endMs: number) {
    if (this.current) this.current = { ...this.current, endMs };
  }

  /** Moves the playback position while scrubbing. */
  seekPreview(positionMs: number) {
    void this.seek(positionMs);
  }

  /** Clears the active segment so a manual pause or seek doesn't trigger end handling. */
  clearSegment() {
    this.current = null;
  }

  onState(listener: (state: PlaybackState | null) => void) {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onSegmentEnd(listener: (segment: SegmentRef) => void) {
    this.endListeners.add(listener);
    return () => this.endListeners.delete(listener);
  }

  disconnect() {
    this.stopPolling();
    this.sdk.disconnect();
  }
}
