import type { LocalState } from "./local-repo";

/**
 * Sample data for demo mode: media IDs plus hand-typed labels and timestamps.
 * YouTube moments stream in the app with no setup; the Spotify one shows the
 * Spotify path (Premium SDK, embed, or open in Spotify). Timestamps follow the
 * official videos, which can differ from album versions.
 */
const TRACKS = [
  ["t1", "youtube", "4NRXx6U8ABQ", "Blinding Lights", "The Weeknd", 262_000],
  ["t2", "youtube", "gGdGFtwCNBE", "Mr. Brightside", "The Killers", 223_000],
  ["t3", "youtube", "fJ9rUzIMcZQ", "Bohemian Rhapsody", "Queen", 360_000],
  ["t4", "spotify", "7qiZfU4dY1lWllzX7mPBI3", "Shape of You", "Ed Sheeran", 233_712],
] as const;

const SEGMENTS = [
  ["s1", "t1", 62_000, 98_000, "Synth hook", true, "like"],
  ["s2", "t2", 75_000, 122_000, "Second chorus", false, null],
  ["s3", "t3", 150_000, 185_000, "Galileo", true, "like"],
  ["s4", "t4", 60_000, 92_000, "", false, null],
] as const;

export function demoSeed(): LocalState {
  const base = Date.now();
  const at = (minutesAgo: number) => new Date(base - minutesAgo * 60_000).toISOString();

  return {
    version: 2,
    tracks: TRACKS.map(([id, provider, mediaId, title, artist, durationMs], i) => ({
      id,
      provider,
      mediaId,
      title,
      artist,
      durationMs,
      addedAt: at(600 - i * 10),
    })),
    segments: SEGMENTS.map(([id, libraryTrackId, startMs, endMs, note, isFavorite, reaction], i) => ({
      id,
      libraryTrackId,
      startMs,
      endMs,
      note,
      isFavorite,
      reaction,
      createdAt: at(500 - i * 30),
      updatedAt: at(500 - i * 30),
    })),
    playlists: [
      {
        id: "p1",
        title: "Late night hooks",
        description: "The bits I replay on the way home.",
        coverStyle: 0,
        visibility: "private",
        shareSlug: null,
        lastPlayedAt: at(90),
        createdAt: at(480),
        updatedAt: at(90),
        items: [
          { id: "i1", segmentId: "s1", position: "a0" },
          { id: "i2", segmentId: "s2", position: "a1" },
          { id: "i3", segmentId: "s3", position: "a2" },
        ],
      },
      {
        id: "p2",
        title: "Gym drops",
        description: "",
        coverStyle: 2,
        visibility: "private",
        shareSlug: null,
        lastPlayedAt: null,
        createdAt: at(300),
        updatedAt: at(200),
        items: [{ id: "i4", segmentId: "s4", position: "a0" }],
      },
    ],
    saved: [],
  };
}
