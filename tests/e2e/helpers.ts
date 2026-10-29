import type { Page } from "@playwright/test";
import path from "node:path";

const FIXTURES = path.join(__dirname, "fixtures");

/** Replace the YouTube and Spotify player APIs with the stubs in fixtures/. */
export async function stubPlayers(
  page: Page,
  { speed = 20, blocked = [] as string[], spotifyFull = false, spotifySpeed = 1 } = {},
) {
  await page.addInitScript(
    (opts) => {
      Object.assign(window, {
        __ytSpeed: opts.speed,
        __ytBlocked: opts.blocked,
        __spotifyFull: opts.spotifyFull,
        __spotifySpeed: opts.spotifySpeed,
      });
    },
    { speed, blocked, spotifyFull, spotifySpeed },
  );
  await page.route("https://www.youtube.com/iframe_api", (route) =>
    route.fulfill({ path: path.join(FIXTURES, "youtube-stub.js"), contentType: "text/javascript" }),
  );
  await page.route("https://open.spotify.com/embed/iframe-api/v1", (route) =>
    route.fulfill({ path: path.join(FIXTURES, "spotify-embed-stub.js"), contentType: "text/javascript" }),
  );
}

export async function waitForYouTube(page: Page, count = 1) {
  await page.waitForFunction(
    (n) => ((window as unknown as { __ytPlayers?: unknown[] }).__ytPlayers?.length ?? 0) >= n,
    count,
  );
}

/** Points inside `box` that are not the iframe itself, i.e. something drawn over the player. */
export async function coveredPoints(page: Page, box: { x: number; y: number; width: number; height: number }) {
  return page.evaluate(({ x, y, width, height }) => {
    const points = [
      [x + 4, y + 4],
      [x + width - 4, y + 4],
      [x + width / 2, y + height / 2],
      [x + 4, y + height - 4],
      [x + width - 4, y + height - 4],
    ];
    return points
      .map(([px, py]) => document.elementFromPoint(px, py))
      .filter((el) => el?.tagName !== "IFRAME")
      .map((el) => (el ? `${el.tagName}.${el.className}` : "nothing"));
  }, box);
}

/** Bounding box once it stops moving (sheets slide in), so point sampling hits the right spot. */
export async function stableBox(locator: import("@playwright/test").Locator) {
  let previous = await locator.boundingBox();
  for (let i = 0; i < 20; i++) {
    await locator.page().waitForTimeout(50);
    const next = await locator.boundingBox();
    if (previous && next && previous.x === next.x && previous.y === next.y) return next;
    previous = next;
  }
  return previous!;
}
