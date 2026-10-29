"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTrimPlayer } from "@/lib/client/use-trim-player";
import type { MediaProvider } from "@/lib/media/types";
import { playFromPosition } from "@/lib/providers/rules";
import { formatDuration, formatTimecode } from "@/lib/time";
import { MIN_SEGMENT_MS, validateSegmentTimes, type SegmentTimesError } from "@/lib/validation";
import { TapeStrip, type Handle } from "./tape-strip";
import { TrimScreen } from "./trim-screen";

export type SegmentFormValue = { startMs: number; endMs: number; note: string };

/** Seek at most this often while something is dragged during playback. */
const LIVE_SEEK_MS = 200;
/** Letting go of the end tab plays this much before it, so you hear where it cuts. */
const END_AUDITION_MS = 3000;

export function SegmentForm({
  provider,
  mediaId,
  title,
  artist,
  durationMs,
  initial,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
  onDurationDetected,
  children,
}: {
  provider: MediaProvider;
  mediaId: string;
  title: string;
  artist: string;
  durationMs: number | null;
  initial: SegmentFormValue;
  submitLabel: string;
  busy?: boolean;
  onSubmit: (value: SegmentFormValue) => void;
  onCancel?: () => void;
  /** Called once the player reports the song's real length. */
  onDurationDetected?: (ms: number) => void;
  /** Extra fields rendered above the actions (e.g. playlist picker). */
  children?: ReactNode;
}) {
  const [startMs, setStartMs] = useState<number | null>(initial.startMs);
  const [endMs, setEndMs] = useState<number | null>(initial.endMs);
  // Notes can no longer be written here; existing ones are kept as they are.
  const note = initial.note;
  const [error, setError] = useState<SegmentTimesError | null>(null);
  const [loop, setLoopState] = useState(true);
  /** Where Play starts when the player isn't reporting a position (before playing). */
  const [cursorMs, setCursorMs] = useState(initial.startMs);

  const trim = useTrimPlayer({ provider, mediaId, initialStartMs: initial.startMs, trackMs: durationMs });

  // When the length isn't known yet, learn it from the player.
  const [detectedMs, setDetectedMs] = useState<number | null>(null);
  useEffect(() => {
    if (durationMs !== null || !trim.durationMs || trim.durationMs === detectedMs) return;
    setDetectedMs(trim.durationMs);
    onDurationDetected?.(trim.durationMs);
  }, [durationMs, trim.durationMs, detectedMs, onDurationDetected]);
  const knownMs = durationMs ?? detectedMs;

  const stripDuration = knownMs ?? Math.max(300_000, (endMs ?? 0) + 60_000);
  const lengthMs = startMs !== null && endMs !== null ? Math.max(0, endMs - startMs) : 0;
  // The playhead shows the player's real position whenever it reports one.
  const playheadMs = trim.positionMs ?? cursorMs;

  // Latest values for handlers that run before React re-renders (keyboard, release).
  const latest = useRef({ startMs, endMs, playheadMs, playing: trim.playing });
  latest.current = { startMs, endMs, playheadMs, playing: trim.playing };
  const lastLiveSeek = useRef(0);

  useEffect(() => {
    if (error) setError(validateSegmentTimes(startMs, endMs, knownMs));
    // Re-check live only once an error is showing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startMs, endMs]);

  const rangeOf = (s = latest.current.startMs, e = latest.current.endMs) =>
    s !== null && e !== null && !validateSegmentTimes(s, e, knownMs) ? { startMs: s, endMs: e } : null;

  const togglePlay = () => {
    if (trim.playing) {
      setCursorMs(playheadMs);
      return trim.pause();
    }
    const problem = validateSegmentTimes(startMs, endMs, knownMs);
    if (problem) return setError(problem);
    const range = { startMs: startMs!, endMs: endMs! };
    trim.play(playFromPosition(playheadMs, range.startMs, range.endMs), range);
  };

  /** Something on the tape is being dragged: follow it live. */
  const onMove = (handle: Handle, ms: number) => {
    if (handle === "playhead") setCursorMs(ms);
    if (handle === "end") {
      const r = rangeOf(undefined, ms);
      if (r) trim.updateRange(r);
      return;
    }
    const now = performance.now();
    if (now - lastLiveSeek.current < LIVE_SEEK_MS) return;
    lastLiveSeek.current = now;
    // Paused: show the frame there. Playing: keep playing from there.
    trim.seek(ms);
  };

  /** A drag (or key press, or tap) finished: settle the player where the user left it. */
  const onRelease = (handle: Handle, ms: number) => {
    if (handle === "playhead") {
      setCursorMs(ms);
      return trim.seek(ms, true);
    }
    const r = rangeOf(handle === "start" ? ms : undefined, handle === "end" ? ms : undefined);
    if (!r) return;
    if (handle === "start") {
      setCursorMs(r.startMs);
      if (latest.current.playing) trim.play(r.startMs, r);
      else trim.seek(r.startMs, true);
      return;
    }
    const from = Math.max(r.startMs, r.endMs - END_AUDITION_MS);
    setCursorMs(from);
    if (latest.current.playing) trim.play(from, r);
    else trim.seek(from, true);
  };

  const roundTenth = (ms: number) => Math.round(ms / 100) * 100;

  const mark = (which: "start" | "end") => {
    const at = roundTenth(latest.current.playheadMs);
    if (which === "start") {
      const e = latest.current.endMs;
      setStartMs(at);
      if (e === null || e - at < MIN_SEGMENT_MS) setEndMs(Math.min(knownMs ?? Infinity, at + 30_000));
      return;
    }
    const s = latest.current.startMs ?? 0;
    if (at - s < MIN_SEGMENT_MS) {
      setError({ field: "end", message: "End has to be at least 3 seconds after the start." });
      return;
    }
    setEndMs(at);
    const r = rangeOf(s, at);
    if (r && latest.current.playing) trim.updateRange(r);
  };

  const changeLoop = (on: boolean) => {
    setLoopState(on);
    trim.setLoop(on);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const problem = validateSegmentTimes(startMs, endMs, knownMs);
    setError(problem);
    if (problem) return;
    trim.pause();
    onSubmit({ startMs: startMs!, endMs: endMs!, note });
  };

  return (
    <form onSubmit={submit} noValidate style={{ display: "grid", gap: 16 }}>
      <TrimScreen trim={trim} provider={provider} mediaId={mediaId} title={title} artist={artist} />

      <div className="lcd" aria-live="polite">
        <div className="lcd-text" style={{ fontSize: "var(--t-2xl)", lineHeight: 1.1 }}>
          {startMs !== null ? formatTimecode(startMs) : "--:--"}
          <span style={{ color: "var(--lcd-dim)" }}> ▸ </span>
          {endMs !== null ? formatTimecode(endMs) : "--:--"}
        </div>
        <div className="label" style={{ fontSize: "var(--t-sm)", color: "var(--lcd-text)", opacity: 0.8 }}>
          {lengthMs > 0 ? `${formatDuration(lengthMs)} moment` : "Set a start and end"}
        </div>
      </div>

      <TapeStrip
        durationMs={stripDuration}
        durationKnown={knownMs !== null}
        startMs={startMs ?? 0}
        endMs={endMs ?? Math.min(stripDuration, (startMs ?? 0) + 30_000)}
        playheadMs={playheadMs}
        playing={trim.playing}
        ready={trim.ready && !trim.previewOnly}
        scrubDisabled={trim.previewOnly}
        loop={loop}
        onLoopChange={changeLoop}
        onChange={(s, en) => {
          setStartMs(s);
          setEndMs(en);
        }}
        onMove={onMove}
        onRelease={onRelease}
        onPlayToggle={togglePlay}
        onMark={mark}
      />

      {error && (
        <p className="field-error" role="alert">
          {error.message}
        </p>
      )}

      {children}

      <div style={{ display: "grid", gridTemplateColumns: onCancel ? "1fr 2fr" : "1fr", gap: 12 }}>
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
