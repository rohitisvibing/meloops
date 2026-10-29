# Meloops

A mobile-first web app for playlists of song *moments*: paste a YouTube, YouTube Music or Spotify link, mark a start and end time, and collect, reorder, rate and share those segments. Meloops stores links and timestamps. The music streams in the app through the official YouTube and Spotify players.

Read [`docs/youtube-feasibility.md`](docs/youtube-feasibility.md) and [`docs/spotify-feasibility.md`](docs/spotify-feasibility.md) first. They cover what each platform allows, including why there are no paid tiers.

## Run it

```bash
npm install
cp .env.example .env.local
npm run dev -- -H 127.0.0.1
```

Open http://127.0.0.1:3000. With no Supabase values set, the app runs in **demo mode**: no login, sample data, and everything saved in this browser.

## Modes

| Setup | Accounts | YouTube moments | Spotify moments |
|---|---|---|---|
| Nothing configured | Demo, this browser | Stream in the app; details from oEmbed | Spotify embed (often a 30 s preview, detected and explained) |
| + Supabase | Google sign-in, synced | same | same |
| + `YOUTUBE_API_KEY` | same | Song length known up front | same |
| + Spotify app | same | same | Full songs in the app for connected Premium users (5 allowlisted users in Development Mode) |

While a moment plays, the player dock shows the embedded player at 200 px or more with nothing on top of it, as YouTube requires. Minimising the dock pauses playback.

### Supabase + Google

1. Create a Supabase project. Run `supabase/migrations/0001_init.sql` in the SQL editor, or use `supabase db push`.
2. Under Authentication → Providers, enable Google with an OAuth client from Google Cloud. Add `http://127.0.0.1:3000/auth/callback` to the redirect URLs.
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

### Spotify

1. Create an app at developer.spotify.com/dashboard. The owner needs Premium.
2. Add the redirect URI `http://127.0.0.1:3000/api/spotify/callback`, and add each tester under User Management (5 maximum).
3. Set the `SPOTIFY_*` variables. Generate `SPOTIFY_TOKEN_KEY` with `openssl rand -base64 32`.

The Spotify connection is stored in an encrypted httpOnly cookie on each device. It is separate from the Google account, so disconnecting never touches playlists.

## Tests

```bash
npm test             # unit (Vitest)
npm run test:e2e     # Playwright at 390×844 and 320×640, against a production build in demo mode
```

YouTube refuses to play videos in automated browsers, so the e2e tests swap in stubs of the YouTube and Spotify player APIs (`tests/e2e/fixtures/`). Check real playback by hand on a phone, and record it in the live-check log in `docs/youtube-feasibility.md`.

## Layout

- `lib/providers/` holds the players: YouTube embed, Spotify embed, Spotify Web Playback SDK, and `rules.ts` (what plays next for each repeat mode, segment-end detection, Spotify preview detection). The UI never shows "playing" without state reported by the player.
- `lib/media/` parses YouTube and Spotify links and builds outbound links.
- `components/player-dock.tsx` is the dock that holds the embedded players.
- `lib/data/` defines the `Repo` contract, with a Supabase implementation and a localStorage one for demo mode.
- `lib/spotify/` handles URL parsing (client) plus OAuth, token sealing and metadata (server).
- `components/tape-strip.tsx` is the trim transport: start/end tabs, a playhead that follows and sets the player, Play from the playhead, loop and Mark start/end. `lib/client/use-trim-player.ts` drives the editor's own player (YouTube embed, Spotify embed, or the Premium SDK).
