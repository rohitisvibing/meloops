import { NextResponse } from "next/server";
import { freshSession } from "@/lib/spotify/server/session";

/** Hands the Web Playback SDK a short-lived access token. The refresh token never leaves the server. */
export async function GET() {
  const session = await freshSession();
  if (!session) return NextResponse.json({ error: "not_connected" }, { status: 401 });
  return NextResponse.json(
    { accessToken: session.accessToken, expiresAt: session.expiresAt, product: session.product },
    { headers: { "Cache-Control": "no-store" } },
  );
}
