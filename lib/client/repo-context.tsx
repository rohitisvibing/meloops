"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isDemoMode } from "@/lib/env";
import { LocalRepo } from "@/lib/data/local-repo";
import { SupabaseRepo } from "@/lib/data/supabase-repo";
import type { Repo } from "@/lib/data/types";
import { createClient } from "@/lib/supabase/client";

export type AppUser = { id: string; name: string | null; email: string | null; avatarUrl: string | null };

type RepoContextValue = {
  repo: Repo;
  user: AppUser | null;
  /** Bumps after every write so screens can refetch. */
  version: number;
  refresh: () => void;
  signOut: () => Promise<void>;
};

const RepoContext = createContext<RepoContextValue | null>(null);

export function RepoProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const [user, setUser] = useState<AppUser | null>(null);
  const supabase = useMemo(() => (isDemoMode ? null : createClient()), []);
  const repo = useMemo<Repo>(() => (supabase ? new SupabaseRepo(supabase) : new LocalRepo()), [supabase]);

  useEffect(() => {
    if (!supabase) return;
    const apply = (u: { id: string; email?: string; user_metadata: Record<string, string> } | null) =>
      setUser(
        u
          ? {
              id: u.id,
              email: u.email ?? null,
              name: u.user_metadata.full_name ?? u.user_metadata.name ?? null,
              avatarUrl: u.user_metadata.avatar_url ?? null,
            }
          : null,
      );
    supabase.auth.getUser().then(({ data }) => apply(data.user));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => apply(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
    window.location.href = "/login";
  }, [supabase]);

  const value = useMemo(() => ({ repo, user, version, refresh, signOut }), [repo, user, version, refresh, signOut]);
  return <RepoContext.Provider value={value}>{children}</RepoContext.Provider>;
}

export function useRepo() {
  const ctx = useContext(RepoContext);
  if (!ctx) throw new Error("useRepo outside RepoProvider");
  return ctx;
}

/** Loads data from the repo and reloads whenever the repo version changes. */
export function useRepoQuery<T>(load: (repo: Repo) => Promise<T>, deps: unknown[] = []) {
  const { repo, version } = useRepo();
  const [state, setState] = useState<{ data: T | undefined; error: string | null; loading: boolean }>({
    data: undefined,
    error: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    load(repo).then(
      (data) => !cancelled && setState({ data, error: null, loading: false }),
      (err: Error) => !cancelled && setState({ data: undefined, error: err.message, loading: false }),
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, version, ...deps]);

  return state;
}

/** Runs a write, then refreshes every query. Errors go to the toast. */
export function useMutation() {
  const { repo, refresh } = useRepo();
  return useCallback(
    async <T,>(fn: (repo: Repo) => Promise<T>): Promise<T> => {
      try {
        return await fn(repo);
      } finally {
        refresh();
      }
    },
    [repo, refresh],
  );
}
