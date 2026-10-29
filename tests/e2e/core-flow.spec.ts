import { expect, test, type Page } from "@playwright/test";
import { stubPlayers } from "./helpers";

const TRACK = "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=abc";

test.beforeEach(async ({ page }) => {
  // Never load the real YouTube player in tests: it refuses automated browsers.
  await stubPlayers(page, { speed: 1 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("no horizontal overflow on main screens", async ({ page }) => {
  test.setTimeout(60_000);
  for (const path of ["/", "/p/p1", "/library?tab=moments", "/create?provider=youtube&id=dQw4w9WgXcQ", "/profile"]) {
    await page.goto(path);
    await page.waitForLoadState("load");
    await page.locator("main").first().waitFor();
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  await page.goto("/");
  await expect(page.getByText("Late night hooks").first()).toBeVisible();
});

test("rejects album links with a specific message", async ({ page }) => {
  await page.getByPlaceholder("Paste a YouTube or Spotify link").fill("https://open.spotify.com/album/4cOdK2wGLETKBW3PvgPWqT");
  await page.getByRole("button", { name: "Add song" }).click();
  await expect(page.locator(".field-error")).toHaveText("This is an album link. Paste a link to a single song.");
});

/** Serve song details for any link, so tests don't depend on Spotify or YouTube lookups. */
async function mockDetails(page: Page, meta: Record<string, unknown> | null) {
  await page.route("**/api/tracks/resolve**", (route) => {
    const url = new URL(route.request().url());
    const provider = url.searchParams.get("provider");
    const mediaId = url.searchParams.get("id");
    return route.fulfill({
      json: meta
        ? { ok: true, provider, mediaId, meta: { provider, mediaId, artworkUrl: null, source: provider, ...meta } }
        : { ok: true, provider, mediaId, meta: null, reason: "unavailable", message: "Song details can't be loaded right now." },
    });
  });
}

test("add a song: details fill in, the tape sets the moment, no extra fields", async ({ page }) => {
  await mockDetails(page, { title: "Never Gonna Give You Up", artists: ["Rick Astley"], durationMs: 213_573 });
  await page.getByPlaceholder("Paste a YouTube or Spotify link").fill(TRACK);
  await page.getByRole("button", { name: "Add song" }).click();
  await expect(page).toHaveURL(/\/create\?provider=spotify&id=4cOdK2wGLETKBW3PvgPWqT/);
  await expect(page.getByRole("heading", { name: "Never Gonna Give You Up" })).toBeVisible();

  // Only the playlist picker is left to fill in.
  for (const label of ["Song title", "Artist", /Song length/, /^Note/, "Start", "End"]) {
    await expect(page.getByLabel(label, { exact: typeof label === "string" })).toHaveCount(0);
  }

  const start = page.getByRole("slider", { name: "Start of moment" });
  const end = page.getByRole("slider", { name: "End of moment" });
  await start.focus();
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  await expect(start).toHaveAttribute("aria-valuetext", "00:40");
  await end.focus();
  await page.keyboard.press("Shift+ArrowRight");
  await expect(end).toHaveAttribute("aria-valuetext", "01:05");
  await expect(page.locator(".lcd").first()).toContainText("00:40");

  // Marking the end before the start is refused with a reason.
  const playhead = page.getByRole("slider", { name: "Playback position" });
  await playhead.focus();
  await page.keyboard.press("Home");
  await page.getByRole("button", { name: "Mark end" }).click();
  await expect(page.locator(".field-error[role=alert]")).toHaveText("End has to be at least 3 seconds after the start.");

  await page.getByLabel("Add to playlist").selectOption({ label: "Late night hooks" });
  await page.getByRole("button", { name: "Save moment" }).click();
  await expect(page).toHaveURL(/\/p\//);
  await expect(page.getByText("Never Gonna Give You Up")).toBeVisible();
  await expect(page.getByText("00:40–01:05")).toBeVisible();
  await expect(page.getByText("4 moments")).toBeVisible();
});

test("add a song whose details can't load: asks for a title", async ({ page }) => {
  await mockDetails(page, null);
  await page.getByPlaceholder("Paste a YouTube or Spotify link").fill(TRACK);
  await page.getByRole("button", { name: "Add song" }).click();
  const title = page.getByLabel("Song title");
  await expect(title).toBeVisible();
  await expect(page.getByText("We couldn't load this song's details. Name it so you can find it later.")).toBeVisible();
  await expect(page.getByLabel("Artist")).toHaveCount(0);

  await page.getByRole("button", { name: "Save moment" }).click();
  await expect(page.getByText("Name the song so you can find it later.")).toBeVisible();
  await expect(page).toHaveURL(/\/create/);

  await title.fill("Mystery hook");
  await page.getByLabel("Add to playlist").selectOption({ label: "Late night hooks" });
  await page.getByRole("button", { name: "Save moment" }).click();
  await expect(page).toHaveURL(/\/p\//);
  await expect(page.getByText("Mystery hook")).toBeVisible();
});

test("keyboard reorder persists after reload", async ({ page }) => {
  await page.getByText("Late night hooks").first().click();
  await expect(page).toHaveURL(/\/p\/p1/);
  const titles = () => page.locator(".rows .row-title").allTextContents();
  expect(await titles()).toEqual(["Blinding Lights", "Mr. Brightside", "Bohemian Rhapsody"]);

  const handle = page.getByRole("button", { name: /Move Blinding Lights/ });
  await handle.focus();
  for (const key of ["Space", "ArrowDown", "ArrowDown", "Space"]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(150);
  }
  await expect.poll(titles).toEqual(["Mr. Brightside", "Bohemian Rhapsody", "Blinding Lights"]);

  await page.reload();
  await expect.poll(titles).toEqual(["Mr. Brightside", "Bohemian Rhapsody", "Blinding Lights"]);
});

test("edit a moment: like, move the end, save", async ({ page }) => {
  await page.getByText("Late night hooks").first().click();
  await expect(page).toHaveURL(/\/p\/p1/);
  await expect(page.getByRole("heading", { name: "Late night hooks", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: /^Mr\. Brightside/ }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Like", exact: true }).click();
  await expect(sheet.getByRole("button", { name: "Like", exact: true })).toHaveAttribute("aria-pressed", "true");
  await sheet.getByRole("slider", { name: "End of moment" }).focus();
  await page.keyboard.press("Shift+ArrowRight");
  await sheet.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("01:15–02:07")).toBeVisible();
});

test("share link opens a read-only view", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByText("Late night hooks").first().click();
  await expect(page).toHaveURL(/\/p\/p1/);
  await page.getByRole("button", { name: "Share playlist" }).click();
  await page.getByRole("button", { name: "Create share link" }).click();
  const link = await page.getByLabel("Share link").inputValue();
  expect(link).toContain("/s/d.");

  const viewer = await context.newPage();
  await viewer.goto(link);
  await expect(viewer.getByRole("heading", { name: "Late night hooks" })).toBeVisible();
  await expect(viewer.getByText("01:02–01:38")).toBeVisible();
});

test("library search and favourites filter", async ({ page }) => {
  await page.goto("/library?tab=moments");
  await page.getByRole("button", { name: "Favourites", exact: true }).click();
  await expect(page.locator(".rows .row-title")).toHaveText(["Bohemian Rhapsody", "Blinding Lights"]);
  await page.getByPlaceholder("Search songs, artists, notes").fill("queen");
  await expect(page.locator(".rows .row-title")).toHaveText(["Bohemian Rhapsody"]);
});
