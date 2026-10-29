import { isValidMediaRef, type MediaProvider } from "@/lib/media/types";
import type { Playlist, SharedPlaylist } from "./types";

/**
 * Demo-mode share links carry the playlist in the URL: media IDs, user labels and
 * timestamps only. Prefixed with "d." so they can't collide with server slugs.
 */
const PREFIX = "d.";

type Row = [provider: "y" | "s", mediaId: string, title: string, artist: string, durationMs: number | null, startMs: number, endMs: number];
/** Links made before YouTube support: Spotify only, no provider column. */
type LegacyRow = [mediaId: string, title: string, artist: string, durationMs: number | null, startMs: number, endMs: number];

type Payload = { t: string; d: string; c: number; i: (Row | LegacyRow)[] };

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

export function isLocalShareSlug(slug: string): boolean {
  return slug.startsWith(PREFIX);
}

export function encodeSharePayload(playlist: Playlist): string {
  const payload: Payload = {
    t: playlist.title,
    d: playlist.description,
    c: playlist.coverStyle,
    i: playlist.items.map(({ segment: s }): Row => [
      s.track.provider === "youtube" ? "y" : "s",
      s.track.mediaId,
      s.track.title,
      s.track.artist,
      s.track.durationMs,
      s.startMs,
      s.endMs,
    ]),
  };
  return PREFIX + toBase64Url(JSON.stringify(payload));
}

function normalize(row: Row | LegacyRow): Row {
  return row.length === 7 ? row : ["s", ...row];
}

export function decodeSharePayload(slug: string): SharedPlaylist | null {
  if (!isLocalShareSlug(slug)) return null;
  try {
    const payload = JSON.parse(fromBase64Url(slug.slice(PREFIX.length))) as Payload;
    if (typeof payload.t !== "string" || !Array.isArray(payload.i)) return null;
    return {
      slug,
      title: payload.t.slice(0, 80),
      description: String(payload.d ?? "").slice(0, 300),
      coverStyle: Number(payload.c) || 0,
      ownerName: null,
      isOwner: false,
      items: payload.i
        .filter((row) => Array.isArray(row))
        .map(normalize)
        .flatMap(([p, mediaId, title, artist, durationMs, startMs, endMs]) => {
          const provider: MediaProvider = p === "y" ? "youtube" : "spotify";
          if (!isValidMediaRef(provider, mediaId)) return [];
          return [
            {
              provider,
              mediaId,
              title: String(title).slice(0, 200),
              artist: String(artist).slice(0, 200),
              durationMs: typeof durationMs === "number" ? durationMs : null,
              startMs: Number(startMs),
              endMs: Number(endMs),
            },
          ];
        }),
    };
  } catch {
    return null;
  }
}
