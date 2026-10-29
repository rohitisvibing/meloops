import type { MediaProvider } from "@/lib/media/types";

export type Reaction = "like" | "dislike";

/** A song in the user's library: its YouTube or Spotify ID plus the user's own labels. */
export type LibraryTrack = {
  id: string;
  provider: MediaProvider;
  mediaId: string;
  title: string;
  artist: string;
  durationMs: number | null;
  addedAt: string;
};

export type Segment = {
  id: string;
  track: LibraryTrack;
  startMs: number;
  endMs: number;
  note: string;
  reaction: Reaction | null;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PlaylistItem = {
  id: string;
  position: string;
  segment: Segment;
};

export type Playlist = {
  id: string;
  title: string;
  description: string;
  coverStyle: number;
  visibility: "private" | "link";
  shareSlug: string | null;
  lastPlayedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: PlaylistItem[];
};

export type PlaylistSummary = {
  id: string;
  title: string;
  description: string;
  coverStyle: number;
  segmentCount: number;
  totalMs: number;
  mediaKeys: string[];
  updatedAt: string;
  lastPlayedAt: string | null;
};

export type SharedSegment = {
  provider: MediaProvider;
  mediaId: string;
  title: string;
  artist: string;
  durationMs: number | null;
  startMs: number;
  endMs: number;
};

export type SharedPlaylist = {
  slug: string;
  title: string;
  description: string;
  coverStyle: number;
  ownerName: string | null;
  isOwner: boolean;
  items: SharedSegment[];
};

export type SavedShareSummary = {
  slug: string;
  title: string;
  description: string;
  coverStyle: number;
  ownerName: string | null;
  segmentCount: number;
  totalMs: number;
  savedAt: string;
};

export type NewSegment = {
  provider: MediaProvider;
  mediaId: string;
  title: string;
  artist: string;
  durationMs: number | null;
  startMs: number;
  endMs: number;
  note: string;
  playlistId: string | null;
};

export interface Repo {
  readonly kind: "local" | "supabase";

  listPlaylists(): Promise<PlaylistSummary[]>;
  getPlaylist(id: string): Promise<Playlist | null>;
  createPlaylist(input: { title: string; description: string }): Promise<Playlist>;
  updatePlaylist(id: string, patch: { title?: string; description?: string; coverStyle?: number }): Promise<void>;
  deletePlaylist(id: string): Promise<void>;
  duplicatePlaylist(id: string): Promise<string>;
  markPlayed(id: string): Promise<void>;

  listSegments(options?: { favoritesOnly?: boolean; limit?: number }): Promise<Segment[]>;
  saveSegment(input: NewSegment): Promise<Segment>;
  updateSegment(id: string, patch: { startMs: number; endMs: number; note: string }): Promise<void>;
  deleteSegment(id: string): Promise<void>;
  setReaction(id: string, reaction: Reaction | null): Promise<void>;
  setFavorite(id: string, isFavorite: boolean): Promise<void>;

  addToPlaylist(playlistId: string, segmentId: string): Promise<void>;
  removeFromPlaylist(playlistId: string, itemId: string): Promise<void>;
  moveItem(playlistId: string, itemId: string, toIndex: number): Promise<void>;

  enableSharing(playlistId: string): Promise<string>;
  disableSharing(playlistId: string): Promise<void>;
  getShared(slug: string): Promise<SharedPlaylist | null>;
  saveShared(slug: string): Promise<void>;
  listSavedShares(): Promise<SavedShareSummary[]>;
}

export function summarize(playlist: Playlist): PlaylistSummary {
  return {
    id: playlist.id,
    title: playlist.title,
    description: playlist.description,
    coverStyle: playlist.coverStyle,
    segmentCount: playlist.items.length,
    totalMs: playlist.items.reduce((sum, item) => sum + item.segment.endMs - item.segment.startMs, 0),
    mediaKeys: playlist.items.map(({ segment: { track } }) => `${track.provider}:${track.mediaId}`),
    updatedAt: playlist.updatedAt,
    lastPlayedAt: playlist.lastPlayedAt,
  };
}

export function newShareSlug(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return Array.from(bytes, (b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");
}
