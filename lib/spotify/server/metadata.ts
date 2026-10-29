import "server-only";
import type { TrackMeta } from "@/lib/providers/types";
import { basicAuth, SPOTIFY_ACCOUNTS, SPOTIFY_API, spotifyCredentials } from "./config";

/**
 * Track metadata from documented endpoints only:
 * - GET /v1/tracks/{id} with a client-credentials token (title, artists, duration, artwork)
 * - oEmbed (title + thumbnail) as a fallback
 * Responses are cached by Next's fetch cache for 24 hours, never stored in our database.
 */
const DAY = 60 * 60 * 24;
let appToken: { value: string; expiresAt: number } | null = null;

async function clientCredentialsToken(): Promise<string | null> {
  const creds = spotifyCredentials();
  if (!creds) return null;
  if (appToken && appToken.expiresAt - Date.now() > 60_000) return appToken.value;
  const res = await fetch(`${SPOTIFY_ACCOUNTS}/api/token`, {
    method: "POST",
    headers: {
      Authorization: basicAuth(creds.clientId, creds.clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { access_token: string; expires_in: number };
  appToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return appToken.value;
}

export type MetadataResult =
  | { ok: true; meta: TrackMeta }
  | { ok: false; reason: "not_found" | "unavailable" | "rate_limited" | "not_configured" };

async function fromWebApi(mediaId: string): Promise<MetadataResult> {
  const token = await clientCredentialsToken();
  if (!token) return { ok: false, reason: "not_configured" };
  const market = process.env.SPOTIFY_MARKET ?? "IN";
  const res = await fetch(`${SPOTIFY_API}/tracks/${mediaId}?market=${market}`, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: DAY },
  });
  if (res.status === 404 || res.status === 400) return { ok: false, reason: "not_found" };
  if (res.status === 429) return { ok: false, reason: "rate_limited" };
  if (!res.ok) return { ok: false, reason: "unavailable" };
  const track = (await res.json()) as {
    name: string;
    duration_ms: number;
    artists: { name: string }[];
    album: { images: { url: string; width: number }[] };
    is_playable?: boolean;
  };
  if (track.is_playable === false) return { ok: false, reason: "unavailable" };
  const images = [...(track.album?.images ?? [])].sort((a, b) => b.width - a.width);
  return {
    ok: true,
    meta: {
      provider: "spotify",
      mediaId,
      title: track.name,
      artists: track.artists.map((a) => a.name),
      durationMs: track.duration_ms,
      artworkUrl: images.find((i) => i.width <= 640)?.url ?? images[0]?.url ?? null,
      source: "spotify",
    },
  };
}

async function fromOEmbed(mediaId: string): Promise<MetadataResult> {
  const url = `https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/track/${mediaId}`)}`;
  const res = await fetch(url, { next: { revalidate: DAY } });
  if (res.status === 404) return { ok: false, reason: "not_found" };
  if (!res.ok) return { ok: false, reason: "unavailable" };
  const body = (await res.json()) as { title?: string; thumbnail_url?: string };
  if (!body.title) return { ok: false, reason: "unavailable" };
  return {
    ok: true,
    meta: {
      provider: "spotify",
      mediaId,
      title: body.title,
      artists: [],
      durationMs: null,
      artworkUrl: body.thumbnail_url ?? null,
      source: "spotify",
    },
  };
}

export async function getTrackMetadata(mediaId: string): Promise<MetadataResult> {
  try {
    const primary = await fromWebApi(mediaId);
    if (primary.ok || primary.reason === "not_found") return primary;
    const fallback = await fromOEmbed(mediaId);
    return fallback.ok ? fallback : primary;
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
