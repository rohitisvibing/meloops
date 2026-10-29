-- Moments can come from YouTube (YouTube Music) or Spotify.

alter table public.library_tracks
  add column provider text not null default 'spotify' check (provider in ('spotify', 'youtube'));

alter table public.library_tracks rename column spotify_track_id to media_id;

alter table public.library_tracks drop constraint library_tracks_spotify_track_id_check;
alter table public.library_tracks add constraint library_tracks_media_id_check check (
  (provider = 'spotify' and media_id ~ '^[A-Za-z0-9]{22}$')
  or (provider = 'youtube' and media_id ~ '^[A-Za-z0-9_-]{11}$')
);

alter table public.library_tracks drop constraint library_tracks_user_id_spotify_track_id_key;
alter table public.library_tracks add constraint library_tracks_user_provider_media_key unique (user_id, provider, media_id);

alter table public.library_tracks alter column provider drop default;

create or replace function public.get_shared_playlist(slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'title', p.title,
    'description', p.description,
    'coverStyle', p.cover_style,
    'ownerName', pr.display_name,
    'isOwner', p.owner_id = auth.uid(),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'provider', t.provider,
        'mediaId', t.media_id,
        'title', t.title,
        'artist', t.artist,
        'durationMs', t.duration_ms,
        'startMs', s.start_ms,
        'endMs', s.end_ms
      ) order by i.position)
      from public.playlist_items i
      join public.segments s on s.id = i.segment_id
      join public.library_tracks t on t.id = s.library_track_id
      where i.playlist_id = p.id
    ), '[]'::jsonb)
  )
  from public.playlists p
  left join public.profiles pr on pr.id = p.owner_id
  where p.share_slug = get_shared_playlist.slug and p.visibility = 'link';
$$;
