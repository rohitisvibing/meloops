/** Public runtime config. Demo mode turns on automatically when Supabase isn't configured. */
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "1" || !supabaseUrl || !supabaseKey;

/** Whether the server has Spotify app credentials (set at build time for client display). */
export const spotifyConfigured = process.env.NEXT_PUBLIC_SPOTIFY_ENABLED === "1";
