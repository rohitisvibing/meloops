import type { ReactNode } from "react";
import { AppProviders } from "@/components/app-providers";
import { BottomNav } from "@/components/bottom-nav";
import { PlayerDock } from "@/components/player-dock";
import { PlayPromptSheet } from "@/components/play-prompt-sheet";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppProviders>
      <main className="app-frame">{children}</main>
      <PlayerDock />
      <BottomNav />
      <PlayPromptSheet />
    </AppProviders>
  );
}
