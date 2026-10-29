import { describe, expect, it } from "vitest";
import { parseSpotifyTrackUrl } from "@/lib/spotify/parse-url";

const ID = "4cOdK2wGLETKBW3PvgPWqT";

describe("parseSpotifyTrackUrl", () => {
  it.each([
    `https://open.spotify.com/track/${ID}`,
    `https://open.spotify.com/track/${ID}?si=abc123`,
    `https://open.spotify.com/intl-en/track/${ID}`,
    `https://open.spotify.com/intl-pt/track/${ID}?si=x&context=y`,
    `open.spotify.com/track/${ID}`,
    `  https://open.spotify.com/track/${ID}  `,
    `spotify:track:${ID}`,
  ])("accepts %s", (input) => {
    const result = parseSpotifyTrackUrl(input);
    expect(result).toMatchObject({ ok: true, trackId: ID, uri: `spotify:track:${ID}` });
  });

  it.each([
    ["", "empty"],
    ["not a url at all", "not_spotify"],
    ["https://youtube.com/watch?v=123", "not_spotify"],
    [`https://open.spotify.com/album/${ID}`, "wrong_type"],
    [`https://open.spotify.com/playlist/${ID}`, "wrong_type"],
    [`https://open.spotify.com/episode/${ID}`, "wrong_type"],
    [`spotify:album:${ID}`, "wrong_type"],
    ["https://open.spotify.com/track/short", "bad_id"],
    ["https://open.spotify.com/track/", "bad_id"],
    ["https://spotify.link/AbCdEf", "short_link"],
  ])("rejects %j as %s", (input, code) => {
    const result = parseSpotifyTrackUrl(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(code);
  });

  it("names the content type in the error", () => {
    const result = parseSpotifyTrackUrl(`https://open.spotify.com/album/${ID}`);
    expect(!result.ok && result.message).toBe("This is an album link. Paste a link to a single song.");
  });
});
