# Meloops

## Install

### 1. Requirements

- Node.js 20 or newer
- A [Supabase](https://supabase.com) project (for Google sign-in and saved playlists)
- Optional: a [Spotify developer app](https://developer.spotify.com/dashboard) (Spotify playback and song details)

### 2. Get the code

```bash
git clone https://github.com/rohitisvibing/meloops.git
cd meloops
npm install
cp .env.example .env.local
```

### 3. Set up Supabase

1. In the Supabase SQL editor, run `supabase/migrations/0001_init.sql`, then `supabase/migrations/0002_media_provider.sql`.
2. Authentication → Providers → Google: turn it on and paste a Google OAuth client ID and secret.
   - In Google Cloud, the OAuth client needs the JavaScript origin `http://127.0.0.1:3000` and the redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Authentication → URL Configuration: Site URL `http://127.0.0.1:3000`, redirect URL `http://127.0.0.1:3000/auth/callback`.
4. In `.env.local`, set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Project Settings → API).

### 4. Set up Spotify (optional)

1. In the Spotify dashboard, add the redirect URI `http://127.0.0.1:3000/api/spotify/callback`, and add each user's email under User Management.
2. In `.env.local`, set `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` and `SPOTIFY_REDIRECT_URI`.
3. Generate `SPOTIFY_TOKEN_KEY` with `openssl rand -base64 32` and add it to `.env.local`.

### 5. Run

```bash
npm run dev -- -H 127.0.0.1
```

Open http://127.0.0.1:3000 (use `127.0.0.1`, not `localhost`).

Without Supabase settings the app runs in demo mode: no sign-in, and data is saved in the browser.

### 6. Deploy (Vercel)

1. Import the repo in Vercel and add the same variables from `.env.local`, with `SPOTIFY_REDIRECT_URI` set to `https://<your-app>.vercel.app/api/spotify/callback`.
2. Add `https://<your-app>.vercel.app` to Supabase (Site URL and `/auth/callback` redirect), the Google OAuth JavaScript origins, and the Spotify redirect URIs.
