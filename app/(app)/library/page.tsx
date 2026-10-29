"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useId, useMemo, useState } from "react";
import { Cover } from "@/components/artwork";
import { PlusIcon, SearchIcon } from "@/components/icons";
import { SegmentEditSheet } from "@/components/segment-edit-sheet";
import { SegmentRow } from "@/components/segment-row";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { segmentToQueueItem, usePlayer } from "@/lib/client/player-context";
import { useMutation, useRepoQuery } from "@/lib/client/repo-context";
import type { Segment } from "@/lib/data/types";
import { formatDuration } from "@/lib/time";

type Tab = "playlists" | "moments";
type Filter = "all" | "favorites" | "liked" | "disliked";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "favorites", label: "Favourites" },
  { id: "liked", label: "Liked" },
  { id: "disliked", label: "Disliked" },
];

function matches(query: string, ...fields: string[]) {
  const q = query.trim().toLowerCase();
  return !q || fields.some((f) => f.toLowerCase().includes(q));
}

function LibraryView() {
  const params = useSearchParams();
  const router = useRouter();
  const player = usePlayer();
  const mutate = useMutation();
  const searchId = useId();
  const tab: Tab = params.get("tab") === "moments" ? "moments" : "playlists";
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<Segment | null>(null);
  const [creating, setCreating] = useState(false);

  const { data } = useRepoQuery(async (repo) => {
    const [playlists, segments] = await Promise.all([repo.listPlaylists(), repo.listSegments()]);
    return { playlists, segments };
  });

  const playlists = useMemo(
    () => (data?.playlists ?? []).filter((p) => matches(query, p.title, p.description)),
    [data, query],
  );
  const segments = useMemo(
    () =>
      (data?.segments ?? []).filter((s) => {
        if (filter === "favorites" && !s.isFavorite) return false;
        if (filter === "liked" && s.reaction !== "like") return false;
        if (filter === "disliked" && s.reaction !== "dislike") return false;
        return matches(query, s.track.title, s.track.artist, s.note);
      }),
    [data, query, filter],
  );

  const setTab = (next: Tab) => router.replace(next === "moments" ? "/library?tab=moments" : "/library");

  return (
    <>
      <header className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="page-title display">Library</h1>
        <button className="btn btn-shell btn-sm" onClick={() => setCreating(true)}>
          <PlusIcon size={16} /> New playlist
        </button>
      </header>

      <div role="tablist" aria-label="Library" className="chip-row" style={{ marginBottom: 14 }}>
        {(["playlists", "moments"] as const).map((t) => (
          <button key={t} role="tab" className="chip" aria-selected={tab === t} onClick={() => setTab(t)}>
            {t === "playlists" ? `Playlists ${data ? data.playlists.length : ""}` : `Moments ${data ? data.segments.length : ""}`}
          </button>
        ))}
      </div>

      <div style={{ position: "relative", marginBottom: 14 }}>
        <label htmlFor={searchId} className="sr-only">
          Search {tab}
        </label>
        <SearchIcon size={20} style={{ position: "absolute", left: 14, top: 14, color: "var(--ink-soft)" }} />
        <input
          id={searchId}
          className="input"
          type="search"
          style={{ paddingLeft: 44 }}
          placeholder={tab === "playlists" ? "Search playlists" : "Search songs, artists, notes"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {tab === "moments" && (
        <div className="chip-row" style={{ marginBottom: 14 }} role="group" aria-label="Filter moments">
          {FILTERS.map((f) => (
            <button key={f.id} className="chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {data && tab === "playlists" && (
        playlists.length ? (
          <ul className="rows">
            {playlists.map((p) => (
              <li key={p.id} className="row">
                <Link href={`/p/${p.id}`} className="row-main" style={{ display: "flex", gap: 12, alignItems: "center", textDecoration: "none" }}>
                  <div style={{ width: 56, flex: "none" }}>
                    <Cover title={p.title} style={p.coverStyle} className="cover-sm" />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="row-title">{p.title}</div>
                    <div className="row-sub">
                      {p.segmentCount} {p.segmentCount === 1 ? "moment" : "moments"}, {formatDuration(p.totalMs)}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty">
            <p>{query ? `No playlists match “${query}”.` : "No playlists yet. Make one to start collecting moments."}</p>
            {!query && (
              <button className="btn btn-primary" onClick={() => setCreating(true)}>
                New playlist
              </button>
            )}
          </div>
        )
      )}

      {data && tab === "moments" && (
        segments.length ? (
          <ul className="rows">
            {segments.map((s) => (
              <SegmentRow
                key={s.id}
                segment={s}
                onOpen={() => setEditing(s)}
                onPlay={() =>
                  player.play([segmentToQueueItem(s)])
                }
                onToggleFavorite={() => mutate((r) => r.setFavorite(s.id, !s.isFavorite))}
              />
            ))}
          </ul>
        ) : (
          <div className="empty">
            <p>{query || filter !== "all" ? "No moments match." : "No moments yet."}</p>
            <Link className="btn btn-primary" href="/create">
              Add a song
            </Link>
          </div>
        )
      )}

      <SegmentEditSheet
        segment={editing ? data?.segments.find((s) => s.id === editing.id) ?? null : null}
        onClose={() => setEditing(null)}
      />
      <NewPlaylistSheet open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function NewPlaylistSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mutate = useMutation();
  const toast = useToast();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  return (
    <Sheet open={open} onClose={onClose} title="New playlist">
      <form
        style={{ display: "grid", gap: 14 }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return setError("Give the playlist a name.");
          const playlist = await mutate((r) => r.createPlaylist({ title: title.trim(), description: "" }));
          toast("Playlist created");
          setTitle("");
          onClose();
          router.push(`/p/${playlist.id}`);
        }}
      >
        <div className="field">
          <label htmlFor={id} className="field-label label">
            Name
          </label>
          <input
            id={id}
            className="input"
            maxLength={80}
            placeholder="e.g. Chorus drops"
            value={title}
            aria-invalid={Boolean(error)}
            onChange={(e) => {
              setTitle(e.target.value);
              setError(null);
            }}
          />
          {error && <p className="field-error">{error}</p>}
        </div>
        <button type="submit" className="btn btn-primary btn-block">
          Create playlist
        </button>
      </form>
    </Sheet>
  );
}

export default function LibraryPage() {
  return (
    <Suspense>
      <LibraryView />
    </Suspense>
  );
}
