import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { SPOTIFY_ACCOUNTS, SPOTIFY_SCOPES, spotifyCredentials } from "@/lib/spotify/server/config";
import { seal } from "@/lib/spotify/server/seal";
import { PKCE_COOKIE } from "@/lib/spotify/server/session";

/** Starts Spotify authorization (Authorization Code + PKCE). Only reached from an explicit user tap. */
export async function GET(request: NextRequest) {
  const creds = spotifyCredentials();
  if (!creds) {
    return NextResponse.json({ error: "Spotify is not configured on this server." }, { status: 503 });
  }

  // The PKCE cookie set here must be readable when Spotify returns to the redirect URI,
  // so the browser has to be on that same origin (e.g. 127.0.0.1, not localhost).
  const expectedHost = new URL(creds.redirectUri).host;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host && host !== expectedHost) {
    const origin = new URL(creds.redirectUri).origin;
    return new NextResponse(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Open Meloops at ${origin}</title><body style="font:16px system-ui;padding:24px;max-width:36rem"><p>Spotify sends you back to <b>${origin}</b>, so connect from there.</p><p><a href="${origin}/profile">Open Meloops at ${origin}</a></p></body>`,
      { status: 409, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  const next = request.nextUrl.searchParams.get("next") ?? "/";
  const verifier = randomBytes(48).toString("base64url");
  const state = randomBytes(16).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  const url = new URL(`${SPOTIFY_ACCOUNTS}/authorize`);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: creds.clientId,
    redirect_uri: creds.redirectUri,
    scope: SPOTIFY_SCOPES,
    state,
    code_challenge_method: "S256",
    code_challenge: challenge,
  }).toString();

  const response = NextResponse.redirect(url);
  response.cookies.set(PKCE_COOKIE, seal({ verifier, state, next: next.startsWith("/") ? next : "/" }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/spotify",
    maxAge: 600,
  });
  return response;
}
