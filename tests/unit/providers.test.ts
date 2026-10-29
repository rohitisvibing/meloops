import { describe, expect, it } from "vitest";
import { decodeSharePayload, encodeSharePayload } from "@/lib/data/share-payload";
import type { Playlist } from "@/lib/data/types";
import { isSpotifyPreview, nextIndex, playFromPosition, reachedSegmentEnd, YT_STATE } from "@/lib/providers/rules";
import { mediaUrl } from "@/lib/media/links";

import { cleanChannelName, parseIsoDuration } from "@/lib/youtube/server/metadata";

describe("nextIndex", () => {
  it("plays the next moment, then stops when repeat is off", () => {
    expect(nextIndex(0, 3, "off")).toBe(1);
    expect(nextIndex(2, 3, "off")).toBeNull();
  });
  it("wraps to the start when repeating all", () => {
    expect(nextIndex(1, 3, "all")).toBe(2);
    expect(nextIndex(2, 3, "all")).toBe(0);
    expect(nextIndex(0, 1, "all")).toBe(0);
  });
  it("replays the same moment when repeating one", () => {
    expect(nextIndex(1, 3, "one")).toBe(1);
    expect(nextIndex(0, 1, "one")).toBe(0);
  });
  it("handles an empty queue", () => {
    expect(nextIndex(0, 0, "all")).toBeNull();
  });
});

describe("reachedSegmentEnd", () => {
  const END = 98_000;
  it("counts ENDED", () => {
    expect(reachedSegmentEnd(YT_STATE.ENDED, 10_000, END)).toBe(true);
  });
  it("counts YouTube pausing itself at endSeconds", () => {
    expect(reachedSegmentEnd(YT_STATE.PAUSED, 97_800, END)).toBe(true);
    expect(reachedSegmentEnd(YT_STATE.PAUSED, 98_000, END)).toBe(true);
  });
  it("ignores a manual pause earlier in the moment", () => {
    expect(reachedSegmentEnd(YT_STATE.PAUSED, 80_000, END)).toBe(false);
  });
  it("counts playing past the end", () => {
    expect(reachedSegmentEnd(YT_STATE.PLAYING, 98_400, END)).toBe(true);
  });
  it("ignores buffering and cued states", () => {
    expect(reachedSegmentEnd(YT_STATE.BUFFERING, 98_400, END)).toBe(false);
    expect(reachedSegmentEnd(YT_STATE.CUED, 98_400, END)).toBe(false);
  });
});

describe("isSpotifyPreview", () => {
  it("flags a 30 s stream for a longer song", () => {
    expect(isSpotifyPreview(30_000, 233_000)).toBe(true);
    expect(isSpotifyPreview(29_500, null)).toBe(true);
  });
  it("accepts full-length streams", () => {
    expect(isSpotifyPreview(233_000, 233_000)).toBe(false);
    expect(isSpotifyPreview(0, null)).toBe(false);
  });
  it("accepts genuinely short songs", () => {
    expect(isSpotifyPreview(30_000, 31_000)).toBe(false);
  });
});

describe("YouTube metadata helpers", () => {
  it("parses ISO 8601 durations", () => {
    expect(parseIsoDuration("PT3M33S")).toBe(213_000);
    expect(parseIsoDuration("PT1H2M3S")).toBe(3_723_000);
    expect(parseIsoDuration("PT45S")).toBe(45_000);
    expect(parseIsoDuration("P0D")).toBeNull();
    expect(parseIsoDuration("nope")).toBeNull();
  });
  it("cleans channel names", () => {
    expect(cleanChannelName("Queen - Topic")).toBe("Queen");
    expect(cleanChannelName("TheWeekndVEVO")).toBe("TheWeeknd");
    expect(cleanChannelName("Rick Astley")).toBe("Rick Astley");
  });
});

describe("mediaUrl", () => {
  it("adds the start time for YouTube only", () => {
    expect(mediaUrl({ provider: "youtube", mediaId: "dQw4w9WgXcQ" }, 42_500)).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
    );
    expect(mediaUrl({ provider: "spotify", mediaId: "4cOdK2wGLETKBW3PvgPWqT" }, 42_000)).toBe(
      "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
    );
  });
});

describe("demo share payload", () => {
  const segment = (provider: "youtube" | "spotify", mediaId: string, startMs: number) => ({
    id: mediaId,
    position: "a0",
    segment: {
      id: `s-${mediaId}`,
      track: { id: "t", provider, mediaId, title: "Song", artist: "Artist", durationMs: 200_000, addedAt: "" },
      startMs,
      endMs: startMs + 30_000,
      note: "",
      reaction: null,
      isFavorite: false,
      createdAt: "",
      updatedAt: "",
    },
  });
  const playlist: Playlist = {
    id: "p",
    title: "Mixed",
    description: "",
    coverStyle: 1,
    visibility: "link",
    shareSlug: null,
    lastPlayedAt: null,
    createdAt: "",
    updatedAt: "",
    items: [segment("youtube", "dQw4w9WgXcQ", 42_000), segment("spotify", "4cOdK2wGLETKBW3PvgPWqT", 60_000)],
  };

  it("round-trips providers", () => {
    const shared = decodeSharePayload(encodeSharePayload(playlist));
    expect(shared?.items.map((i) => [i.provider, i.mediaId, i.startMs])).toEqual([
      ["youtube", "dQw4w9WgXcQ", 42_000],
      ["spotify", "4cOdK2wGLETKBW3PvgPWqT", 60_000],
    ]);
  });

  it("reads links made before YouTube support as Spotify", () => {
    const legacy = { t: "Old", d: "", c: 0, i: [["4cOdK2wGLETKBW3PvgPWqT", "Song", "Artist", null, 1000, 31_000]] };
    const slug = "d." + btoa(JSON.stringify(legacy)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(decodeSharePayload(slug)?.items[0]).toMatchObject({ provider: "spotify", mediaId: "4cOdK2wGLETKBW3PvgPWqT" });
  });

  it("drops rows whose ID doesn't fit the provider", () => {
    const bad = { t: "Bad", d: "", c: 0, i: [["y", "not-an-id", "Song", "", null, 0, 30_000]] };
    const slug = "d." + btoa(JSON.stringify(bad)).replace(/=+$/, "");
    expect(decodeSharePayload(slug)?.items).toEqual([]);
  });
});

describe("playFromPosition", () => {
  it("plays from the playhead inside the moment", () => {
    expect(playFromPosition(70_000, 62_000, 98_000)).toBe(70_000);
    expect(playFromPosition(62_000, 62_000, 98_000)).toBe(62_000);
  });
  it("goes back to the start outside the moment or at its very end", () => {
    expect(playFromPosition(10_000, 62_000, 98_000)).toBe(62_000);
    expect(playFromPosition(120_000, 62_000, 98_000)).toBe(62_000);
    expect(playFromPosition(97_900, 62_000, 98_000)).toBe(62_000);
    expect(playFromPosition(null, 62_000, 98_000)).toBe(62_000);
  });
});
