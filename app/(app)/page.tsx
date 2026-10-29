"use client";

import Link from "next/link";
import { useState } from "react";
import { PasteDeck } from "@/components/paste-deck";
import { PlaylistShelf } from "@/components/playlist-shelf";
import { SegmentEditSheet } from "@/components/segment-edit-sheet";
import { SegmentRow } from "@/components/segment-row";
import { segmentToQueueItem, usePlayer } from "@/lib/client/player-context";
import { useMutation, useRepo, useRepoQuery } from "@/lib/client/repo-context";
import type { Segment } from "@/lib/data/types";
import { isDemoMode } from "@/lib/env";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function HomePage() {
  const { user } = useRepo();
  const player = usePlayer();
  const mutate = useMutation();
  const [editing, setEditing] = useState<Segment | null>(null);
  const { data } = useRepoQuery(async (repo) => {
    const [playlists, favorites, recent] = await Promise.all([
      repo.listPlaylists(),
      repo.listSegments({ favoritesOnly: true, limit: 5 }),
      repo.listSegments({ limit: 5 }),
    ]);
    const recentlyPlayed = playlists
      .filter((p) => p.lastPlayedAt)
      .sort((a, b) => (a.lastPlayedAt! < b.lastPlayedAt! ? 1 : -1));
    return { playlists, recentlyPlayed, favorites, recent };
  });

  const firstName = user?.name?.split(" ")[0];
  const shelf = data ? (data.recentlyPlayed.length ? data.recentlyPlayed : data.playlists).slice(0, 8) : [];

  const playOne = (s: Segment) =>
    player.play([segmentToQueueItem(s)]);

  const rows = (list: Segment[]) => (
    <ul className="rows">
      {list.map((s) => (
        <SegmentRow
          key={s.id}
          segment={s}
          onOpen={() => setEditing(s)}
          onPlay={() => playOne(s)}
          onToggleFavorite={() => mutate((r) => r.setFavorite(s.id, !s.isFavorite))}
        />
      ))}
    </ul>
  );

  return (
    <>
      <header className="page-head">
        {isDemoMode && <span className="demo-badge">Demo: saved on this device</span>}
        <h1 className="page-title display" style={{ marginTop: isDemoMode ? 10 : 0 }}>
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
        </h1>
      </header>

      <PasteDeck />

      {data && shelf.length > 0 && (
        <section className="section">
          <div className="section-row">
            <h2 className="section-title display">{data.recentlyPlayed.length ? "Recently played" : "Your playlists"}</h2>
            <Link href="/library" className="label" style={{ color: "var(--link)" }}>
              See all
            </Link>
          </div>
          <PlaylistShelf playlists={shelf} />
        </section>
      )}

      {data && data.favorites.length > 0 && (
        <section className="section">
          <h2 className="section-title display">Favourite moments</h2>
          {rows(data.favorites)}
        </section>
      )}

      {data && (
        <section className="section">
          <h2 className="section-title display">Recently added</h2>
          {data.recent.length ? (
            rows(data.recent)
          ) : (
            <div className="empty">
              <p>No moments yet. Paste a Spotify song link above, then pick the part you love.</p>
            </div>
          )}
        </section>
      )}

      <SegmentEditSheet segment={editing} onClose={() => setEditing(null)} />
    </>
  );
}
