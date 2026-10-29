export type MediaProvider = "youtube" | "spotify";

export type MediaRef = { provider: MediaProvider; mediaId: string };

export const MEDIA_ID_RE: Record<MediaProvider, RegExp> = {
  spotify: /^[A-Za-z0-9]{22}$/,
  youtube: /^[A-Za-z0-9_-]{11}$/,
};

export const PROVIDER_LABEL: Record<MediaProvider, string> = {
  youtube: "YouTube",
  spotify: "Spotify",
};

export function isMediaProvider(value: unknown): value is MediaProvider {
  return value === "youtube" || value === "spotify";
}

export function isValidMediaRef(provider: unknown, mediaId: unknown): provider is MediaProvider {
  return isMediaProvider(provider) && typeof mediaId === "string" && MEDIA_ID_RE[provider].test(mediaId);
}

export function mediaKey(ref: MediaRef): string {
  return `${ref.provider}:${ref.mediaId}`;
}
