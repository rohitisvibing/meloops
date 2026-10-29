"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useId, useState } from "react";
import { Artwork } from "@/components/artwork";
import { PasteDeck } from "@/components/paste-deck";
import { SegmentForm } from "@/components/segment-form";
import { useToast } from "@/components/toast";
import { useMutation, useRepoQuery } from "@/lib/client/repo-context";
import { resolveTrack } from "@/lib/client/use-track-meta";
import { mediaUrl, openLabel } from "@/lib/media/links";
import { isValidMediaRef, PROVIDER_LABEL, type MediaProvider } from "@/lib/media/types";
import type { TrackMeta } from "@/lib/providers/types";

const NEW_PLAYLIST = "__new__";

function CreateFlow() {
  const params = useSearchParams();
  // `track` is the pre-YouTube parameter for Spotify IDs.
  const provider = params.get("provider") ?? (params.get("track") ? "spotify" : null);
  const mediaId = params.get("id") ?? params.get("track");
  const valid = isValidMediaRef(provider, mediaId);
  const startParam = Number(params.get("t"));

  if (!mediaId || !valid) {
    return (
      <>
        <header className="page-head">
          <h1 className="page-title display">Add a song</h1>
          <p className="muted">Paste a YouTube or Spotify song link, then mark the part you want to keep.</p>
        </header>
        <PasteDeck title="Song link" playlistId={params.get("playlist") ?? undefined} />
        {mediaId && !valid && (
          <p className="field-error" role="alert" style={{ marginTop: 12 }}>
            That song link looks incomplete. Copy it again from the app&apos;s Share button.
          </p>
        )}
      </>
    );
  }
  return (
    <MomentEditor
      key={`${provider}:${mediaId}`}
      provider={provider}
      mediaId={mediaId!}
      initialStartMs={Number.isFinite(startParam) && startParam > 0 ? startParam : null}
      initialPlaylist={params.get("playlist")}
    />
  );
}

function MomentEditor({
  provider,
  mediaId,
  initialStartMs,
  initialPlaylist,
}: {
  provider: MediaProvider;
  mediaId: string;
  initialStartMs: number | null;
  initialPlaylist: string | null;
}) {
  const router = useRouter();
  const mutate = useMutation();
  const toast = useToast();
  const ids = { title: useId(), playlist: useId(), newName: useId() };

  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<TrackMeta | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [detectedMs, setDetectedMs] = useState<number | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [playlistId, setPlaylistId] = useState<string>(initialPlaylist ?? "");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: playlists } = useRepoQuery((repo) => repo.listPlaylists());

  useEffect(() => {
    let live = true;
    resolveTrack(provider, mediaId).then((r) => {
      if (!live) return;
      setLoading(false);
      setMeta(r.meta);
      if (r.meta) {
        setTitle(r.meta.title);
        setArtist(r.meta.artists.join(", "));
      } else {
        setNotice(r.message ?? "Song details can't be loaded.");
      }
    });
    return () => {
      live = false;
    };
  }, [provider, mediaId]);

  useEffect(() => {
    if (!initialPlaylist && playlists?.length && !playlistId) setPlaylistId(playlists[0].id);
  }, [playlists, initialPlaylist, playlistId]);

  // Length comes from the song's details, or from the player once it has loaded the song.
  const durationMs = meta?.durationMs ?? detectedMs;

  const save = async (value: { startMs: number; endMs: number; note: string }) => {
    if (!title.trim()) {
      setTitleError("Name the song so you can find it later.");
      return;
    }
    if (playlistId === NEW_PLAYLIST && !newName.trim()) {
      toast("Name the new playlist first.");
      return;
    }
    setBusy(true);
    try {
      let target: string | null = playlistId || null;
      if (playlistId === NEW_PLAYLIST) {
        target = (await mutate((r) => r.createPlaylist({ title: newName.trim(), description: "" }))).id;
      }
      await mutate((r) =>
        r.saveSegment({
          provider,
          mediaId,
          title: title.trim(),
          artist: artist.trim(),
          durationMs,
          playlistId: target,
          ...value,
        }),
      );
      toast("Moment saved");
      router.push(target ? `/p/${target}` : "/library?tab=moments");
    } catch (err) {
      toast((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <>
      <header className="page-head" style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <Artwork provider={provider} mediaId={mediaId} title={title || "?"} size={72} />
        <div style={{ minWidth: 0 }}>
          <h1 className="display" style={{ fontSize: "var(--t-xl)" }}>
            {loading ? "Finding song…" : title || "New moment"}
          </h1>
          <p className="muted" style={{ fontSize: "var(--t-sm)" }}>
            <span className="provider-tag" data-provider={provider}>
              {PROVIDER_LABEL[provider]}
            </span>{" "}
            <a href={mediaUrl({ provider, mediaId })} target="_blank" rel="noopener" style={{ color: "inherit" }}>
              {openLabel({ provider })}
            </a>
          </p>
        </div>
      </header>

      {notice && (
        <p className="empty" role="status" style={{ marginBottom: 16 }}>
          {notice}
        </p>
      )}

      {!loading && !meta && (
        <div className="field" style={{ marginBottom: 20 }}>
          <label htmlFor={ids.title} className="field-label label">
            Song title
          </label>
          <input
            id={ids.title}
            className="input"
            value={title}
            maxLength={200}
            aria-invalid={Boolean(titleError)}
            aria-describedby={`${ids.title}-hint`}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleError(null);
            }}
          />
          <p id={`${ids.title}-hint`} className={titleError ? "field-error" : "muted"} style={{ fontSize: "var(--t-sm)" }}>
            {titleError ?? "We couldn't load this song's details. Name it so you can find it later."}
          </p>
        </div>
      )}

      {!loading && (
        <SegmentForm
          provider={provider}
          mediaId={mediaId}
          title={title}
          artist={artist}
          durationMs={durationMs}
          initial={{ startMs: initialStartMs ?? 30_000, endMs: (initialStartMs ?? 30_000) + 30_000, note: "" }}
          onDurationDetected={setDetectedMs}
          submitLabel="Save moment"
          busy={busy}
          onSubmit={save}
          onCancel={() => router.back()}
        >
          <div className="field">
            <label htmlFor={ids.playlist} className="field-label label">
              Add to playlist
            </label>
            <select id={ids.playlist} className="input" value={playlistId} onChange={(e) => setPlaylistId(e.target.value)}>
              <option value="">Library only</option>
              {playlists?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
              <option value={NEW_PLAYLIST}>New playlist…</option>
            </select>
          </div>
          {playlistId === NEW_PLAYLIST && (
            <div className="field">
              <label htmlFor={ids.newName} className="field-label label">
                New playlist name
              </label>
              <input id={ids.newName} className="input" maxLength={80} value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
          )}
        </SegmentForm>
      )}
    </>
  );
}

export default function CreatePage() {
  return (
    <Suspense>
      <CreateFlow />
    </Suspense>
  );
}
