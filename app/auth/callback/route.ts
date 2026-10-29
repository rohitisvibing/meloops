import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { relativeRedirect } from "@/lib/request-origin";

/** Google OAuth return: exchange the code for a Supabase session cookie. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const nextParam = request.nextUrl.searchParams.get("next") ?? "/";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    // First stop after sign-in: the optional Spotify step, which forwards on to `next`.
    if (!error) return relativeRedirect(`/welcome?${new URLSearchParams({ next })}`);
  }
  return relativeRedirect("/login?error=1");
}
