import { describe, expect, it } from "vitest";
import { formatDuration, formatTimecode, parseTimecode } from "@/lib/time";

describe("parseTimecode", () => {
  it.each([
    ["1:15", 75_000],
    ["01:15", 75_000],
    ["00:42", 42_000],
    ["75", 75_000],
    ["75.5", 75_500],
    ["1:02:03", 3_723_000],
    ["75:00", 4_500_000],
    ["0:00.25", 250],
    [" 2:30 ", 150_000],
  ])("parses %s", (input, expected) => {
    expect(parseTimecode(input)).toBe(expected);
  });

  it.each(["", "abc", "1:60", "1:75:00", "-5", "1::2", "1:2:3:4"])("rejects %j", (input) => {
    expect(parseTimecode(input)).toBeNull();
  });
});

describe("formatTimecode", () => {
  it("pads minutes and seconds", () => {
    expect(formatTimecode(75_000)).toBe("01:15");
    expect(formatTimecode(0)).toBe("00:00");
    expect(formatTimecode(75_999)).toBe("01:15");
  });
  it("adds hours past 60 minutes", () => {
    expect(formatTimecode(3_723_000)).toBe("1:02:03");
  });
  it("round-trips", () => {
    for (const ms of [0, 42_000, 78_000, 185_000, 3_723_000]) {
      expect(parseTimecode(formatTimecode(ms))).toBe(ms);
    }
  });
});

describe("formatDuration", () => {
  it("formats", () => {
    expect(formatDuration(36_000)).toBe("36 s");
    expect(formatDuration(72_000)).toBe("1 min 12 s");
    expect(formatDuration(120_000)).toBe("2 min");
    expect(formatDuration(3_840_000)).toBe("1 h 4 min");
  });
});
