import type { ReactNode } from "react";
import { AppProviders } from "@/components/app-providers";
import { PlayerDock } from "@/components/player-dock";
import { PlayPromptSheet } from "@/components/play-prompt-sheet";

/** Public share view: no bottom nav, so the dock sits at the bottom edge. */
export default function ShareLayout({ children }: { children: ReactNode }) {
  return (
    <AppProviders>
      <div style={{ ["--nav-h" as string]: "0px" }}>
        <main className="app-frame">{children}</main>
        <PlayerDock />
      </div>
      <PlayPromptSheet />
    </AppProviders>
  );
}
