-- Meloops initial schema.
-- Stores Spotify track IDs plus the user's own labels and timestamps. No Spotify
-- metadata or artwork is stored here; that is fetched and cached for 24 h by the app server.

create extension if not exists pgcrypto;

-- Profiles ------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Library tracks -------------------------------------------------------------

create table public.library_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  spotify_track_id text not null check (spotify_track_id ~ '^[A-Za-z0-9]{22}$'),
  title text not null check (char_length(title) between 1 and 200),
  artist text not null default '' check (char_length(artist) <= 200),
  duration_ms integer check (duration_ms > 0),
  added_at timestamptz not null default now(),
  unique (user_id, spotify_track_id)
);

-- Segments -------------------------------------------------------------------

create type public.reaction as enum ('like', 'dislike');

create table public.segments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  library_track_id uuid not null references public.library_tracks (id) on delete cascade,
  start_ms integer not null check (start_ms >= 0),
  end_ms integer not null,
  note text not null default '' check (char_length(note) <= 280),
  reaction public.reaction,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_ms > start_ms)
);

create index segments_user_created_idx on public.segments (user_id, created_at desc);

-- Playlists ------------------------------------------------------------------

create type public.playlist_visibility as enum ('private', 'link');

create table public.playlists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  description text not null default '' check (char_length(description) <= 300),
  cover_style smallint not null default 0,
  visibility public.playlist_visibility not null default 'private',
  share_slug text unique,
  last_played_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index playlists_owner_updated_idx on public.playlists (owner_id, updated_at desc);

create table public.playlist_items (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  segment_id uuid not null references public.segments (id) on delete cascade,
  position text not null collate "C",
  added_at timestamptz not null default now()
);

create index playlist_items_order_idx on public.playlist_items (playlist_id, position);

create table public.saved_shares (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (user_id, playlist_id)
);

-- updated_at -----------------------------------------------------------------

create function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger segments_touch before update on public.segments
  for each row execute function public.touch_updated_at();
create trigger playlists_touch before update on public.playlists
  for each row execute function public.touch_updated_at();

-- Row level security: owner-only. Shared reads go through security definer functions.

alter table public.profiles enable row level security;
alter table public.library_tracks enable row level security;
alter table public.segments enable row level security;
alter table public.playlists enable row level security;
alter table public.playlist_items enable row level security;
alter table public.saved_shares enable row level security;

create policy "own profile" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy "own tracks" on public.library_tracks
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own segments" on public.segments
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.library_tracks t where t.id = library_track_id and t.user_id = auth.uid())
  );

create policy "own playlists" on public.playlists
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "own playlist items" on public.playlist_items
  for all
  using (exists (select 1 from public.playlists p where p.id = playlist_id and p.owner_id = auth.uid()))
  with check (
    exists (select 1 from public.playlists p where p.id = playlist_id and p.owner_id = auth.uid())
    and exists (select 1 from public.segments s where s.id = segment_id and s.user_id = auth.uid())
  );

create policy "own saved shares" on public.saved_shares
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Shared playlist access ------------------------------------------------------

-- Returns a link-shared playlist as JSON, or null. Callable without login.
create function public.get_shared_playlist(slug text)
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
        'trackId', t.spotify_track_id,
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

-- Saves a link-shared playlist to the caller's Shared tab.
create function public.save_shared_playlist(slug text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to save playlists';
  end if;
  select id into target from public.playlists
    where share_slug = save_shared_playlist.slug and visibility = 'link';
  if target is null then
    raise exception 'Playlist is not shared';
  end if;
  insert into public.saved_shares (user_id, playlist_id) values (auth.uid(), target)
    on conflict do nothing;
  return target;
end;
$$;

-- Summaries of playlists the caller saved from links and that are still shared.
create function public.list_saved_shares()
returns table (
  id uuid,
  slug text,
  title text,
  description text,
  cover_style smallint,
  owner_name text,
  segment_count bigint,
  total_ms bigint,
  saved_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.share_slug, p.title, p.description, p.cover_style, pr.display_name,
         count(i.id), coalesce(sum(s.end_ms - s.start_ms), 0), ss.saved_at
  from public.saved_shares ss
  join public.playlists p on p.id = ss.playlist_id and p.visibility = 'link'
  left join public.profiles pr on pr.id = p.owner_id
  left join public.playlist_items i on i.playlist_id = p.id
  left join public.segments s on s.id = i.segment_id
  where ss.user_id = auth.uid()
  group by p.id, pr.display_name, ss.saved_at
  order by ss.saved_at desc;
$$;

revoke all on function public.get_shared_playlist(text) from public;
revoke all on function public.save_shared_playlist(text) from public;
revoke all on function public.list_saved_shares() from public;
grant execute on function public.get_shared_playlist(text) to anon, authenticated;
grant execute on function public.save_shared_playlist(text) to authenticated;
grant execute on function public.list_saved_shares() to authenticated;
