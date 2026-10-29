/**
 * Supabase-backed repository. Runs in the browser; row level security scopes every
 * query to the signed-in user. Shared playlists go through security definer RPCs.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MediaProvider } from "@/lib/media/types";
import { keyAtEnd, keyForIndex } from "@/lib/ordering";
import { decodeSharePayload, isLocalShareSlug } from "./share-payload";
import {
  newShareSlug,
  summarize,
  type NewSegment,
  type Playlist,
  type Reaction,
  type Repo,
  type SavedShareSummary,
  type Segment,
  type SharedPlaylist,
} from "./types";

type TrackRow = {
  id: string;
  provider: MediaProvider;
  media_id: string;
  title: string;
  artist: string;
  duration_ms: number | null;
  added_at: string;
};

type SegmentRow = {
  id: string;
  start_ms: number;
  end_ms: number;
  note: string;
  reaction: Reaction | null;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
  library_tracks: TrackRow;
};

type PlaylistRow = {
  id: string;
  title: string;
  description: string;
  cover_style: number;
  visibility: "private" | "link";
  share_slug: string | null;
  last_played_at: string | null;
  created_at: string;
  updated_at: string;
  playlist_items: { id: string; position: string; segments: SegmentRow | null }[];
};

const SEGMENT_SELECT = "id, start_ms, end_ms, note, reaction, is_favorite, created_at, updated_at, library_tracks(*)";
const PLAYLIST_SELECT = `*, playlist_items(id, position, segments(${SEGMENT_SELECT}))`;

function toSegment(row: SegmentRow): Segment {
  const t = row.library_tracks;
  return {
    id: row.id,
    track: {
      id: t.id,
      provider: t.provider,
      mediaId: t.media_id,
      title: t.title,
      artist: t.artist,
      durationMs: t.duration_ms,
      addedAt: t.added_at,
    },
    startMs: row.start_ms,
    endMs: row.end_ms,
    note: row.note,
    reaction: row.reaction,
    isFavorite: row.is_favorite,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPlaylist(row: PlaylistRow): Playlist {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    coverStyle: row.cover_style,
    visibility: row.visibility,
    shareSlug: row.share_slug,
    lastPlayedAt: row.last_played_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: row.playlist_items
      .filter((i) => i.segments)
      .sort((a, b) => (a.position < b.position ? -1 : 1))
      .map((i) => ({ id: i.id, position: i.position, segment: toSegment(i.segments as SegmentRow) })),
  };
}

function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export class SupabaseRepo implements Repo {
  readonly kind = "supabase" as const;

  constructor(private readonly db: SupabaseClient) {}

  private async userId(): Promise<string> {
    const { data } = await this.db.auth.getUser();
    if (!data.user) throw new Error("Your session ended. Sign in again.");
    return data.user.id;
  }

  private async positions(playlistId: string): Promise<{ id: string; position: string }[]> {
    const rows = check(
      await this.db.from("playlist_items").select("id, position").eq("playlist_id", playlistId).order("position"),
    );
    return rows ?? [];
  }

  private async touch(playlistId: string) {
    check(await this.db.from("playlists").update({ updated_at: new Date().toISOString() }).eq("id", playlistId));
  }

  async listPlaylists() {
    const rows = check(await this.db.from("playlists").select(PLAYLIST_SELECT).order("updated_at", { ascending: false }));
    return (rows as PlaylistRow[]).map((row) => summarize(toPlaylist(row)));
  }

  async getPlaylist(id: string) {
    const row = check(await this.db.from("playlists").select(PLAYLIST_SELECT).eq("id", id).maybeSingle());
    return row ? toPlaylist(row as PlaylistRow) : null;
  }

  async createPlaylist(input: { title: string; description: string }) {
    const count = (await this.db.from("playlists").select("id", { count: "exact", head: true })).count ?? 0;
    const row = check(
      await this.db
        .from("playlists")
        .insert({ title: input.title, description: input.description, cover_style: count % 4 })
        .select(PLAYLIST_SELECT)
        .single(),
    );
    return toPlaylist(row as PlaylistRow);
  }

  async updatePlaylist(id: string, patch: { title?: string; description?: string; coverStyle?: number }) {
    check(
      await this.db
        .from("playlists")
        .update({ title: patch.title, description: patch.description, cover_style: patch.coverStyle })
        .eq("id", id),
    );
  }

  async deletePlaylist(id: string) {
    check(await this.db.from("playlists").delete().eq("id", id));
  }

  async duplicatePlaylist(id: string) {
    const source = await this.getPlaylist(id);
    if (!source) throw new Error("Playlist not found");
    const copy = check(
      await this.db
        .from("playlists")
        .insert({
          title: `${source.title} copy`.slice(0, 80),
          description: source.description,
          cover_style: source.coverStyle,
        })
        .select("id")
        .single(),
    ) as { id: string };
    if (source.items.length) {
      check(
        await this.db.from("playlist_items").insert(
          source.items.map((item) => ({ playlist_id: copy.id, segment_id: item.segment.id, position: item.position })),
        ),
      );
    }
    return copy.id;
  }

  async markPlayed(id: string) {
    check(await this.db.from("playlists").update({ last_played_at: new Date().toISOString() }).eq("id", id));
  }

  async listSegments(options: { favoritesOnly?: boolean; limit?: number } = {}) {
    let query = this.db.from("segments").select(SEGMENT_SELECT).order("created_at", { ascending: false });
    if (options.favoritesOnly) query = query.eq("is_favorite", true);
    if (options.limit) query = query.limit(options.limit);
    const rows = check(await query);
    return (rows as unknown as SegmentRow[]).map(toSegment);
  }

  async saveSegment(input: NewSegment) {
    const userId = await this.userId();
    const track = check(
      await this.db
        .from("library_tracks")
        .upsert(
          {
            user_id: userId,
            provider: input.provider,
            media_id: input.mediaId,
            title: input.title,
            artist: input.artist,
            duration_ms: input.durationMs,
          },
          { onConflict: "user_id,provider,media_id" },
        )
        .select("id")
        .single(),
    ) as { id: string };

    const row = check(
      await this.db
        .from("segments")
        .insert({
          user_id: userId,
          library_track_id: track.id,
          start_ms: input.startMs,
          end_ms: input.endMs,
          note: input.note,
        })
        .select(SEGMENT_SELECT)
        .single(),
    );
    const segment = toSegment(row as unknown as SegmentRow);
    if (input.playlistId) await this.addToPlaylist(input.playlistId, segment.id);
    return segment;
  }

  async updateSegment(id: string, patch: { startMs: number; endMs: number; note: string }) {
    check(
      await this.db
        .from("segments")
        .update({ start_ms: patch.startMs, end_ms: patch.endMs, note: patch.note })
        .eq("id", id),
    );
  }

  async deleteSegment(id: string) {
    check(await this.db.from("segments").delete().eq("id", id));
  }

  async setReaction(id: string, reaction: Reaction | null) {
    check(await this.db.from("segments").update({ reaction }).eq("id", id));
  }

  async setFavorite(id: string, isFavorite: boolean) {
    check(await this.db.from("segments").update({ is_favorite: isFavorite }).eq("id", id));
  }

  async addToPlaylist(playlistId: string, segmentId: string) {
    const keys = (await this.positions(playlistId)).map((r) => r.position);
    check(
      await this.db
        .from("playlist_items")
        .insert({ playlist_id: playlistId, segment_id: segmentId, position: keyAtEnd(keys) }),
    );
    await this.touch(playlistId);
  }

  async removeFromPlaylist(playlistId: string, itemId: string) {
    check(await this.db.from("playlist_items").delete().eq("id", itemId).eq("playlist_id", playlistId));
    await this.touch(playlistId);
  }

  async moveItem(playlistId: string, itemId: string, toIndex: number) {
    const others = (await this.positions(playlistId)).filter((r) => r.id !== itemId).map((r) => r.position);
    check(
      await this.db
        .from("playlist_items")
        .update({ position: keyForIndex(others, toIndex) })
        .eq("id", itemId),
    );
    await this.touch(playlistId);
  }

  async enableSharing(playlistId: string) {
    const current = check(
      await this.db.from("playlists").select("share_slug").eq("id", playlistId).single(),
    ) as { share_slug: string | null };
    const slug = current.share_slug ?? newShareSlug();
    check(await this.db.from("playlists").update({ visibility: "link", share_slug: slug }).eq("id", playlistId));
    return slug;
  }

  async disableSharing(playlistId: string) {
    check(await this.db.from("playlists").update({ visibility: "private" }).eq("id", playlistId));
  }

  async getShared(slug: string): Promise<SharedPlaylist | null> {
    if (isLocalShareSlug(slug)) return decodeSharePayload(slug);
    const data = check(await this.db.rpc("get_shared_playlist", { slug })) as Omit<SharedPlaylist, "slug"> | null;
    return data ? { ...data, slug } : null;
  }

  async saveShared(slug: string) {
    if (isLocalShareSlug(slug)) throw new Error("Demo links can't be saved to an account.");
    check(await this.db.rpc("save_shared_playlist", { slug }));
  }

  async listSavedShares(): Promise<SavedShareSummary[]> {
    const rows = check(await this.db.rpc("list_saved_shares")) as {
      slug: string;
      title: string;
      description: string;
      cover_style: number;
      owner_name: string | null;
      segment_count: number;
      total_ms: number;
      saved_at: string;
    }[];
    return rows.map((r) => ({
      slug: r.slug,
      title: r.title,
      description: r.description,
      coverStyle: r.cover_style,
      ownerName: r.owner_name,
      segmentCount: Number(r.segment_count),
      totalMs: Number(r.total_ms),
      savedAt: r.saved_at,
    }));
  }
}
