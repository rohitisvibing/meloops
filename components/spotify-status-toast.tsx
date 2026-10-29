"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { usePlayer } from "@/lib/client/player-context";
import { useToast } from "./toast";

export const SPOTIFY_MESSAGES: Record<string, string> = {
  connected: "Spotify connected. Full songs play here now.",
  connected_free: "Spotify connected. Full songs need Premium; previews and Open in Spotify still work.",
  denied: "Spotify connection cancelled.",
  not_allowed: "This Spotify account isn't on Meloops' allowed list yet. Ask the app owner to add it in the Spotify dashboard.",
  error: "Spotify didn't connect. Try again.",
};

/** Shows the result of the Spotify sign-in redirect once, wherever it lands, then cleans the URL. */
function SpotifyStatus() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const toast = useToast();
  const { reloadConnection } = usePlayer();
  const status = params.get("spotify");

  useEffect(() => {
    if (!status) return;
    toast(SPOTIFY_MESSAGES[status] ?? SPOTIFY_MESSAGES.error);
    void reloadConnection();
    const rest = new URLSearchParams(params);
    rest.delete("spotify");
    router.replace(rest.size ? `${path}?${rest}` : path);
  }, [status, params, path, router, toast, reloadConnection]);

  return null;
}

export function SpotifyStatusToast() {
  return (
    <Suspense>
      <SpotifyStatus />
    </Suspense>
  );
}
