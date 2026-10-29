import { expect, test } from "@playwright/test";
import { coveredPoints, stubPlayers, waitForYouTube } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
});

test("paste a YouTube link with a start time", async ({ page }) => {
  await stubPlayers(page, { speed: 1 });
  await page.reload();
  await page.getByPlaceholder("Paste a YouTube or Spotify link").fill("https://youtu.be/dQw4w9WgXcQ?t=42");
  await page.getByRole("button", { name: "Add song" }).click();
  await expect(page).toHaveURL(/provider=youtube&id=dQw4w9WgXcQ&t=42000/);
  await expect(page.getByRole("slider", { name: "Start of moment" })).toHaveAttribute("aria-valuetext", "00:42");
  await expect(page.getByRole("slider", { name: "End of moment" })).toHaveAttribute("aria-valuetext", "01:12");
  const title = page.getByLabel("Song title");
  if (await title.isVisible()) await title.fill("Never Gonna Give You Up");
  await page.getByLabel("Add to playlist").selectOption({ label: "Late night hooks" });
  await page.getByRole("button", { name: "Save moment" }).click();
  await expect(page).toHaveURL(/\/p\/p1/);
  await expect(page.getByText("00:42–01:12")).toBeVisible();
});

test("YouTube moments play in a visible, uncovered player and advance", async ({ page }) => {
  await stubPlayers(page);
  await page.goto("/p/p1");
  await expect(page.getByRole("heading", { name: "Late night hooks", level: 1 })).toBeVisible();
  await waitForYouTube(page);
  await page.getByRole("button", { name: "Play", exact: true }).click();

  const frame = page.locator('.dock-embed iframe[data-stub="youtube"]');
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute("data-video", "4NRXx6U8ABQ");

  // YouTube Required Minimum Functionality: at least 200x200, nothing drawn on top.
  const box = (await frame.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(200);
  expect(box.height).toBeGreaterThanOrEqual(200);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(await coveredPoints(page, box)).toEqual([]);

  await expect(page.locator(".dock-status")).toHaveText(/^01:0\d \/ 01:38$/);
  // The 36 s moment ends (stub runs 20x), and YouTube to YouTube advances on its own.
  await expect(frame).toHaveAttribute("data-video", "gGdGFtwCNBE", { timeout: 8000 });
  await expect(page.locator(".dock .row-title")).toHaveText("Mr. Brightside");

  // Collapsing pauses and hides the player.
  await page.getByRole("button", { name: "Pause and minimise player" }).click();
  await expect(frame).toBeHidden();
  await expect(frame).toHaveAttribute("data-state", "2");
  await expect(page.locator(".dock-status")).toContainText("Paused at");
});

test("blocked YouTube video explains and links out", async ({ page }) => {
  await stubPlayers(page, { blocked: ["4NRXx6U8ABQ"] });
  await page.goto("/p/p1");
  await waitForYouTube(page);
  await page.getByRole("button", { name: "Play Blinding Lights moment" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading")).toHaveText("YouTube won't play this video here");
  await expect(sheet.getByRole("link", { name: /Open on YouTube/ })).toHaveAttribute(
    "href",
    "https://www.youtube.com/watch?v=4NRXx6U8ABQ&t=62s",
  );
  await expect(page.locator(".dock")).toHaveAttribute("data-active", "false");
});

test("Spotify preview is not passed off as the moment", async ({ page }) => {
  await stubPlayers(page);
  await page.goto("/p/p2");
  await expect(page.getByRole("heading", { name: "Gym drops", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading")).toHaveText("Spotify sent a preview");
  await expect(sheet.getByRole("link", { name: /Open in Spotify/ })).toHaveAttribute(
    "href",
    "https://open.spotify.com/track/7qiZfU4dY1lWllzX7mPBI3",
  );
});

test("no horizontal overflow with the dock open", async ({ page }) => {
  await stubPlayers(page, { speed: 1 });
  await page.goto("/p/p1");
  await waitForYouTube(page);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator(".dock-embed iframe")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
