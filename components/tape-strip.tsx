"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { MIN_SEGMENT_MS } from "@/lib/validation";
import { formatTimecode } from "@/lib/time";
import { PauseIcon, PlayIcon, RepeatIcon } from "./icons";
import styles from "./tape-strip.module.css";

export type Handle = "start" | "end" | "playhead";

const SNAP_MS = 500;
const FINE_SNAP_MS = 100;
const LONG_PRESS_MS = 400;

/**
 * The trim transport: the whole song as a tape, two tabs for the moment's start and end,
 * and a playhead that shows (and sets) where the player really is. This is a timeline,
 * not a waveform: Meloops has no access to the audio.
 */
export function TapeStrip({
  durationMs,
  durationKnown,
  startMs,
  endMs,
  playheadMs,
  playing,
  ready,
  scrubDisabled,
  loop,
  onLoopChange,
  onChange,
  onMove,
  onRelease,
  onPlayToggle,
  onMark,
}: {
  durationMs: number;
  durationKnown: boolean;
  startMs: number;
  endMs: number;
  /** Where the player is (or will start from). */
  playheadMs: number;
  playing: boolean;
  ready: boolean;
  /** The player can't seek (e.g. a Spotify preview): tabs still move, the playhead doesn't. */
  scrubDisabled?: boolean;
  loop: boolean;
  onLoopChange: (on: boolean) => void;
  onChange: (startMs: number, endMs: number) => void;
  /** While something is dragged: its position, for live seeking. */
  onMove?: (handle: Handle, ms: number) => void;
  /** Something was let go (or moved by keyboard or a tap), with its final position. */
  onRelease?: (handle: Handle, ms: number) => void;
  onPlayToggle: () => void;
  onMark: (which: "start" | "end") => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<Handle | null>(null);
  const [fine, setFine] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSnap = useRef<number | null>(null);
  const lastValue = useRef<number | null>(null);

  const pct = (ms: number) => `${Math.min(100, Math.max(0, (ms / durationMs) * 100))}%`;

  const clampFor = useCallback(
    (handle: Handle, ms: number) => {
      if (handle === "start") return Math.min(Math.max(0, ms), endMs - MIN_SEGMENT_MS);
      if (handle === "end") return Math.max(Math.min(durationMs, ms), startMs + MIN_SEGMENT_MS);
      return Math.min(Math.max(0, ms), durationMs);
    },
    [startMs, endMs, durationMs],
  );

  /** Applies a position; tabs update the moment, the playhead only reports. */
  const commit = useCallback(
    (handle: Handle, ms: number) => {
      const value = clampFor(handle, ms);
      if (handle === "start") onChange(value, endMs);
      else if (handle === "end") onChange(startMs, value);
      return value;
    },
    [clampFor, onChange, startMs, endMs],
  );

  const msFromPointer = (clientX: number, snap: number) => {
    const rect = trackRef.current!.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    return Math.round((ratio * durationMs) / snap) * snap;
  };

  const startDrag = (handle: Handle) => (e: PointerEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(handle);
    setFine(false);
    lastSnap.current = null;
    lastValue.current = null;
    pressTimer.current = setTimeout(() => {
      setFine(true);
      navigator.vibrate?.(12);
    }, LONG_PRESS_MS);
  };

  const moveDrag = (handle: Handle) => (e: PointerEvent<HTMLElement>) => {
    if (dragging !== handle) return;
    if (pressTimer.current && Math.abs(e.movementX) > 1) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    const ms = msFromPointer(e.clientX, fine ? FINE_SNAP_MS : handle === "playhead" ? FINE_SNAP_MS : SNAP_MS);
    if (ms !== lastSnap.current) {
      lastSnap.current = ms;
      if (handle !== "playhead") navigator.vibrate?.(4);
      lastValue.current = commit(handle, ms);
      onMove?.(handle, lastValue.current);
    }
  };

  const endDrag = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
    const handle = dragging;
    setDragging(null);
    setFine(false);
    if (handle && lastValue.current !== null) onRelease?.(handle, lastValue.current);
    lastValue.current = null;
  };

  useEffect(
    () => () => {
      if (pressTimer.current) clearTimeout(pressTimer.current);
    },
    [],
  );

  /** Tapping the tape moves the playhead there. */
  const onTrackPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (scrubDisabled) return;
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.tapeBody) return;
    const value = commit("playhead", msFromPointer(e.clientX, FINE_SNAP_MS));
    onMove?.("playhead", value);
    onRelease?.("playhead", value);
  };

  const valueOf = (handle: Handle) => (handle === "start" ? startMs : handle === "end" ? endMs : playheadMs);

  const onKey = (handle: Handle) => (e: KeyboardEvent<HTMLElement>) => {
    const value = valueOf(handle);
    const step = e.shiftKey ? 5000 : 1000;
    const map: Record<string, number> = {
      ArrowLeft: value - step,
      ArrowDown: value - step,
      ArrowRight: value + step,
      ArrowUp: value + step,
      Home: handle === "end" ? startMs + MIN_SEGMENT_MS : 0,
      End: handle === "start" ? endMs - MIN_SEGMENT_MS : durationMs,
    };
    if (!(e.key in map)) return;
    e.preventDefault();
    const next = commit(handle, map[e.key]);
    onMove?.(handle, next);
    onRelease?.(handle, next);
  };

  // Tick marks every 15 s, labelled every minute.
  const ticks: number[] = [];
  for (let t = 0; t <= durationMs; t += 15_000) ticks.push(t);

  const sliderProps = (handle: Handle, label: string, min: number, max: number) => {
    const value = valueOf(handle);
    return {
      role: "slider" as const,
      tabIndex: 0,
      "aria-label": label,
      "aria-valuemin": Math.round(min / 1000),
      "aria-valuemax": Math.round(max / 1000),
      "aria-valuenow": Math.round(value / 1000),
      "aria-valuetext": formatTimecode(value),
      "data-active": dragging === handle,
      style: { left: pct(value) },
      onPointerDown: startDrag(handle),
      onPointerMove: moveDrag(handle),
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onKeyDown: onKey(handle),
    };
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.play}
          onClick={onPlayToggle}
          disabled={!ready}
          aria-label={playing ? "Pause" : "Play from the playhead"}
        >
          {playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
        </button>
        <span className={`${styles.window} lcd-text`} aria-live="off">
          {fine
            ? "Fine adjust"
            : `${formatTimecode(playheadMs)} / ${durationKnown ? formatTimecode(durationMs) : "--:--"}`}
        </span>
        <button
          type="button"
          className={styles.loop}
          aria-pressed={loop}
          aria-label={loop ? "Loop the moment: on" : "Loop the moment: off"}
          onClick={() => onLoopChange(!loop)}
        >
          <RepeatIcon size={20} />
        </button>
      </div>

      <div ref={trackRef} className={styles.track} onPointerDown={onTrackPointerDown} data-tape-body="true">
        {ticks.map((t) => (
          <span
            key={t}
            className={t % 60_000 === 0 ? styles.tickMajor : styles.tick}
            style={{ left: pct(t) }}
            aria-hidden="true"
          />
        ))}
        <span
          className={styles.range}
          style={{ left: pct(startMs), width: `calc(${pct(endMs)} - ${pct(startMs)})` }}
          aria-hidden="true"
        />
        <button type="button" className={`${styles.tab} ${styles.tabStart}`} {...sliderProps("start", "Start of moment", 0, endMs - MIN_SEGMENT_MS)}>
          <span className={styles.grip} aria-hidden="true" />
        </button>
        <button type="button" className={`${styles.tab} ${styles.tabEnd}`} {...sliderProps("end", "End of moment", startMs + MIN_SEGMENT_MS, durationMs)}>
          <span className={styles.grip} aria-hidden="true" />
        </button>
        <span className={styles.playheadLine} data-playing={playing} style={{ left: pct(playheadMs) }} aria-hidden="true" />
        <button
          type="button"
          className={styles.playhead}
          data-playing={playing}
          disabled={scrubDisabled}
          {...sliderProps("playhead", "Playback position", 0, durationMs)}
        >
          <span className={styles.playheadKnob} aria-hidden="true" />
        </button>
      </div>

      <div className={styles.scale} aria-hidden="true">
        {ticks
          .filter((t) => t % 60_000 === 0)
          .map((t) => (
            <span key={t} style={{ left: pct(t) }}>
              {Math.round(t / 60_000)}:00
            </span>
          ))}
      </div>

      <div className={styles.marks}>
        <button type="button" className={styles.mark} disabled={!ready || scrubDisabled} onClick={() => onMark("start")}>
          Mark start
        </button>
        <button type="button" className={styles.mark} disabled={!ready || scrubDisabled} onClick={() => onMark("end")}>
          Mark end
        </button>
      </div>
    </div>
  );
}
