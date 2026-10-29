"use client";

/** Per-device choices about the Spotify prompts. Storage can be unavailable (private mode). */
const KEYS = { step: "meloops.spotifyPrompt", card: "meloops.spotifyCard" } as const;

export function isSpotifyPromptHidden(which: keyof typeof KEYS): boolean {
  try {
    return window.localStorage.getItem(KEYS[which]) !== null;
  } catch {
    return false;
  }
}

export function hideSpotifyPrompt(which: keyof typeof KEYS) {
  try {
    window.localStorage.setItem(KEYS[which], "hidden");
  } catch {
    // Not remembered; the prompt may show again next time.
  }
}

/** Only same-site paths, so `next` can't send anyone elsewhere. */
export function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}
