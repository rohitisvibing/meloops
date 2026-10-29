"use client";

import { useEffect, useState } from "react";
import { mediaKey, type MediaProvider } from "@/lib/media/types";
import type { TrackMeta } from "@/lib/providers/types";

export type Resolved = { meta: TrackMeta | null; reason?: string; message?: string };

/** In-memory only, for this tab. The server caches provider responses for 24 h. */
const cache = new Map<string, Promise<Resolved>>();

export function resolveTrack(provider: MediaProvider, mediaId: string): Promise<Resolved> {
  const key = mediaKey({ provider, mediaId });
  let pending = cache.get(key);
  if (!pending) {
    pending = fetch(`/api/tracks/resolve?provider=${provider}&id=${mediaId}`)
      .then((res) => res.json())
      .then((body: { ok: boolean; meta?: TrackMeta | null; reason?: string; message?: string }) => ({
        meta: body.ok ? (body.meta ?? null) : null,
        reason: body.reason,
        message: body.message,
      }))
      .catch(() => ({ meta: null, message: "Couldn't reach the server." }));
    cache.set(key, pending);
  }
  return pending;
}

export function useTrackMeta(provider: MediaProvider | null | undefined, mediaId: string | null | undefined) {
  const [meta, setMeta] = useState<TrackMeta | null>(null);
  useEffect(() => {
    if (!provider || !mediaId) return;
    let live = true;
    resolveTrack(provider, mediaId).then((r) => live && setMeta(r.meta));
    return () => {
      live = false;
    };
  }, [provider, mediaId]);
  return meta;
}
