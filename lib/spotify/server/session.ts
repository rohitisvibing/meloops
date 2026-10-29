import "server-only";
import { cookies } from "next/headers";
import { basicAuth, SPOTIFY_ACCOUNTS, SPOTIFY_API, spotifyCredentials } from "./config";
import { seal, unseal } from "./seal";

/**
 * The Spotify connection lives in its own sealed, httpOnly cookie on this device.
 * It is independent of the Google account: connecting or disconnecting never
 * touches the user's Meloops data.
 */
export const SESSION_COOKIE = "ml_spotify";
export const PKCE_COOKIE = "ml_spotify_pkce";

export type SpotifySession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string;
  product: string | null;
  displayName: string | null;
};

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export async function readSession(): Promise<SpotifySession | null> {
  return unseal<SpotifySession>((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function writeSession(session: SpotifySession) {
  (await cookies()).set(SESSION_COOKIE, seal(session), { ...COOKIE_OPTS, maxAge: 60 * 60 * 24 * 60 });
}

export async function clearSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
};

export async function requestToken(body: URLSearchParams): Promise<TokenResponse> {
  const creds = spotifyCredentials();
  if (!creds) throw new Error("Spotify is not configured on this server.");
  const res = await fetch(`${SPOTIFY_ACCOUNTS}/api/token`, {
    method: "POST",
    headers: {
      Authorization: basicAuth(creds.clientId, creds.clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Spotify token request failed (${res.status})`);
  return (await res.json()) as TokenResponse;
}

/**
 * The connected account's plan and name. `status` 403 means the account isn't on the app's
 * User Management list (Spotify Development Mode allows up to 5 listed users).
 */
export async function fetchProfile(accessToken: string) {
  const res = await fetch(`${SPOTIFY_API}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) return { status: res.status, product: null, displayName: null };
  const me = (await res.json()) as { product?: string; display_name?: string };
  return { status: res.status, product: me.product ?? null, displayName: me.display_name ?? null };
}

/** Returns a session with a valid access token, refreshing it when it expires within a minute. */
export async function freshSession(): Promise<SpotifySession | null> {
  const session = await readSession();
  if (!session) return null;
  if (session.expiresAt - Date.now() > 60_000) return session;

  try {
    const token = await requestToken(
      new URLSearchParams({ grant_type: "refresh_token", refresh_token: session.refreshToken }),
    );
    const next: SpotifySession = {
      ...session,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? session.refreshToken,
      expiresAt: Date.now() + token.expires_in * 1000,
      scopes: token.scope || session.scopes,
    };
    await writeSession(next);
    return next;
  } catch {
    // Refresh token revoked or expired: drop the connection, keep everything else.
    await clearSession();
    return null;
  }
}
