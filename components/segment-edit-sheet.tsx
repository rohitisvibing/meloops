"use client";

import { useState } from "react";
import { useMutation } from "@/lib/client/repo-context";
import { useTrackMeta } from "@/lib/client/use-track-meta";
import type { Reaction, Segment } from "@/lib/data/types";
import { HeartIcon, ThumbDownIcon, ThumbUpIcon } from "./icons";
import { SegmentForm } from "./segment-form";
import { Sheet } from "./sheet";
import { useToast } from "./toast";

export function SegmentEditSheet({
  segment,
  onClose,
  onRemoveFromPlaylist,
}: {
  segment: Segment | null;
  onClose: () => void;
  onRemoveFromPlaylist?: () => Promise<void>;
}) {
  const mutate = useMutation();
  const toast = useToast();
  const meta = useTrackMeta(segment?.track.provider, segment?.track.mediaId);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!segment) return null;
  const { track } = segment;
  const durationMs = track.durationMs ?? meta?.durationMs ?? null;

  const run = async (fn: () => Promise<unknown>, done: string, close = false) => {
    setBusy(true);
    try {
      await fn();
      toast(done);
      if (close) onClose();
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const react = (reaction: Reaction) =>
    run(
      () => mutate((r) => r.setReaction(segment.id, segment.reaction === reaction ? null : reaction)),
      segment.reaction === reaction ? "Reaction cleared" : reaction === "like" ? "Liked" : "Disliked",
    );

  return (
    <Sheet open onClose={onClose} title={track.title}>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        {track.artist || "Unknown artist"}
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          className="chip"
          aria-pressed={segment.reaction === "like"}
          onClick={() => react("like")}
          disabled={busy}
        >
          <ThumbUpIcon size={16} filled={segment.reaction === "like"} style={{ verticalAlign: "-3px" }} /> Like
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={segment.reaction === "dislike"}
          onClick={() => react("dislike")}
          disabled={busy}
        >
          <ThumbDownIcon size={16} filled={segment.reaction === "dislike"} style={{ verticalAlign: "-3px" }} /> Dislike
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={segment.isFavorite}
          onClick={() =>
            run(
              () => mutate((r) => r.setFavorite(segment.id, !segment.isFavorite)),
              segment.isFavorite ? "Removed from favourites" : "Added to favourites",
            )
          }
          disabled={busy}
        >
          <HeartIcon size={16} filled={segment.isFavorite} style={{ verticalAlign: "-3px" }} /> Favourite
        </button>
      </div>

      <SegmentForm
        key={segment.id}
        provider={track.provider}
        mediaId={track.mediaId}
        title={track.title}
        artist={track.artist}
        durationMs={durationMs}
        initial={{ startMs: segment.startMs, endMs: segment.endMs, note: segment.note }}
        submitLabel="Save changes"
        busy={busy}
        onSubmit={(value) => run(() => mutate((r) => r.updateSegment(segment.id, value)), "Changes saved", true)}
        onCancel={onClose}
      />

      <div style={{ display: "grid", gap: 10, marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
        {onRemoveFromPlaylist && (
          <button
            type="button"
            className="btn btn-ghost btn-block"
            disabled={busy}
            onClick={() => run(onRemoveFromPlaylist, "Removed from playlist", true)}
          >
            Remove from this playlist
          </button>
        )}
        {confirmDelete ? (
          <button
            type="button"
            className="btn btn-danger btn-block"
            disabled={busy}
            onClick={() => run(() => mutate((r) => r.deleteSegment(segment.id)), "Moment deleted", true)}
          >
            Delete from every playlist
          </button>
        ) : (
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setConfirmDelete(true)}>
            Delete moment
          </button>
        )}
      </div>
    </Sheet>
  );
}
