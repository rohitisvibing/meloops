"use client";

import type { ReactNode } from "react";
import { PlayerProvider } from "@/lib/client/player-context";
import { RepoProvider } from "@/lib/client/repo-context";
import { ToastProvider } from "./toast";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <RepoProvider>
        <PlayerProvider>{children}</PlayerProvider>
      </RepoProvider>
    </ToastProvider>
  );
}
