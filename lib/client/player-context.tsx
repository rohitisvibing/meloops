"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import type { Segment, SharedSegment } from "@/lib/data/types";
import { nextIndex, REPEAT_ORDER, type RepeatMode } from "@/lib/providers/rules";
import { SpotifyEmbedPlayer } from "@/lib/providers/spotify-embed";
import { PlaybackError, SpotifySdkPlayer } from "@/lib/providers/spotify-sdk";
import {
  PLAYBACK_CAPABILITIES,
  type Capability,
  type PlaybackState,
  type PlayerIssue,
  type PlayerKind,
  type SegmentPlayer,
  type SegmentRef,
} from "@/lib/providers/types";
import { YouTubeEmbedPlayer } from "@/lib/providers/youtube-embed";

export type QueueItem = SegmentRef & { title: string; artist: string; durationMs?: number | null };

export function segmentToQueueItem(s: Segment): QueueItem {
  return {
    segmentId: s.id,
    provider: s.track.provider,
    mediaId: s.track.mediaId,
    startMs: s.startMs,
    endMs: s.endMs,
    title: s.track.title,
    artist: s.track.artist,
    durationMs: s.track.durationMs,
  };
}

export function sharedToQueueItem(s: SharedSegment, index: number): QueueItem {
  return { segmentId: `shared-${index}`, ...s };
}

export type Connection = {
  configured: boolean;
  connected: boolean;
  product: string | null;
  displayName: string | null;
};

/** Why a moment can't play in the app right now. Drives the explanation sheet. */
export type PlayPrompt = {
  reason: "not_embeddable" | "not_found" | "preview_only" | "error";
  message?: string;
  item: QueueItem;
};

type Session = { queue: QueueItem[]; index: number; ended: boolean; kind: PlayerKind };

type DockHosts = { youtube: HTMLElement | null; spotify: HTMLElement | null };

type PlayerContextValue = {
  capabilities: ReadonlySet<Capability>;
  connection: Connection | null;
  state: PlaybackState | null;
  session: Session | null;
  current: QueueItem | null;
  starting: boolean;
  /** A real condition the user must act on, e.g. "tap play in the video". */
  notice: string | null;
  /** The dock shows its embedded player. Required whenever an embed is playing. */
  expanded: boolean;
  prompt: PlayPrompt | null;
  play: (queue: QueueItem[], index?: number) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  /** Collapsing pauses: embedded players are never hidden while playing. */
  collapse: () => void;
  expand: () => void;
  stop: () => void;
  dismissPrompt: () => void;
  reloadConnection: () => Promise<void>;
  disconnect: () => Promise<void>;
  registerDockHosts: (hosts: DockHosts) => void;
  /** Length reported by the active player, when it plays the full song. */
  reportedDurationMs: number | null;
  repeat: RepeatMode;
  cycleRepeat: () => void;
  /** The Spotify Web Playback SDK device, when a Premium account is connected. */
  sdkPlayer: SpotifySdkPlayer | null;
};

const NO_CAPS: ReadonlySet<Capability> = new Set();
const ALL_CAPS: ReadonlySet<Capability> = new Set(PLAYBACK_CAPABILITIES);
const PlayerContext = createContext<PlayerContextValue | null>(null);

const REPEAT_KEY = "meloops.repeat";

/** Per-device preference; storage can be unavailable (private mode), so fall back to "off". */
function readRepeat(): RepeatMode {
  try {
    const value = window.localStorage.getItem(REPEAT_KEY);
    return value === "all" || value === "one" ? value : "off";
  } catch {
    return "off";
  }
}

type AnyPlayer = SegmentPlayer & {
  clearSegment(): void;
  onIssue?: (listener: (issue: PlayerIssue) => void) => () => void;
};

async function fetchToken(): Promise<string> {
  const res = await fetch("/api/spotify/token", { cache: "no-store" });
  if (!res.ok) throw new PlaybackError("auth", "Spotify sign-in expired. Connect Spotify again.");
  return ((await res.json()) as { accessToken: string }).accessToken;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [sdk, setSdk] = useState<SpotifySdkPlayer | null>(null);
  const [youtube, setYoutube] = useState<YouTubeEmbedPlayer | null>(null);
  const [spotifyEmbed, setSpotifyEmbed] = useState<SpotifyEmbedPlayer | null>(null);
  const [state, setState] = useState<PlaybackState | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [starting, setStarting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [prompt, setPrompt] = useState<PlayPrompt | null>(null);
  const [hosts, setHosts] = useState<DockHosts>({ youtube: null, spotify: null });
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const repeatRef = useRef<RepeatMode>("off");
  repeatRef.current = repeat;

  useEffect(() => setRepeat(readRepeat()), []);

  const cycleRepeat = useCallback(() => {
    setRepeat((current) => {
      const next = REPEAT_ORDER[(REPEAT_ORDER.indexOf(current) + 1) % REPEAT_ORDER.length];
      try {
        window.localStorage.setItem(REPEAT_KEY, next);
      } catch {
        // Not persisted; still applies for this visit.
      }
      return next;
    });
  }, []);
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;
  const spotifyEmbedLoading = useRef(false);

  const reloadConnection = useCallback(async () => {
    try {
      const res = await fetch("/api/spotify/connection", { cache: "no-store" });
      setConnection((await res.json()) as Connection);
    } catch {
      setConnection({ configured: false, connected: false, product: null, displayName: null });
    }
  }, []);

  useEffect(() => {
    void reloadConnection();
  }, [reloadConnection]);

  const registerDockHosts = useCallback((next: DockHosts) => setHosts(next), []);

  // The YouTube player is created empty as soon as the dock exists, so a tap can start
  // a video synchronously (mobile browsers only allow audio started from a gesture).
  useEffect(() => {
    if (!hosts.youtube) return;
    let live = true;
    let created: YouTubeEmbedPlayer | null = null;
    const abort = new AbortController();
    YouTubeEmbedPlayer.create(hosts.youtube, abort.signal).then(
      (p) => {
        if (!live) return p.disconnect();
        created = p;
        setYoutube(p);
      },
      () => undefined,
    );
    return () => {
      live = false;
      abort.abort();
      created?.disconnect();
      setYoutube(null);
    };
  }, [hosts.youtube]);

  // Premium users get the Web Playback SDK for Spotify moments.
  const canInitSdk = connection?.connected && connection.product === "premium";
  useEffect(() => {
    if (!canInitSdk) return;
    let live = true;
    let created: SpotifySdkPlayer | null = null;
    SpotifySdkPlayer.create(fetchToken).then(
      (p) => {
        if (!live) return p.disconnect();
        created = p;
        setSdk(p);
      },
      (err: PlaybackError) => {
        if (live && err.code === "not_premium") setConnection((c) => (c ? { ...c, product: "free" } : c));
      },
    );
    return () => {
      live = false;
      created?.disconnect();
      setSdk(null);
    };
  }, [canInitSdk]);

  const playerFor = useCallback(
    (kind: PlayerKind): AnyPlayer | null =>
      kind === "youtube-embed" ? youtube : kind === "spotify-sdk" ? sdk : spotifyEmbed,
    [youtube, sdk, spotifyEmbed],
  );

  const kindFor = useCallback(
    (item: QueueItem): PlayerKind => (item.provider === "youtube" ? "youtube-embed" : sdk ? "spotify-sdk" : "spotify-embed"),
    [sdk],
  );

  /** Pause every player except the one about to play. */
  const silenceOthers = useCallback(
    (keep: PlayerKind | null) => {
      for (const kind of ["youtube-embed", "spotify-embed", "spotify-sdk"] as const) {
        if (kind === keep) continue;
        const p = playerFor(kind);
        if (p) {
          p.clearSegment();
          void p.pause().catch(() => undefined);
        }
      }
    },
    [playerFor],
  );

  const fail = useCallback((item: QueueItem, issue: PlayerIssue) => {
    setStarting(false);
    if (issue.kind === "autoplay_blocked") {
      setNotice(item.provider === "youtube" ? "Tap play in the video to start." : "Tap play in the Spotify player to start.");
      return;
    }
    setSession(null);
    setNotice(null);
    setExpanded(false);
    setPrompt({ reason: issue.kind, message: issue.kind === "error" ? issue.message : undefined, item });
  }, []);

  const startItem = useCallback(
    (queue: QueueItem[], index: number) => {
      const item = queue[index];
      const kind = kindFor(item);
      silenceOthers(kind);
      setSession({ queue, index, ended: false, kind });
      setNotice(null);
      setPrompt(null);
      setState(null);
      // Show the embed before it starts: YouTube forbids starting playback in a hidden player.
      if (kind !== "spotify-sdk") flushSync(() => setExpanded(true));

      // Spotify's embed has to be created with a song, so it starts on its first use.
      if (kind === "spotify-embed" && !spotifyEmbed) {
        if (!hosts.spotify || spotifyEmbedLoading.current) return;
        spotifyEmbedLoading.current = true;
        setStarting(true);
        SpotifyEmbedPlayer.create(hosts.spotify, item.mediaId).then(
          (p) => {
            spotifyEmbedLoading.current = false;
            setSpotifyEmbed(p);
            void p.playSegment({ ...item, trackMs: item.durationMs });
          },
          (err: Error) => {
            spotifyEmbedLoading.current = false;
            fail(item, { kind: "error", message: err.message });
          },
        );
        return;
      }

      const player = playerFor(kind);
      if (!player) {
        fail(item, { kind: "error", message: "The player is still loading. Try again in a moment." });
        return;
      }
      setStarting(true);
      const run = kind === "spotify-embed" ? (player as SpotifyEmbedPlayer).playSegment({ ...item, trackMs: item.durationMs }) : player.playSegment(item);
      run.catch((err: PlaybackError | Error) => {
        if (err instanceof PlaybackError) {
          if (err.code === "not_premium") setConnection((c) => (c ? { ...c, product: "free" } : c));
          if (err.code === "auth") void reloadConnection();
        }
        fail(item, { kind: "error", message: err.message });
      });
    },
    [kindFor, silenceOthers, spotifyEmbed, hosts.spotify, playerFor, fail, reloadConnection],
  );

  // Wire state, end and issue events from whichever players exist.
  useEffect(() => {
    const offs: (() => void)[] = [];
    for (const kind of ["youtube-embed", "spotify-embed", "spotify-sdk"] as const) {
      const player = playerFor(kind);
      if (!player) continue;
      offs.push(
        player.onState((s) => {
          if (sessionRef.current?.kind !== kind) return;
          setState(s);
          if (s && !s.paused) {
            setStarting(false);
            setNotice(null);
          }
        }),
      );
      offs.push(
        player.onSegmentEnd(() => {
          const s = sessionRef.current;
          if (!s || s.kind !== kind) return;
          // Editor previews are one-off plays; repeat modes apply to playlists and moments.
          const isPreview = s.queue.length === 1 && s.queue[0].segmentId === "preview";
          const next = isPreview ? null : nextIndex(s.index, s.queue.length, repeatRef.current);
          if (next === null) setSession({ ...s, ended: true });
          else startItem(s.queue, next);
        }),
      );
      if (player.onIssue) {
        offs.push(
          player.onIssue((issue) => {
            const s = sessionRef.current;
            if (s && s.kind === kind) fail(s.queue[s.index], issue);
          }),
        );
      }
    }
    return () => offs.forEach((off) => off());
  }, [playerFor, startItem, fail]);

  const play = useCallback((queue: QueueItem[], index = 0) => queue[index] && startItem(queue, index), [startItem]);

  const toggle = useCallback(() => {
    if (!session) return;
    const player = playerFor(session.kind);
    const item = session.queue[session.index];
    if (!player || session.ended) return startItem(session.queue, session.index);
    if (session.kind !== "spotify-sdk") setExpanded(true);
    if (state && !state.paused) void player.pause();
    else if (state && state.mediaId === item.mediaId && state.positionMs < item.endMs) void player.resume();
    else startItem(session.queue, session.index);
  }, [session, state, playerFor, startItem]);

  const next = useCallback(() => {
    if (session && session.index + 1 < session.queue.length) startItem(session.queue, session.index + 1);
  }, [session, startItem]);

  const previous = useCallback(() => {
    if (session && session.index > 0) startItem(session.queue, session.index - 1);
  }, [session, startItem]);

  const collapse = useCallback(() => {
    if (session) void playerFor(session.kind)?.pause();
    setExpanded(false);
  }, [session, playerFor]);

  const stop = useCallback(() => {
    silenceOthers(null);
    setSession(null);
    setState(null);
    setNotice(null);
    setStarting(false);
    setExpanded(false);
  }, [silenceOthers]);

  const disconnect = useCallback(async () => {
    if (session?.kind === "spotify-sdk") stop();
    await fetch("/api/spotify/connection", { method: "DELETE" });
    await reloadConnection();
  }, [session, stop, reloadConnection]);

  const current = session ? session.queue[session.index] : null;
  const capabilities = session && playerFor(session.kind) ? ALL_CAPS : NO_CAPS;
  // Spotify's embed may report a preview's length, so only trust full-song players.
  const reportedDurationMs =
    session && session.kind !== "spotify-embed" && state && state.mediaId === current?.mediaId && state.durationMs > 0
      ? state.durationMs
      : null;

  const value = useMemo<PlayerContextValue>(
    () => ({
      capabilities,
      connection,
      state,
      session,
      current,
      starting,
      notice,
      expanded,
      prompt,
      play,
      toggle,
      next,
      previous,
      collapse,
      expand: () => setExpanded(true),
      stop,
      dismissPrompt: () => setPrompt(null),
      reloadConnection,
      disconnect,
      registerDockHosts,
      reportedDurationMs,
      repeat,
      cycleRepeat,
      sdkPlayer: sdk,
    }),
    [
      capabilities,
      connection,
      state,
      session,
      current,
      starting,
      notice,
      expanded,
      prompt,
      play,
      toggle,
      next,
      previous,
      collapse,
      stop,
      reloadConnection,
      disconnect,
      registerDockHosts,
      reportedDurationMs,
      repeat,
      cycleRepeat,
      sdk,
    ],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer outside PlayerProvider");
  return ctx;
}
