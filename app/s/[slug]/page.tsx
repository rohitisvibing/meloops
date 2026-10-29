"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Artwork, Cover } from "@/components/artwork";
import { ExternalIcon, PlayIcon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { sharedToQueueItem, usePlayer, type QueueItem } from "@/lib/client/player-context";
import { useRepo, useRepoQuery } from "@/lib/client/repo-context";
import type { SharedPlaylist } from "@/lib/data/types";
import { isDemoMode } from "@/lib/env";
import { mediaUrl, openLabel } from "@/lib/media/links";
import { formatDuration, formatTimecode } from "@/lib/time";

function toQueue(p: SharedPlaylist): QueueItem[] {
  return p.items.map(sharedToQueueItem);
}

export default function SharedPlaylistPage() {
  const { slug } = useParams<{ slug: string }>();
  const { repo, user } = useRepo();
  const player = usePlayer();
  const toast = useToast();
  const [saved, setSaved] = useState(false);
  const { data: playlist, loading } = useRepoQuery((r) => r.getShared(decodeURIComponent(slug)), [slug]);

  if (loading && !playlist) return <p className="page-head muted">Loading playlist…</p>;
  if (!playlist) {
    return (
      <div className="page-head">
        <h1 className="page-title display">This link doesn&apos;t work</h1>
        <p className="muted" style={{ margin: "8px 0 16px" }}>
          The owner may have turned off sharing, or the link was cut off when it was copied.
        </p>
        <Link className="btn btn-primary" href="/">
          Open Meloops
        </Link>
      </div>
    );
  }

  const queue = toQueue(playlist);
  const totalMs = playlist.items.reduce((sum, s) => sum + s.endMs - s.startMs, 0);
  const canSave = isDemoMode || (user && !playlist.isOwner);

  return (
    <>
      <header style={{ display: "grid", gridTemplateColumns: "38% 1fr", gap: 16, alignItems: "end", padding: "28px 0 20px" }}>
        <Cover title={playlist.title} style={playlist.coverStyle} />
        <div style={{ minWidth: 0 }}>
          <p className="label muted" style={{ fontSize: "var(--t-sm)" }}>
            {playlist.ownerName ? `Shared by ${playlist.ownerName}` : "Shared playlist"}
          </p>
          <h1 className="display" style={{ fontSize: "var(--t-2xl)", overflowWrap: "anywhere" }}>
            {playlist.title}
          </h1>
          {playlist.description && <p className="muted" style={{ marginTop: 6 }}>{playlist.description}</p>}
          <p className="label" style={{ marginTop: 8 }}>
            {playlist.items.length} {playlist.items.length === 1 ? "moment" : "moments"}, {formatDuration(totalMs)}
          </p>
        </div>
      </header>

      <div className="action-row" style={{ gridTemplateColumns: canSave ? "1fr 1fr" : "1fr" }}>
        {queue.length > 0 && (
          <button className="btn btn-primary" onClick={() => player.play(queue, 0)}>
            <PlayIcon size={18} /> Play
          </button>
        )}
        {canSave && (
          <button
            className="btn btn-shell"
            disabled={saved}
            onClick={async () => {
              try {
                await repo.saveShared(playlist.slug);
                setSaved(true);
                toast("Saved to Shared");
              } catch (err) {
                toast((err as Error).message);
              }
            }}
          >
            {saved ? "Saved" : "Save to Shared"}
          </button>
        )}
      </div>
      {!isDemoMode && !user && (
        <p className="muted" style={{ marginBottom: 16, fontSize: "var(--t-sm)" }}>
          <Link href={`/login?next=/s/${slug}`} style={{ color: "var(--link)" }}>
            Sign in
          </Link>{" "}
          to save this playlist.
        </p>
      )}

      <ul className="rows">
        {playlist.items.map((s, i) => (
          <li key={i} className="row">
            <Artwork provider={s.provider} mediaId={s.mediaId} title={s.title} />
            <div className="row-main">
              <div className="row-title">{s.title}</div>
              <div className="row-sub">
                <span className="row-time">
                  {formatTimecode(s.startMs)}–{formatTimecode(s.endMs)}
                </span>
                {s.artist ? `  ${s.artist}` : ""}
              </div>
            </div>
            <a className="icon-btn" href={mediaUrl(s, s.startMs)} target="_blank" rel="noopener" aria-label={`${openLabel(s)}: ${s.title}`}>
              <ExternalIcon size={20} />
            </a>
            <button className="icon-btn" onClick={() => player.play(queue, i)} aria-label={`Play ${s.title} moment`}>
              <PlayIcon size={22} />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
