/**
 * Demo-mode repository backed by localStorage. Same contract as the Supabase repo,
 * so every screen works without a backend or Spotify.
 */
import { keyAtEnd, keyForIndex } from "@/lib/ordering";
import {
  newShareSlug,
  summarize,
  type LibraryTrack,
  type NewSegment,
  type Playlist,
  type Reaction,
  type Repo,
  type SavedShareSummary,
  type Segment,
  type SharedPlaylist,
} from "./types";
import { decodeSharePayload, encodeSharePayload } from "./share-payload";
import { demoSeed } from "./demo-seed";

type StoredSegment = Omit<Segment, "track"> & { libraryTrackId: string };
type StoredItem = { id: string; position: string; segmentId: string };
type StoredPlaylist = Omit<Playlist, "items"> & { items: StoredItem[] };

export type LocalState = {
  version: 2;
  tracks: LibraryTrack[];
  segments: StoredSegment[];
  playlists: StoredPlaylist[];
  saved: SavedShareSummary[];
};

// v2 added providers; older demo data is replaced by the new seed.
export const DEMO_STORAGE_KEY = "meloops.demo.v2";

function now() {
  return new Date().toISOString();
}

function uid() {
  return crypto.randomUUID();
}

export class LocalRepo implements Repo {
  readonly kind = "local" as const;
  private memory: LocalState | null = null;

  private load(): LocalState {
    if (this.memory) return this.memory;
    let state: LocalState | null = null;
    try {
      const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
      if (raw) state = JSON.parse(raw) as LocalState;
    } catch {
      state = null;
    }
    this.memory = state ?? demoSeed();
    this.persist();
    return this.memory;
  }

  private persist() {
    try {
      window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(this.memory));
    } catch {
      // Private mode or quota: keep working from memory.
    }
  }

  private mutate<T>(fn: (state: LocalState) => T): T {
    const result = fn(this.load());
    this.persist();
    return result;
  }

  private hydrateSegment(state: LocalState, stored: StoredSegment): Segment {
    const track = state.tracks.find((t) => t.id === stored.libraryTrackId);
    if (!track) throw new Error(`Missing track ${stored.libraryTrackId}`);
    const { id, startMs, endMs, note, reaction, isFavorite, createdAt, updatedAt } = stored;
    return { id, track, startMs, endMs, note, reaction, isFavorite, createdAt, updatedAt };
  }

  private hydratePlaylist(state: LocalState, stored: StoredPlaylist): Playlist {
    const items = [...stored.items]
      .sort((a, b) => (a.position < b.position ? -1 : 1))
      .flatMap((item) => {
        const seg = state.segments.find((s) => s.id === item.segmentId);
        return seg ? [{ id: item.id, position: item.position, segment: this.hydrateSegment(state, seg) }] : [];
      });
    return { ...stored, items };
  }

  private findPlaylist(state: LocalState, id: string): StoredPlaylist {
    const playlist = state.playlists.find((p) => p.id === id);
    if (!playlist) throw new Error("Playlist not found");
    return playlist;
  }

  async listPlaylists() {
    const state = this.load();
    return state.playlists
      .map((p) => summarize(this.hydratePlaylist(state, p)))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  async getPlaylist(id: string) {
    const state = this.load();
    const playlist = state.playlists.find((p) => p.id === id);
    return playlist ? this.hydratePlaylist(state, playlist) : null;
  }

  async createPlaylist(input: { title: string; description: string }) {
    return this.mutate((state) => {
      const playlist: StoredPlaylist = {
        id: uid(),
        title: input.title,
        description: input.description,
        coverStyle: state.playlists.length % 4,
        visibility: "private",
        shareSlug: null,
        lastPlayedAt: null,
        createdAt: now(),
        updatedAt: now(),
        items: [],
      };
      state.playlists.push(playlist);
      return this.hydratePlaylist(state, playlist);
    });
  }

  async updatePlaylist(id: string, patch: { title?: string; description?: string; coverStyle?: number }) {
    this.mutate((state) => {
      Object.assign(this.findPlaylist(state, id), patch, { updatedAt: now() });
    });
  }

  async deletePlaylist(id: string) {
    this.mutate((state) => {
      state.playlists = state.playlists.filter((p) => p.id !== id);
    });
  }

  async duplicatePlaylist(id: string) {
    return this.mutate((state) => {
      const source = this.findPlaylist(state, id);
      const copy: StoredPlaylist = {
        ...source,
        id: uid(),
        title: `${source.title} copy`.slice(0, 80),
        visibility: "private",
        shareSlug: null,
        lastPlayedAt: null,
        createdAt: now(),
        updatedAt: now(),
        items: source.items.map((item) => ({ ...item, id: uid() })),
      };
      state.playlists.push(copy);
      return copy.id;
    });
  }

  async markPlayed(id: string) {
    this.mutate((state) => {
      this.findPlaylist(state, id).lastPlayedAt = now();
    });
  }

  async listSegments(options: { favoritesOnly?: boolean; limit?: number } = {}) {
    const state = this.load();
    return state.segments
      .filter((s) => !options.favoritesOnly || s.isFavorite)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, options.limit ?? Infinity)
      .map((s) => this.hydrateSegment(state, s));
  }

  async saveSegment(input: NewSegment) {
    return this.mutate((state) => {
      let track = state.tracks.find((t) => t.provider === input.provider && t.mediaId === input.mediaId);
      if (track) {
        Object.assign(track, { title: input.title, artist: input.artist, durationMs: input.durationMs ?? track.durationMs });
      } else {
        track = {
          id: uid(),
          provider: input.provider,
          mediaId: input.mediaId,
          title: input.title,
          artist: input.artist,
          durationMs: input.durationMs,
          addedAt: now(),
        };
        state.tracks.push(track);
      }
      const segment: StoredSegment = {
        id: uid(),
        libraryTrackId: track.id,
        startMs: input.startMs,
        endMs: input.endMs,
        note: input.note,
        reaction: null,
        isFavorite: false,
        createdAt: now(),
        updatedAt: now(),
      };
      state.segments.push(segment);
      if (input.playlistId) {
        const playlist = this.findPlaylist(state, input.playlistId);
        playlist.items.push({ id: uid(), segmentId: segment.id, position: keyAtEnd(sortedKeys(playlist)) });
        playlist.updatedAt = now();
      }
      return this.hydrateSegment(state, segment);
    });
  }

  private patchSegment(id: string, patch: Partial<StoredSegment>) {
    this.mutate((state) => {
      const segment = state.segments.find((s) => s.id === id);
      if (!segment) throw new Error("Moment not found");
      Object.assign(segment, patch, { updatedAt: now() });
    });
  }

  async updateSegment(id: string, patch: { startMs: number; endMs: number; note: string }) {
    this.patchSegment(id, patch);
  }

  async deleteSegment(id: string) {
    this.mutate((state) => {
      state.segments = state.segments.filter((s) => s.id !== id);
      for (const p of state.playlists) p.items = p.items.filter((i) => i.segmentId !== id);
    });
  }

  async setReaction(id: string, reaction: Reaction | null) {
    this.patchSegment(id, { reaction });
  }

  async setFavorite(id: string, isFavorite: boolean) {
    this.patchSegment(id, { isFavorite });
  }

  async addToPlaylist(playlistId: string, segmentId: string) {
    this.mutate((state) => {
      const playlist = this.findPlaylist(state, playlistId);
      playlist.items.push({ id: uid(), segmentId, position: keyAtEnd(sortedKeys(playlist)) });
      playlist.updatedAt = now();
    });
  }

  async removeFromPlaylist(playlistId: string, itemId: string) {
    this.mutate((state) => {
      const playlist = this.findPlaylist(state, playlistId);
      playlist.items = playlist.items.filter((i) => i.id !== itemId);
      playlist.updatedAt = now();
    });
  }

  async moveItem(playlistId: string, itemId: string, toIndex: number) {
    this.mutate((state) => {
      const playlist = this.findPlaylist(state, playlistId);
      const item = playlist.items.find((i) => i.id === itemId);
      if (!item) return;
      const others = playlist.items.filter((i) => i.id !== itemId);
      item.position = keyForIndex(others.map((i) => i.position).sort(), toIndex);
      playlist.updatedAt = now();
    });
  }

  /**
   * Demo mode has no server, so the share "slug" is the playlist itself encoded in the link
   * (track IDs, the user's labels and timestamps only).
   */
  async enableSharing(playlistId: string) {
    const state = this.load();
    const playlist = this.hydratePlaylist(state, this.findPlaylist(state, playlistId));
    const slug = encodeSharePayload(playlist);
    this.mutate((s) => {
      Object.assign(this.findPlaylist(s, playlistId), { visibility: "link", shareSlug: newShareSlug() });
    });
    return slug;
  }

  async disableSharing(playlistId: string) {
    this.mutate((state) => {
      Object.assign(this.findPlaylist(state, playlistId), { visibility: "private", shareSlug: null });
    });
  }

  async getShared(slug: string): Promise<SharedPlaylist | null> {
    return decodeSharePayload(slug);
  }

  async saveShared(slug: string) {
    const shared = decodeSharePayload(slug);
    if (!shared) throw new Error("This share link is broken.");
    this.mutate((state) => {
      state.saved = state.saved.filter((s) => s.slug !== slug);
      state.saved.unshift({
        slug,
        title: shared.title,
        description: shared.description,
        coverStyle: shared.coverStyle,
        ownerName: shared.ownerName,
        segmentCount: shared.items.length,
        totalMs: shared.items.reduce((sum, i) => sum + i.endMs - i.startMs, 0),
        savedAt: now(),
      });
    });
  }

  async listSavedShares() {
    return this.load().saved;
  }
}

function sortedKeys(playlist: StoredPlaylist) {
  return playlist.items.map((i) => i.position).sort();
}
