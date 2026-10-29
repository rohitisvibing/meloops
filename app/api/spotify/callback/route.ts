import type { NextRequest } from "next/server";
import { spotifyCredentials } from "@/lib/spotify/server/config";
import { relativeRedirect } from "@/lib/request-origin";
import { unseal } from "@/lib/spotify/server/seal";
import { fetchProfile, PKCE_COOKIE, requestToken, writeSession } from "@/lib/spotify/server/session";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const pkce = unseal<{ verifier: string; state: string; next: string }>(request.cookies.get(PKCE_COOKIE)?.value);
  const back = (status: string, path = pkce?.next ?? "/profile") => {
    const target = new URL(path, "http://x");
    target.searchParams.set("spotify", status);
    const res = relativeRedirect(`${target.pathname}${target.search}`);
    res.cookies.delete({ name: PKCE_COOKIE, path: "/api/spotify" });
    return res;
  };

  const creds = spotifyCredentials();
  if (!creds || !pkce) return back("error");
  if (params.get("error")) return back(params.get("error") === "access_denied" ? "denied" : "error");
  if (params.get("state") !== pkce.state || !params.get("code")) return back("error");

  try {
    const token = await requestToken(
      new URLSearchParams({
        grant_type: "authorization_code",
        code: params.get("code")!,
        redirect_uri: creds.redirectUri,
        code_verifier: pkce.verifier,
      }),
    );
    if (!token.refresh_token) return back("error");
    const profile = await fetchProfile(token.access_token);
    await writeSession({
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + token.expires_in * 1000,
      scopes: token.scope,
      product: profile.product,
      displayName: profile.displayName,
    });
    return back("connected");
  } catch {
    return back("error");
  }
}
