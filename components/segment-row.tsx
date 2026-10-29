"use client";

import type { ReactNode } from "react";
import type { Segment } from "@/lib/data/types";
import { formatTimecode } from "@/lib/time";
import { Artwork } from "./artwork";
import { HeartIcon, PlayIcon } from "./icons";

export function SegmentRow({
  segment,
  onOpen,
  onPlay,
  onToggleFavorite,
  lead,
  dragging,
  rowRef,
  rowStyle,
}: {
  segment: Segment;
  onOpen?: () => void;
  onPlay?: () => void;
  onToggleFavorite?: () => void;
  /** Leading slot, e.g. a drag handle. */
  lead?: ReactNode;
  dragging?: boolean;
  rowRef?: (el: HTMLElement | null) => void;
  rowStyle?: React.CSSProperties;
}) {
  const { track } = segment;
  return (
    <li ref={rowRef} className="row" style={rowStyle} data-dragging={dragging || undefined}>
      {lead}
      <Artwork provider={track.provider} mediaId={track.mediaId} title={track.title} />
      <button type="button" className="row-main" onClick={onOpen} disabled={!onOpen}>
        <div className="row-title">{track.title}</div>
        <div className="row-sub">
          <span className="row-time">
            {formatTimecode(segment.startMs)}–{formatTimecode(segment.endMs)}
          </span>
          {track.artist ? `  ${track.artist}` : ""}
        </div>
        {segment.note && <div className="row-sub">{segment.note}</div>}
      </button>
      {onToggleFavorite && (
        <button
          type="button"
          className="icon-btn is-plum"
          aria-pressed={segment.isFavorite}
          aria-label={segment.isFavorite ? "Remove from favourites" : "Add to favourites"}
          onClick={onToggleFavorite}
        >
          <HeartIcon size={22} filled={segment.isFavorite} />
        </button>
      )}
      {onPlay && (
        <button type="button" className="icon-btn" aria-label={`Play ${track.title} moment`} onClick={onPlay}>
          <PlayIcon size={22} />
        </button>
      )}
    </li>
  );
}
