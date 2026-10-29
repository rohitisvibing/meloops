import { defineConfig } from "@playwright/test";

/** E2E runs against demo mode (no Supabase, no Spotify), at phone sizes first. */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:3000", hasTouch: true, isMobile: true },
  projects: [
    { name: "phone-390", use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 } },
    { name: "phone-320", use: { viewport: { width: 320, height: 640 }, deviceScaleFactor: 2 } },
  ],
  webServer: {
    command: "npx next build && npx next start -H 127.0.0.1 -p 3000",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: { NEXT_PUBLIC_DEMO_MODE: "1" },
  },
});
