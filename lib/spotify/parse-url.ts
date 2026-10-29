/**
 * Local parsing of Spotify track links. No network calls.
 */

export type ParsedTrackRef = {
  ok: true;
  trackId: string;
  uri: `spotify:track:${string}`;
  url: string;
};

export type ParseErrorCode =
  | "empty"
  | "not_spotify"
  | "short_link"
  | "wrong_type"
  | "bad_id";

export type ParseError = {
  ok: false;
  code: ParseErrorCode;
  message: string;
};

const TRACK_ID_RE = /^[A-Za-z0-9]{22}$/;
const SPOTIFY_HOSTS = new Set(["open.spotify.com", "play.spotify.com"]);
const SHORT_HOSTS = new Set(["spotify.link", "spotify.app.link"]);
const OTHER_TYPES: Record<string, string> = {
  album: "an album",
  playlist: "a playlist",
  artist: "an artist",
  episode: "a podcast episode",
  show: "a podcast",
  audiobook: "an audiobook",
  chapter: "an audiobook chapter",
  user: "a profile",
};

function fail(code: ParseErrorCode, message: string): ParseError {
  return { ok: false, code, message };
}

function ok(trackId: string): ParsedTrackRef {
  return {
    ok: true,
    trackId,
    uri: `spotify:track:${trackId}`,
    url: `https://open.spotify.com/track/${trackId}`,
  };
}

function checkType(type: string, id: string | undefined): ParsedTrackRef | ParseError {
  if (type !== "track") {
    const label = OTHER_TYPES[type] ?? "not a song";
    return fail("wrong_type", `This is ${label} link. Paste a link to a single song.`);
  }
  if (!id || !TRACK_ID_RE.test(id)) {
    return fail("bad_id", "This song link looks incomplete. Copy it again from Spotify.");
  }
  return ok(id);
}

export function parseSpotifyTrackUrl(input: string): ParsedTrackRef | ParseError {
  const value = input.trim();
  if (!value) return fail("empty", "Paste a Spotify song link.");

  if (value.startsWith("spotify:")) {
    const [, type = "", id] = value.split(":");
    return checkType(type, id);
  }

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return fail("not_spotify", "That isn't a link. Paste a Spotify song link.");
  }

  const host = url.hostname.toLowerCase();
  if (SHORT_HOSTS.has(host)) {
    return fail(
      "short_link",
      "Short links aren't supported yet. In Spotify, open the song, tap Share, then Copy link and paste the full open.spotify.com link.",
    );
  }
  if (!SPOTIFY_HOSTS.has(host)) {
    return fail("not_spotify", "Only Spotify song links work here.");
  }

  // Paths look like /track/{id} or /intl-en/track/{id}.
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0]?.startsWith("intl-")) parts.shift();
  const [type = "", id] = parts;
  return checkType(type, id);
}
