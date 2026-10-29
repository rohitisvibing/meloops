import "server-only";

export const SPOTIFY_ACCOUNTS = "https://accounts.spotify.com";
export const SPOTIFY_API = "https://api.spotify.com/v1";

/**
 * Minimum scopes for in-app segment playback:
 * - streaming: Web Playback SDK device
 * - user-read-private: `product` on /me, to check for Premium before offering playback
 * - user-modify-playback-state: start at position_ms, pause, seek
 * - user-read-playback-state: read position for segment-end detection
 * Override with SPOTIFY_SCOPES if SDK init needs more (see docs/spotify-feasibility.md).
 */
export const SPOTIFY_SCOPES =
  process.env.SPOTIFY_SCOPES ??
  "streaming user-read-private user-modify-playback-state user-read-playback-state";

export function spotifyCredentials() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function basicAuth(clientId: string, clientSecret: string) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}
