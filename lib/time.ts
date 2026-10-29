/**
 * Timecode helpers. All internal times are integer milliseconds.
 */

const TIMECODE_RE = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?$/;
const SECONDS_RE = /^(\d+)(?:\.(\d{1,3}))?$/;

function fractionToMs(fraction: string | undefined): number {
  if (!fraction) return 0;
  return Number(fraction.padEnd(3, "0"));
}

/**
 * Parse "1:15", "01:15", "1:02:03", "75" or "75.5" into milliseconds.
 * Returns null when the input is not a valid timecode.
 */
export function parseTimecode(input: string): number | null {
  const value = input.trim();
  if (!value) return null;

  const seconds = SECONDS_RE.exec(value);
  if (seconds) {
    return Number(seconds[1]) * 1000 + fractionToMs(seconds[2]);
  }

  const match = TIMECODE_RE.exec(value);
  if (!match) return null;

  const [, h, m, s, fraction] = match;
  const hours = h ? Number(h) : 0;
  const minutes = Number(m);
  const secs = Number(s);
  if (secs > 59) return null;
  // Minutes may exceed 59 only when no hour part is given ("75:00").
  if (h && minutes > 59) return null;

  return ((hours * 60 + minutes) * 60 + secs) * 1000 + fractionToMs(fraction);
}

/** Format milliseconds as "01:15", or "1:02:03" past an hour. Truncates to whole seconds. */
export function formatTimecode(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${ss}`;
  }
  return `${String(minutes).padStart(2, "0")}:${ss}`;
}

/** Short human duration: "36 s", "1 min 12 s", "1 h 4 min". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
  if (minutes > 0) return seconds ? `${minutes} min ${seconds} s` : `${minutes} min`;
  return `${seconds} s`;
}
