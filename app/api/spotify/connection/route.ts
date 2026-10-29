import { NextResponse } from "next/server";
import { spotifyCredentials } from "@/lib/spotify/server/config";
import { clearSession, readSession } from "@/lib/spotify/server/session";

export async function GET() {
  const configured = spotifyCredentials() !== null;
  const session = configured ? await readSession() : null;
  return NextResponse.json(
    {
      configured,
      connected: session !== null,
      product: session?.product ?? null,
      displayName: session?.displayName ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Disconnects Spotify on this device. Playlists and the Meloops account are untouched. */
export async function DELETE() {
  await clearSession();
  return NextResponse.json({ connected: false });
}
