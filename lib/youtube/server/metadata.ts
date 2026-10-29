import "server-only";
import type { TrackMeta } from "@/lib/providers/types";

/**
 * YouTube metadata from documented endpoints only:
 * - oEmbed (no key): title, channel name, thumbnail
 * - Data API videos.list (optional YOUTUBE_API_KEY, 1 quota unit): duration
 * Cached by Next's fetch cache for 24 hours; nothing is stored in our database.
 */
const DAY = 60 * 60 * 24;

export type YouTubeMetaResult =
  | { ok: true; meta: TrackMeta }
  | { ok: false; reason: "not_found" | "unavailable" | "not_embeddable" };

/** "PT3M33S" → 213000 */
export function parseIsoDuration(value: string): number | null {
  const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value);
  if (!match) return null;
  const [, d = "0", h = "0", m = "0", s = "0"] = match;
  const total = ((Number(d) * 24 + Number(h)) * 60 + Number(m)) * 60 + Number(s);
  return total > 0 ? total * 1000 : null;
}

/** Official artist channels on YouTube Music are named "Artist - Topic". */
export function cleanChannelName(name: string): string {
  return name.replace(/\s+-\s+Topic$/, "").replace(/VEVO$/, "").trim();
}

async function duration(videoId: string): Promise<number | null> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoId}&key=${key}`,
      { next: { revalidate: DAY } },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { items?: { contentDetails?: { duration?: string } }[] };
    const iso = body.items?.[0]?.contentDetails?.duration;
    return iso ? parseIsoDuration(iso) : null;
  } catch {
    return null;
  }
}

export async function getYouTubeMetadata(videoId: string): Promise<YouTubeMetaResult> {
  try {
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`;
    const [res, durationMs] = await Promise.all([fetch(url, { next: { revalidate: DAY } }), duration(videoId)]);
    // oEmbed answers 401/403 when the uploader has disabled embedding.
    if (res.status === 401 || res.status === 403) return { ok: false, reason: "not_embeddable" };
    if (res.status === 404 || res.status === 400) return { ok: false, reason: "not_found" };
    if (!res.ok) return { ok: false, reason: "unavailable" };
    const body = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
    if (!body.title) return { ok: false, reason: "unavailable" };
    return {
      ok: true,
      meta: {
        provider: "youtube",
        mediaId: videoId,
        title: body.title,
        artists: body.author_name ? [cleanChannelName(body.author_name)] : [],
        durationMs,
        artworkUrl: body.thumbnail_url ?? null,
        source: "youtube",
      },
    };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
