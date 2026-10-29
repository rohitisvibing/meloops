import { describe, expect, it } from "vitest";
import { parseMediaUrl, parseYouTubeTime } from "@/lib/media/parse-url";

const YT = "dQw4w9WgXcQ";
const SP = "4cOdK2wGLETKBW3PvgPWqT";

describe("parseMediaUrl: YouTube", () => {
  it.each([
    `https://www.youtube.com/watch?v=${YT}`,
    `https://youtube.com/watch?v=${YT}&list=PL123&index=2`,
    `https://m.youtube.com/watch?v=${YT}`,
    `https://music.youtube.com/watch?v=${YT}&si=abc`,
    `https://youtu.be/${YT}`,
    `https://youtu.be/${YT}?si=xyz`,
    `https://www.youtube.com/shorts/${YT}`,
    `https://www.youtube.com/embed/${YT}`,
    `youtube.com/watch?v=${YT}`,
  ])("accepts %s", (input) => {
    expect(parseMediaUrl(input)).toMatchObject({ ok: true, provider: "youtube", mediaId: YT });
  });

  it.each([
    [`https://youtu.be/${YT}?t=42`, 42_000],
    [`https://www.youtube.com/watch?v=${YT}&t=1m15s`, 75_000],
    [`https://www.youtube.com/watch?v=${YT}&t=75s`, 75_000],
    [`https://www.youtube.com/embed/${YT}?start=30`, 30_000],
    [`https://youtu.be/${YT}`, null],
  ])("reads start time from %s", (input, startMs) => {
    expect(parseMediaUrl(input)).toMatchObject({ ok: true, startMs });
  });

  it.each([
    ["https://www.youtube.com/playlist?list=PL123", "wrong_type"],
    ["https://www.youtube.com/@queenofficial", "wrong_type"],
    ["https://www.youtube.com/watch?v=short", "bad_id"],
    ["https://youtu.be/", "bad_id"],
    ["https://vimeo.com/123", "not_supported"],
    ["", "empty"],
  ])("rejects %j as %s", (input, code) => {
    const result = parseMediaUrl(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(code);
  });
});

describe("parseMediaUrl: Spotify", () => {
  it("delegates to the Spotify parser", () => {
    expect(parseMediaUrl(`https://open.spotify.com/track/${SP}?si=1`)).toMatchObject({
      ok: true,
      provider: "spotify",
      mediaId: SP,
      startMs: null,
    });
    expect(parseMediaUrl(`spotify:track:${SP}`)).toMatchObject({ ok: true, provider: "spotify" });
  });
  it("keeps Spotify-specific errors", () => {
    const result = parseMediaUrl(`https://open.spotify.com/album/${SP}`);
    expect(!result.ok && result.message).toBe("This is an album link. Paste a link to a single song.");
  });
});

describe("parseYouTubeTime", () => {
  it.each([
    ["42", 42_000],
    ["1h2m3s", 3_723_000],
    ["2m", 120_000],
    ["", null],
    ["abc", null],
  ])("%s", (input, expected) => {
    expect(parseYouTubeTime(input)).toBe(expected);
  });
});
