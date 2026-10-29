"use client";

import { useEffect, useRef } from "react";
import { usePlayer } from "@/lib/client/player-context";
import { useEmbedHost } from "@/lib/client/use-embed-host";
import { useTrackMeta } from "@/lib/client/use-track-meta";
import { mediaUrl, openLabel } from "@/lib/media/links";
import { isSegmentActuallyPlaying } from "@/lib/providers/types";
import { formatTimecode } from "@/lib/time";
import { Artwork } from "./artwork";
import { CloseIcon, NextIcon, PauseIcon, PlayIcon, RepeatIcon, RepeatOneIcon } from "./icons";

const REPEAT_LABEL = { off: "Repeat: off", all: "Repeat: all", one: "Repeat: this moment" } as const;

/**
 * The deck that holds the embedded players. While a YouTube or Spotify embed plays,
 * it is expanded and the player is fully visible with nothing on top of it
 * (YouTube Required Minimum Functionality; Spotify Embed Terms IV.3).
 * Collapsing pauses playback.
 */
export function PlayerDock() {
  const player = usePlayer();
  const { session, current, state, capabilities, starting, notice, expanded, registerDockHosts } = player;
  const yt = useEmbedHost();
  const sp = useEmbedHost();
  const rootRef = useRef<HTMLDivElement>(null);
  const meta = useTrackMeta(current?.provider, current?.mediaId);

  useEffect(() => {
    registerDockHosts({ youtube: yt.wrapRef.current, spotify: sp.wrapRef.current });
  }, [registerDockHosts, yt.wrapRef, sp.wrapRef]);

  // Publish the dock's height so pages and sheets can keep their content clear of it.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => root.style.setProperty("--dock-h", `${el.offsetHeight}px`));
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.setProperty("--dock-h", "0px");
    };
  }, []);

  const active = Boolean(session && current);
  const kind = session?.kind;
  const showYouTube = active && expanded && kind === "youtube-embed";
  const showSpotify = active && expanded && kind === "spotify-embed";

  let status = "";
  let progress = 0;
  let playing = false;
  if (session && current) {
    playing = isSegmentActuallyPlaying(capabilities, state, current);
    const onTrack = state?.mediaId === current.mediaId;
    const position = onTrack ? Math.min(Math.max(state!.positionMs, current.startMs), current.endMs) : current.startMs;
    progress = (position - current.startMs) / (current.endMs - current.startMs);
    const hasNext = session.index + 1 < session.queue.length;
    status = `${formatTimecode(position)} / ${formatTimecode(current.endMs)}`;
    if (notice) status = notice;
    else if (starting) status = "Starting…";
    else if (session.ended) status = hasNext ? "Moment done. Play next?" : "End of playlist";
    else if (!playing && onTrack) status = `Paused at ${formatTimecode(position)}`;
    else if (!playing) status = `Ready at ${formatTimecode(current.startMs)}`;
  }

  const title = current ? (current.title || meta?.title) ?? "" : "";
  const hasNext = session ? session.index + 1 < session.queue.length : false;
  const hasPrev = session ? session.index > 0 : false;

  return (
    <div
      ref={rootRef}
      className="dock"
      data-active={active}
      data-expanded={expanded}
      data-playing={playing}
      role="region"
      aria-label="Player"
    >
      <div className="dock-shell">
        <div className="dock-screen dock-screen-video" hidden={!showYouTube}>
          <div ref={yt.wrapRef} className="dock-embed" />
        </div>
        <div className="dock-screen dock-screen-spotify" hidden={!showSpotify}>
          <div ref={sp.wrapRef} className="dock-embed-spotify" />
        </div>

        {current && session && (
          <div className="dock-bar">
            {!expanded && current && <Artwork provider={current.provider} mediaId={current.mediaId} title={title} size={44} />}
            <div className="dock-info">
              <div className="row-title">{title}</div>
              <div className="lcd-text dock-status" aria-live="polite">
                {status}
              </div>
              <div className="mini-progress" aria-hidden="true">
                <span style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }} />
              </div>
              <a className="spotify-credit" href={mediaUrl(current, current.startMs)} target="_blank" rel="noopener">
                {openLabel(current)}
              </a>
            </div>
            <div className="dock-controls">
              <button
                className="icon-btn dock-repeat"
                onClick={player.cycleRepeat}
                aria-label={REPEAT_LABEL[player.repeat]}
                aria-pressed={player.repeat !== "off"}
                data-mode={player.repeat}
              >
                {player.repeat === "one" ? <RepeatOneIcon size={22} /> : <RepeatIcon size={22} />}
              </button>
              {expanded && hasPrev && (
                <button className="icon-btn" onClick={player.previous} aria-label="Previous moment">
                  <NextIcon style={{ transform: "scaleX(-1)" }} />
                </button>
              )}
              {session.ended && hasNext ? (
                <button className="btn btn-shell btn-sm" onClick={player.next}>
                  Play next
                </button>
              ) : (
                <button className="icon-btn" onClick={player.toggle} aria-label={playing ? "Pause" : "Play"}>
                  {playing ? <PauseIcon /> : <PlayIcon />}
                </button>
              )}
              {expanded && hasNext && !session.ended && (
                <button className="icon-btn" onClick={player.next} aria-label="Next moment">
                  <NextIcon />
                </button>
              )}
              {expanded && kind !== "spotify-sdk" ? (
                <button className="icon-btn" onClick={player.collapse} aria-label="Pause and minimise player">
                  <span aria-hidden="true" className="dock-collapse-glyph" />
                </button>
              ) : (
                <button className="icon-btn" onClick={player.stop} aria-label="Close player">
                  <CloseIcon size={20} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
