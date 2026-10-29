import { expect, test, type Page } from "@playwright/test";
import { coveredPoints, stableBox, stubPlayers, waitForYouTube } from "./helpers";

const LONG_TITLE = "Dorwin John - Zukhaam (Visualiser) Extended Live Session Version";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
});

async function openPlaylist(page: Page) {
  await page.goto("/p/p1");
  await expect(page.getByRole("heading", { name: "Late night hooks", level: 1 })).toBeVisible();
  await waitForYouTube(page);
}

const dockFrame = (page: Page) => page.locator('.dock-embed iframe[data-stub="youtube"]');

test("dock fits a long title on narrow screens", async ({ page }) => {
  await stubPlayers(page, { speed: 1 });
  await page.reload();
  await page.evaluate((title) => {
    const key = "meloops.demo.v2";
    const state = JSON.parse(localStorage.getItem(key)!);
    state.tracks[0].title = title;
    localStorage.setItem(key, JSON.stringify(state));
  }, LONG_TITLE);
  await openPlaylist(page);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(dockFrame(page)).toBeVisible();

  const width = page.viewportSize()!.width;
  const shell = (await page.locator(".dock-shell").boundingBox())!;
  const screen = (await page.locator(".dock-screen-video").boundingBox())!;
  const controls = (await page.locator(".dock-controls").boundingBox())!;
  expect(shell.x + shell.width).toBeLessThanOrEqual(width);
  expect(screen.x + screen.width).toBeLessThanOrEqual(shell.x + shell.width);
  expect(controls.x + controls.width).toBeLessThanOrEqual(shell.x + shell.width);
  const frame = (await dockFrame(page).boundingBox())!;
  expect(frame.height).toBeGreaterThanOrEqual(200);
  expect(frame.width).toBeGreaterThanOrEqual(200);
});

test("repeat one replays the same moment", async ({ page }) => {
  await stubPlayers(page, { speed: 30 });
  await openPlaylist(page);
  const repeat = page.getByRole("button", { name: /^Repeat:/ });
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await repeat.click();
  await repeat.click();
  await expect(repeat).toHaveAccessibleName("Repeat: this moment");
  await expect(dockFrame(page)).toHaveAttribute("data-loads", "2", { timeout: 8000 });
  await expect(dockFrame(page)).toHaveAttribute("data-video", "4NRXx6U8ABQ");
});

test("repeat all wraps from the last moment to the first", async ({ page }) => {
  await stubPlayers(page, { speed: 30 });
  await openPlaylist(page);
  await page.getByRole("button", { name: "Play Bohemian Rhapsody moment" }).click();
  await expect(dockFrame(page)).toHaveAttribute("data-video", "fJ9rUzIMcZQ");
  await page.getByRole("button", { name: /^Repeat:/ }).click();
  await expect(page.getByRole("button", { name: "Repeat: all" })).toBeVisible();
  await expect(dockFrame(page)).toHaveAttribute("data-video", "4NRXx6U8ABQ", { timeout: 8000 });
});

test("repeat off stops after the last moment, and the choice is remembered", async ({ page }) => {
  await stubPlayers(page, { speed: 30 });
  await openPlaylist(page);
  await page.getByRole("button", { name: "Play Bohemian Rhapsody moment" }).click();
  await expect(page.locator(".dock-status")).toHaveText("End of playlist", { timeout: 8000 });

  await page.getByRole("button", { name: "Repeat: off" }).click();
  await page.reload();
  await waitForYouTube(page);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "Repeat: all" })).toBeVisible();
});

test.describe("trim transport", () => {
  async function openEditor(page: Page, rowName: RegExp = /^Blinding Lights/) {
    await openPlaylist(page);
    await page.getByRole("button", { name: rowName }).click();
    const sheet = page.getByRole("dialog");
    return sheet;
  }

  async function openYouTubeEditor(page: Page) {
    const sheet = await openEditor(page);
    const frame = sheet.locator('.monitor-embed iframe[data-stub="youtube"]');
    await expect(frame).toBeVisible();
    await expect(frame).toHaveAttribute("data-state", "5");
    await expect(frame).toHaveAttribute("data-time", "62.0");
    return { sheet, frame, play: sheet.getByRole("button", { name: /^(Play from the playhead|Pause)$/ }) };
  }

  const time = async (frame: import("@playwright/test").Locator) => Number(await frame.getAttribute("data-time"));

  test("the video loads after the editor is reopened, uncovered", async ({ page }) => {
    await stubPlayers(page, { speed: 1 });
    let sheet = await openEditor(page);
    await sheet.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: /^Blinding Lights/ }).click();
    sheet = page.getByRole("dialog");
    const frame = sheet.locator('.monitor-embed iframe[data-stub="youtube"]');
    await expect(frame).toHaveCount(1);
    await expect(frame).toHaveAttribute("data-state", "5");
    await expect(sheet.getByRole("button", { name: "Play from the playhead" })).toBeEnabled();
    const box = await stableBox(frame);
    expect(box.width).toBeGreaterThanOrEqual(200);
    expect(box.height).toBeGreaterThanOrEqual(200);
    expect(await coveredPoints(page, box)).toEqual([]);
  });

  test("tapping the tape moves the playhead and the video", async ({ page }) => {
    await stubPlayers(page, { speed: 1 });
    const { sheet, frame } = await openYouTubeEditor(page);
    const track = sheet.locator('[data-tape-body="true"]');
    await track.scrollIntoViewIfNeeded();
    const box = await stableBox(track);
    await page.mouse.click(box.x + box.width * 0.8, box.y + box.height - 4);
    await expect.poll(() => time(frame)).toBeGreaterThan(200);
    const t = await time(frame);
    expect(t).toBeGreaterThan(200);
    expect(t).toBeLessThan(215);
    await expect(sheet.getByRole("slider", { name: "Playback position" })).toHaveAttribute("aria-valuenow", String(Math.round(t)));
  });

  test("play starts at the playhead inside the moment, otherwise at the start", async ({ page }) => {
    await stubPlayers(page, { speed: 1 });
    const { sheet, frame, play } = await openYouTubeEditor(page);
    const playhead = sheet.getByRole("slider", { name: "Playback position" });
    await playhead.focus();
    await page.keyboard.press("Shift+ArrowRight");
    await expect(frame).toHaveAttribute("data-time", "67.0");
    await play.click();
    await expect(frame).toHaveAttribute("data-state", "1");
    expect(await time(frame)).toBeGreaterThanOrEqual(67);
    expect(await time(frame)).toBeLessThan(70);
    await play.click();
    await expect(frame).toHaveAttribute("data-state", "2");

    // Outside the moment: Play goes back to the start.
    await playhead.focus();
    await page.keyboard.press("End");
    await play.click();
    await expect(frame).toHaveAttribute("data-state", "1");
    expect(await time(frame)).toBeLessThan(65);
  });

  test("moving the start tab while playing jumps playback there", async ({ page }) => {
    await stubPlayers(page, { speed: 1 });
    const { sheet, frame, play } = await openYouTubeEditor(page);
    await play.click();
    await expect(frame).toHaveAttribute("data-state", "1");
    await sheet.getByRole("slider", { name: "Start of moment" }).focus();
    await page.keyboard.press("Shift+ArrowRight");
    await expect(sheet.getByRole("slider", { name: "Start of moment" })).toHaveAttribute("aria-valuetext", "01:07");
    await expect(frame).toHaveAttribute("data-state", "1");
    expect(await time(frame)).toBeGreaterThanOrEqual(67);
    expect(await time(frame)).toBeLessThan(70);
  });

  test("moving the end tab while playing plays its last three seconds", async ({ page }) => {
    await stubPlayers(page, { speed: 1 });
    const { sheet, frame, play } = await openYouTubeEditor(page);
    await play.click();
    await sheet.getByRole("slider", { name: "End of moment" }).focus();
    await page.keyboard.press("Shift+ArrowRight");
    await expect(sheet.getByRole("slider", { name: "End of moment" })).toHaveAttribute("aria-valuetext", "01:43");
    await expect(frame).toHaveAttribute("data-state", "1");
    const t = await time(frame);
    expect(t).toBeGreaterThanOrEqual(100);
    expect(t).toBeLessThan(103);
  });

  test("the moment loops while playing", async ({ page }) => {
    await stubPlayers(page, { speed: 30 });
    const { frame, play } = await openYouTubeEditor(page);
    await play.click();
    await expect(frame).toHaveAttribute("data-loads", "2", { timeout: 8000 });
    await expect(frame).toHaveAttribute("data-state", "1");
  });

  test("mark start and end at the playhead", async ({ page }) => {
    await stubPlayers(page, { speed: 1 });
    const { sheet } = await openYouTubeEditor(page);
    const playhead = sheet.getByRole("slider", { name: "Playback position" });
    await playhead.focus();
    for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowRight");
    await sheet.getByRole("button", { name: "Mark start" }).click();
    await expect(sheet.getByRole("slider", { name: "Start of moment" })).toHaveAttribute("aria-valuetext", "01:10");
    await playhead.focus();
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("Shift+ArrowRight");
    await sheet.getByRole("button", { name: "Mark end" }).click();
    await expect(sheet.getByRole("slider", { name: "End of moment" })).toHaveAttribute("aria-valuetext", "01:20");
  });

  test("Spotify: the widget plays inside the editor and follows the tape", async ({ page }) => {
    await stubPlayers(page, { spotifyFull: true, spotifySpeed: 1 });
    await page.goto("/p/p2");
    await expect(page.getByRole("heading", { name: "Gym drops", level: 1 })).toBeVisible();
    await page.getByRole("button", { name: /^Shape of You/ }).click();
    const sheet = page.getByRole("dialog");
    const widget = sheet.locator('.trim-widget-embed iframe[data-stub="spotify"]');
    await expect(widget).toBeVisible();
    const play = sheet.getByRole("button", { name: "Play from the playhead" });
    await expect(play).toBeEnabled();
    await play.click();
    await expect(widget).toHaveAttribute("data-paused", "false");
    expect(Number(await widget.getAttribute("data-position"))).toBeGreaterThanOrEqual(60);

    await sheet.getByRole("slider", { name: "Start of moment" }).focus();
    await page.keyboard.press("Shift+ArrowRight");
    await expect(sheet.getByRole("slider", { name: "Start of moment" })).toHaveAttribute("aria-valuetext", "01:05");
    await expect.poll(async () => Number(await widget.getAttribute("data-position"))).toBeGreaterThanOrEqual(65);
    await expect(page.locator(".dock")).toHaveAttribute("data-active", "false");
  });

  test("Spotify preview: explains and turns off scrubbing", async ({ page }) => {
    await stubPlayers(page);
    await page.goto("/p/p2");
    await page.getByRole("button", { name: /^Shape of You/ }).click();
    const sheet = page.getByRole("dialog");
    const play = sheet.getByRole("button", { name: "Play from the playhead" });
    await expect(play).toBeEnabled();
    await play.click();
    await expect(sheet.getByText(/only sent a 30-second preview/)).toBeVisible();
    await expect(play).toBeDisabled();
    await expect(sheet.getByRole("slider", { name: "Playback position" })).toBeDisabled();
  });

  test("playing in the editor stops the playlist in the dock", async ({ page }) => {
    await stubPlayers(page, { speed: 1 });
    await openPlaylist(page);
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.locator(".dock")).toHaveAttribute("data-active", "true");
    await page.getByRole("button", { name: /^Mr\. Brightside/ }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.locator(".monitor-embed iframe")).toBeVisible();
    await sheet.getByRole("button", { name: "Play from the playhead" }).click();
    await expect(page.locator(".dock")).toHaveAttribute("data-active", "false");
  });
});
