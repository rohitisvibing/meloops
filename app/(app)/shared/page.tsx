"use client";

import Link from "next/link";
import { Cover } from "@/components/artwork";
import { useRepoQuery } from "@/lib/client/repo-context";
import { formatDuration } from "@/lib/time";

export default function SharedPage() {
  const { data } = useRepoQuery((repo) => repo.listSavedShares());

  return (
    <>
      <header className="page-head">
        <h1 className="page-title display">Shared with you</h1>
        <p className="muted">Playlists friends sent you, saved from their links.</p>
      </header>

      {data && data.length === 0 && (
        <div className="empty">
          <p>Nothing here yet. When a friend sends you a Meloops link, open it and tap Save to Shared.</p>
        </div>
      )}

      {data && data.length > 0 && (
        <ul className="rows">
          {data.map((p) => (
            <li key={p.slug} className="row">
              <Link href={`/s/${p.slug}`} className="row-main" style={{ display: "flex", gap: 12, alignItems: "center", textDecoration: "none" }}>
                <div style={{ width: 56, flex: "none" }}>
                  <Cover title={p.title} style={p.coverStyle} className="cover-sm" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="row-title">{p.title}</div>
                  <div className="row-sub">
                    {p.ownerName ? `From ${p.ownerName}, ` : ""}
                    {p.segmentCount} {p.segmentCount === 1 ? "moment" : "moments"}, {formatDuration(p.totalMs)}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
