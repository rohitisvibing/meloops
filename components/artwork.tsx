"use client";

import { useTrackMeta } from "@/lib/client/use-track-meta";
import type { MediaProvider } from "@/lib/media/types";

/** Song artwork from YouTube or Spotify when available; otherwise the title's initial on an LCD block. */
export function Artwork({
  provider,
  mediaId,
  title,
  size = 52,
}: {
  provider: MediaProvider;
  mediaId: string;
  title: string;
  size?: number;
}) {
  const meta = useTrackMeta(provider, mediaId);
  return (
    <span
      className="art"
      data-provider={provider}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden="true"
    >
      {meta?.artworkUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={meta.artworkUrl} alt="" loading="lazy" />
      ) : (
        title.trim().charAt(0).toUpperCase() || "♪"
      )}
    </span>
  );
}

export function Cover({ title, style, className = "" }: { title: string; style: number; className?: string }) {
  return (
    <div className={`cover cover-${((style % 4) + 4) % 4} ${className}`} aria-hidden="true">
      <span className="cover-initial">{title.trim().charAt(0).toUpperCase() || "M"}</span>
    </div>
  );
}
