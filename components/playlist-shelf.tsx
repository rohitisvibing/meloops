import Link from "next/link";
import type { PlaylistSummary } from "@/lib/data/types";
import { formatDuration } from "@/lib/time";
import { Cover } from "./artwork";

export function PlaylistShelf({ playlists }: { playlists: PlaylistSummary[] }) {
  return (
    <div className="shelf" role="list">
      {playlists.map((p) => (
        <Link key={p.id} href={`/p/${p.id}`} className="shelf-item" role="listitem">
          <Cover title={p.title} style={p.coverStyle} />
          <div className="shelf-title">{p.title}</div>
          <div className="row-sub">
            {p.segmentCount} {p.segmentCount === 1 ? "moment" : "moments"}, {formatDuration(p.totalMs)}
          </div>
        </Link>
      ))}
    </div>
  );
}
