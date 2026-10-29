"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Cover } from "@/components/artwork";
import { BackIcon, GripIcon, MoreIcon, PlayIcon, PlusIcon, SharedIcon } from "@/components/icons";
import { SegmentEditSheet } from "@/components/segment-edit-sheet";
import { SegmentRow } from "@/components/segment-row";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { segmentToQueueItem, usePlayer, type QueueItem } from "@/lib/client/player-context";
import { useMutation, useRepo, useRepoQuery } from "@/lib/client/repo-context";
import type { Playlist, PlaylistItem, Segment } from "@/lib/data/types";
import { isDemoMode } from "@/lib/env";
import { formatDuration } from "@/lib/time";
import { shareUrl, sharePlaylistLink } from "@/lib/client/share";

function toQueue(items: PlaylistItem[]): QueueItem[] {
  return items.map(({ segment }) => segmentToQueueItem(segment));
}

function SortableRow({
  item,
  index,
  onOpen,
  onPlay,
  onFavorite,
}: {
  item: PlaylistItem;
  index: number;
  onOpen: () => void;
  onPlay: () => void;
  onFavorite: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  return (
    <SegmentRow
      segment={item.segment}
      rowRef={setNodeRef}
      rowStyle={{ transform: CSS.Transform.toString(transform), transition }}
      dragging={isDragging}
      onOpen={onOpen}
      onPlay={onPlay}
      onToggleFavorite={onFavorite}
      lead={
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="icon-btn drag-handle"
          aria-label={`Move ${item.segment.track.title}, position ${index + 1}`}
          {...attributes}
          {...listeners}
        >
          <GripIcon size={20} />
        </button>
      }
    />
  );
}

export default function PlaylistPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { repo, refresh } = useRepo();
  const mutate = useMutation();
  const toast = useToast();
  const player = usePlayer();
  const { data: playlist, loading } = useRepoQuery((r) => r.getPlaylist(id), [id]);
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [editing, setEditing] = useState<{ segment: Segment; itemId: string } | null>(null);
  const [menu, setMenu] = useState<"none" | "more" | "rename" | "share" | "delete">("none");

  useEffect(() => {
    if (playlist) setItems(playlist.items);
  }, [playlist]);

  // Keep the edit sheet in sync with fresh data after a write.
  useEffect(() => {
    if (!editing || !playlist) return;
    const fresh = playlist.items.find((i) => i.id === editing.itemId);
    if (fresh && fresh.segment !== editing.segment) setEditing({ segment: fresh.segment, itemId: fresh.id });
    if (!fresh) setEditing(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlist]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (loading && !playlist) return <p className="page-head muted">Loading playlist…</p>;
  if (!playlist) {
    return (
      <div className="page-head">
        <h1 className="page-title display">Playlist not found</h1>
        <p className="muted" style={{ margin: "8px 0 16px" }}>
          It may have been deleted.
        </p>
        <Link className="btn btn-primary" href="/library">
          Go to library
        </Link>
      </div>
    );
  }

  const totalMs = items.reduce((sum, i) => sum + i.segment.endMs - i.segment.startMs, 0);

  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    setItems(arrayMove(items, from, to));
    try {
      await mutate((r) => r.moveItem(playlist.id, String(active.id), to));
    } catch (err) {
      toast((err as Error).message);
    }
  };

  const playFrom = (index: number) => {
    player.play(toQueue(items), index);
    void repo.markPlayed(playlist.id).then(refresh);
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 12 }}>
        <button className="icon-btn" onClick={() => router.back()} aria-label="Back">
          <BackIcon />
        </button>
        <button className="icon-btn" onClick={() => setMenu("more")} aria-label="Playlist options">
          <MoreIcon />
        </button>
      </div>

      <header style={{ display: "grid", gridTemplateColumns: "38% 1fr", gap: 16, alignItems: "end", padding: "8px 0 20px" }}>
        <Cover title={playlist.title} style={playlist.coverStyle} />
        <div style={{ minWidth: 0 }}>
          <h1 className="display" style={{ fontSize: "var(--t-2xl)", overflowWrap: "anywhere" }}>
            {playlist.title}
          </h1>
          {playlist.description && <p className="muted" style={{ marginTop: 6 }}>{playlist.description}</p>}
          <p className="label" style={{ marginTop: 8 }}>
            {items.length} {items.length === 1 ? "moment" : "moments"}, {formatDuration(totalMs)}
          </p>
        </div>
      </header>

      <div className={`action-row${items.length ? "" : " action-row-single"}`}>
        {items.length > 0 && (
          <button className="btn btn-primary" onClick={() => playFrom(0)}>
            <PlayIcon size={18} /> Play
          </button>
        )}
        <Link className="btn btn-shell" href={`/create?playlist=${playlist.id}`}>
          <PlusIcon size={18} /> Add song
        </Link>
        {items.length > 0 && (
          <button className="btn btn-ghost" onClick={() => setMenu("share")} aria-label="Share playlist">
            <SharedIcon size={18} />
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="empty">
          <p>This playlist is empty. Add a song and mark the moment you want.</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <ul className="rows">
              {items.map((item, index) => (
                <SortableRow
                  key={item.id}
                  item={item}
                  index={index}
                  onOpen={() => setEditing({ segment: item.segment, itemId: item.id })}
                  onPlay={() => playFrom(index)}
                  onFavorite={() => mutate((r) => r.setFavorite(item.segment.id, !item.segment.isFavorite))}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <SegmentEditSheet
        segment={editing?.segment ?? null}
        onClose={() => setEditing(null)}
        onRemoveFromPlaylist={
          editing ? () => mutate((r) => r.removeFromPlaylist(playlist.id, editing.itemId)) : undefined
        }
      />

      <Sheet open={menu === "more"} onClose={() => setMenu("none")} title="Playlist options">
        <div style={{ display: "grid", gap: 10 }}>
          <button className="btn btn-ghost btn-block" onClick={() => setMenu("rename")}>
            Rename or edit description
          </button>
          <button
            className="btn btn-ghost btn-block"
            onClick={async () => {
              const copy = await mutate((r) => r.duplicatePlaylist(playlist.id));
              toast("Playlist duplicated");
              router.push(`/p/${copy}`);
            }}
          >
            Duplicate playlist
          </button>
          <button className="btn btn-danger btn-block" onClick={() => setMenu("delete")}>
            Delete playlist
          </button>
        </div>
      </Sheet>

      <RenameSheet open={menu === "rename"} playlist={playlist} onClose={() => setMenu("none")} />
      <ShareSheet open={menu === "share"} playlist={playlist} onClose={() => setMenu("none")} />

      <Sheet open={menu === "delete"} onClose={() => setMenu("none")} title={`Delete “${playlist.title}”?`}>
        <p style={{ marginBottom: 16 }}>
          The playlist and its share link go away. The moments stay in your library.
        </p>
        <div style={{ display: "grid", gap: 10 }}>
          <button
            className="btn btn-danger btn-block"
            onClick={async () => {
              await mutate((r) => r.deletePlaylist(playlist.id));
              toast("Playlist deleted");
              router.replace("/library");
            }}
          >
            Delete playlist
          </button>
          <button className="btn btn-ghost btn-block" onClick={() => setMenu("none")}>
            Keep it
          </button>
        </div>
      </Sheet>
    </>
  );
}

function RenameSheet({ open, playlist, onClose }: { open: boolean; playlist: Playlist; onClose: () => void }) {
  const mutate = useMutation();
  const toast = useToast();
  const [title, setTitle] = useState(playlist.title);
  const [description, setDescription] = useState(playlist.description);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (open) {
      setTitle(playlist.title);
      setDescription(playlist.description);
    }
  }, [open, playlist]);

  return (
    <Sheet open={open} onClose={onClose} title="Edit playlist">
      <form
        style={{ display: "grid", gap: 14 }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return toast("Give the playlist a name.");
          await mutate((r) => r.updatePlaylist(playlist.id, { title: title.trim(), description: description.trim() }));
          toast("Playlist saved");
          onClose();
        }}
      >
        <div className="field">
          <label htmlFor={titleId} className="field-label label">
            Name
          </label>
          <input id={titleId} className="input" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={descId} className="field-label label">
            Description
          </label>
          <textarea
            id={descId}
            className="input"
            rows={3}
            maxLength={300}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-primary btn-block">
          Save playlist
        </button>
      </form>
    </Sheet>
  );
}

function ShareSheet({ open, playlist, onClose }: { open: boolean; playlist: Playlist; onClose: () => void }) {
  const mutate = useMutation();
  const toast = useToast();
  const [link, setLink] = useState<string | null>(null);
  const shared = playlist.visibility === "link";

  useEffect(() => {
    if (!open) setLink(null);
  }, [open]);

  const create = async () => {
    try {
      const slug = await mutate((r) => r.enableSharing(playlist.id));
      setLink(shareUrl(slug));
    } catch (err) {
      toast((err as Error).message);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Share playlist">
      <div style={{ display: "grid", gap: 12 }}>
        <p>
          Anyone with the link can see the songs and timestamps. They play the moments with their own Spotify account.
        </p>
        {isDemoMode && (
          <p className="muted" style={{ fontSize: "var(--t-sm)" }}>
            In demo mode the link carries the playlist itself, so turning sharing off can&apos;t recall a link you
            already sent.
          </p>
        )}
        {link ? (
          <>
            <input className="input" readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Share link" />
            <button
              className="btn btn-primary btn-block"
              onClick={async () => toast(await sharePlaylistLink(playlist.title, link))}
            >
              Share link
            </button>
          </>
        ) : (
          <button className="btn btn-primary btn-block" onClick={create}>
            {shared ? "Get share link" : "Create share link"}
          </button>
        )}
        {shared && (
          <button
            className="btn btn-ghost btn-block"
            onClick={async () => {
              await mutate((r) => r.disableSharing(playlist.id));
              setLink(null);
              toast("Sharing turned off");
            }}
          >
            Turn off sharing
          </button>
        )}
      </div>
    </Sheet>
  );
}
