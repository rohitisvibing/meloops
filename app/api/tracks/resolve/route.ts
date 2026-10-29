import { NextResponse, type NextRequest } from "next/server";
import { isValidMediaRef } from "@/lib/media/types";
import { getTrackMetadata } from "@/lib/spotify/server/metadata";
import { getYouTubeMetadata } from "@/lib/youtube/server/metadata";

const MESSAGES = {
  not_found: "Couldn't find this song. Check the link, or enter the details yourself.",
  unavailable: "Song details can't be loaded right now. You can still save it by entering them yourself.",
  rate_limited: "Spotify is busy. Enter the details yourself or try again in a minute.",
  not_configured: "Song details can't be loaded here. Enter the title and artist yourself.",
  not_embeddable: "The uploader doesn't allow this video to play in other apps, so it will open on YouTube instead.",
} as const;

/** Song details for a pasted link: GET /api/tracks/resolve?provider=youtube&id=dQw4w9WgXcQ */
export async function GET(request: NextRequest) {
  const provider = request.nextUrl.searchParams.get("provider") ?? "spotify";
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!isValidMediaRef(provider, id)) {
    return NextResponse.json({ ok: false, message: "That song link looks incomplete." }, { status: 400 });
  }

  const result = provider === "youtube" ? await getYouTubeMetadata(id) : await getTrackMetadata(id);
  if (!result.ok) {
    return NextResponse.json({ ok: true, provider, mediaId: id, meta: null, reason: result.reason, message: MESSAGES[result.reason] });
  }
  return NextResponse.json(
    { ok: true, provider, mediaId: id, meta: result.meta },
    { headers: { "Cache-Control": "private, max-age=3600" } },
  );
}
