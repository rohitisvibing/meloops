import { describe, expect, it } from "vitest";
import { segmentInputSchema, validateSegmentTimes } from "@/lib/validation";

describe("validateSegmentTimes", () => {
  it("accepts a valid segment", () => {
    expect(validateSegmentTimes(42_000, 78_000, 221_000)).toBeNull();
    expect(validateSegmentTimes(0, 30_000, null)).toBeNull();
  });
  it("rejects missing values", () => {
    expect(validateSegmentTimes(null, 10_000)?.field).toBe("start");
    expect(validateSegmentTimes(0, null)?.field).toBe("end");
  });
  it("rejects negative start", () => {
    expect(validateSegmentTimes(-1, 10_000)?.field).toBe("start");
  });
  it("rejects end equal to or before start", () => {
    expect(validateSegmentTimes(10_000, 10_000)?.message).toBe("End has to be after the start.");
    expect(validateSegmentTimes(10_000, 5_000)?.field).toBe("end");
  });
  it("rejects very short segments", () => {
    expect(validateSegmentTimes(10_000, 12_000)?.field).toBe("end");
  });
  it("rejects end past the known duration", () => {
    expect(validateSegmentTimes(0, 222_000, 221_000)?.message).toContain("03:41");
    expect(validateSegmentTimes(0, 221_000, 221_000)).toBeNull();
  });
});

describe("segmentInputSchema", () => {
  const base = {
    provider: "spotify" as const,
    mediaId: "4cOdK2wGLETKBW3PvgPWqT",
    title: "Song A",
    startMs: 42_000,
    endMs: 78_000,
  };
  it("parses with defaults", () => {
    const parsed = segmentInputSchema.parse(base);
    expect(parsed).toMatchObject({ artist: "", note: "", durationMs: null, playlistId: null });
  });
  it("reports time errors on the right path", () => {
    const result = segmentInputSchema.safeParse({ ...base, endMs: 1000 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["endMs"]);
  });
  it("requires a title", () => {
    expect(segmentInputSchema.safeParse({ ...base, title: "  " }).success).toBe(false);
  });
});

describe("segmentInputSchema providers", () => {
  const base = { title: "Song", startMs: 0, endMs: 30_000 };
  it("accepts YouTube IDs", () => {
    expect(segmentInputSchema.safeParse({ ...base, provider: "youtube", mediaId: "dQw4w9WgXcQ" }).success).toBe(true);
  });
  it("rejects an ID that doesn't match its provider", () => {
    const result = segmentInputSchema.safeParse({ ...base, provider: "youtube", mediaId: "4cOdK2wGLETKBW3PvgPWqT" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["mediaId"]);
  });
});
