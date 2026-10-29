"use client";

export function shareUrl(slug: string): string {
  return `${window.location.origin}/s/${slug}`;
}

/** Uses the native share sheet when available, otherwise copies. Returns a status message. */
export async function sharePlaylistLink(title: string, url: string): Promise<string> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text: `${title} on Meloops`, url });
      return "Link shared";
    } catch (err) {
      if ((err as Error).name === "AbortError") return "Sharing cancelled";
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "Link copied";
  } catch {
    return "Couldn't copy. Select the link and copy it.";
  }
}
