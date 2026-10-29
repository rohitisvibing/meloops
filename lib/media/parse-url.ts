/**
 * Parses a pasted song link from YouTube, YouTube Music or Spotify. No network calls.
 */
import { parseSpotifyTrackUrl } from "@/lib/spotify/parse-url";
import type { MediaProvider } from "./types";

export type ParsedMedia = {
  ok: true;
  provider: MediaProvider;
  mediaId: string;
  /** Start time carried in the link (YouTube `t=`), if any. */
  startMs: number | null;
};

export type MediaParseError = { ok: false; code: string; message: string };

const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const YT_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"]);
const SPOTIFY_HINT = /(^spotify:|spotify\.com|spotify\.link|spotify\.app\.link)/i;

function fail(code: string, message: string): MediaParseError {
  return { ok: false, code, message };
}

/** "42", "42s", "1m15s", "1h2m3s" → ms */
export function parseYouTubeTime(value: string | null): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value) * 1000;
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (!match || !match[0]) return null;
  const [, h = "0", m = "0", s = "0"] = match;
  return ((Number(h) * 60 + Number(m)) * 60 + Number(s)) * 1000;
}

function youtube(id: string | null | undefined, url: URL): ParsedMedia | MediaParseError {
  if (!id || !YT_ID_RE.test(id)) {
    return fail("bad_id", "This YouTube link looks incomplete. Copy it again from the Share button.");
  }
  const startMs = parseYouTubeTime(url.searchParams.get("t") ?? url.searchParams.get("start"));
  return { ok: true, provider: "youtube", mediaId: id, startMs };
}

function parseYouTube(url: URL): ParsedMedia | MediaParseError | null {
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") return youtube(parts[0], url);
  if (!YT_HOSTS.has(host)) return null;

  if (parts[0] === "watch") return youtube(url.searchParams.get("v"), url);
  if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live") return youtube(parts[1], url);
  if (parts[0] === "playlist") {
    return fail("wrong_type", "This is a YouTube playlist link. Open one song and copy its link.");
  }
  if (parts[0]?.startsWith("@") || parts[0] === "channel" || parts[0] === "c" || parts[0] === "browse") {
    return fail("wrong_type", "This is a channel link. Open one song and copy its link.");
  }
  return fail("bad_id", "This YouTube link doesn't point to a song. Open the song and copy its link.");
}

export function parseMediaUrl(input: string): ParsedMedia | MediaParseError {
  const value = input.trim();
  if (!value) return fail("empty", "Paste a YouTube or Spotify song link.");

  if (SPOTIFY_HINT.test(value)) {
    const spotify = parseSpotifyTrackUrl(value);
    return spotify.ok
      ? { ok: true, provider: "spotify", mediaId: spotify.trackId, startMs: null }
      : fail(spotify.code, spotify.message);
  }

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return fail("not_supported", "That isn't a link. Paste a YouTube or Spotify song link.");
  }
  return parseYouTube(url) ?? fail("not_supported", "Only YouTube, YouTube Music and Spotify song links work here.");
}
