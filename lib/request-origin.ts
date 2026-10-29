import { NextResponse } from "next/server";

/**
 * Redirect with a relative Location header. Next rewrites absolute same-site redirect URLs
 * to "localhost" in development even when the browser is on 127.0.0.1, and the two are
 * separate sites to the browser, so cookies (Supabase session, Spotify connection) would
 * split. A relative Location always resolves against the origin the browser is using.
 */
export function relativeRedirect(path: string, init?: { status?: number }): NextResponse {
  const location = path.startsWith("/") && !path.startsWith("//") ? path : "/";
  return new NextResponse(null, { status: init?.status ?? 307, headers: { Location: location } });
}

