import { describe, expect, it } from "vitest";
import { keyAtEnd, keyForIndex } from "@/lib/ordering";
import { canPlaySegments, isSegmentActuallyPlaying, type Capability } from "@/lib/providers/types";

describe("fractional ordering", () => {
  it("places a key between neighbours", () => {
    const a = keyAtEnd([]);
    const b = keyAtEnd([a]);
    const c = keyAtEnd([a, b]);
    const moved = keyForIndex([a, b], 1); // c moved between a and b
    expect([a, moved, b].slice().sort()).toEqual([a, moved, b]);
    expect(keyForIndex([b, c], 0) < b).toBe(true);
    expect(keyForIndex([a, b], 2) > b).toBe(true);
  });
});

describe("capability gating", () => {
  const none = new Set<Capability>();
  const full = new Set<Capability>(["metadata", "playerInit", "playPause", "seek", "stateUpdates", "segmentEnd"]);
  const seg = { segmentId: "s", provider: "youtube" as const, mediaId: "t", startMs: 10_000, endMs: 40_000 };
  const state = { mediaId: "t", positionMs: 20_000, durationMs: 200_000, paused: false, readAt: 0 };

  it("requires all playback caps", () => {
    expect(canPlaySegments(none)).toBe(false);
    expect(canPlaySegments(new Set<Capability>(["metadata", "playPause"]))).toBe(false);
    expect(canPlaySegments(full)).toBe(true);
  });

  it("never reports playing without state updates", () => {
    const noState = new Set<Capability>(["playPause", "seek"]);
    expect(isSegmentActuallyPlaying(noState, state, seg)).toBe(false);
  });

  it("checks real state against the segment", () => {
    expect(isSegmentActuallyPlaying(full, state, seg)).toBe(true);
    expect(isSegmentActuallyPlaying(full, { ...state, paused: true }, seg)).toBe(false);
    expect(isSegmentActuallyPlaying(full, { ...state, mediaId: "other" }, seg)).toBe(false);
    expect(isSegmentActuallyPlaying(full, { ...state, positionMs: 90_000 }, seg)).toBe(false);
    expect(isSegmentActuallyPlaying(full, null, seg)).toBe(false);
  });
});
