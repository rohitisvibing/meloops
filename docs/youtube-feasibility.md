# YouTube feasibility audit

**Date checked:** 2026-10-19
**Scope:** Playing Meloops moments (a song plus start and end times) inside the web app with the YouTube embedded player. YouTube Music links work too, because they use the same video IDs.

Status labels: **Verified** (official source), **Observed** (seen in our own tests), **Uncertain** (not documented, or reported only by third parties).

## Official sources

- IFrame Player API: https://developers.google.com/youtube/iframe_api_reference
- Player parameters: https://developers.google.com/youtube/player_parameters
- Required Minimum Functionality: https://developers.google.com/youtube/terms/required-minimum-functionality
- Developer Policies: https://developers.google.com/youtube/terms/developer-policies
- API Services Terms of Service: https://developers.google.com/youtube/terms/api-services-terms-of-service
- Data API quota costs: https://developers.google.com/youtube/v3/determine_quota_cost

Clause numbers below came from page extracts. Two fetches disagreed on the numbering in section III.G, so check the live page before quoting any number in legal text.

## Playback

| Question | Finding | Status |
|---|---|---|
| Full songs without login? | Yes. The embed plays any embeddable public video. Ads may play. | Verified |
| Start at a time and stop at a time? | `loadVideoById({videoId, startSeconds, endSeconds})`: "the video will stop playing at the specified time". | Verified |
| Caveat | "If you specify an `endSeconds` value and then call `seekTo()`, the `endSeconds` value will no longer be in effect." Meloops also polls `getCurrentTime()` every 250 ms and pauses at the end. | Verified |
| Sequence moments | `playlist` can't set per-video times, so Meloops sequences moments itself: on the end event it calls `loadVideoById` for the next one. | Verified |
| Mobile autoplay | Browsers may block unmuted playback started without a tap. The `onAutoplayBlocked` event exists. Meloops starts the first moment inside the tap and, if it's blocked, shows "Tap play in the video to start". | Verified |
| Auto-advance on iOS after the first tap | Usually continues on the same player. Not documented. | **Uncertain**, test on device |
| Embedding disabled | Errors 101/150. Also returned for other restrictions (see live checks). | Verified / Observed |
| Missing Referer | Error 153. Meloops sends `Referrer-Policy: strict-origin-when-cross-origin` and never uses `noreferrer`. | Verified |
| Age-restricted videos | Generally fail in embeds. | **Uncertain** |
| YouTube Music "Topic" art tracks | Some have embedding disabled. | **Uncertain** |

## Rules that shape the UI

- Player viewport at least 200×200 px (RMF). The dock's player is at least 200 px tall at every width, and an e2e test checks the box.
- Nothing drawn over the player (RMF). The dock sits above sheets and page content. Controls sit below the video, never on it. The e2e test samples five points on the player with `elementFromPoint`.
- No automatic playback until the player is visible (RMF). The dock expands synchronously, using `flushSync`, before `loadVideoById` runs.
- No hidden, audio-only or background playback (Developer Policies III.I.7, III.I.9). Collapsing the dock pauses first.
- Don't modify or block the player or its ads (III.I.5, III.I.6). The player is used with documented parameters only.
- Don't cache or store audiovisual content (III.E.1). Meloops stores video IDs, labels and timestamps only.

## Money

- "must not charge users to watch content in an embedded YouTube player" (III.F.3.a). Paywalling playback is out.
- Selling an API client and ad-enabled clients are listed as permitted (III.G.2). Ads must not be placed on or within the video (III.G.1.c).
- A subscription that pays only for Meloops' own features (editing, sync, sharing), with playback free, is **Uncertain**. Ask YouTube API support before charging.
- See also the Spotify audit: Spotify Policy III.5 restricts products that combine Spotify with another service's streams.

## Metadata

- oEmbed (`https://www.youtube.com/oembed?url=…&format=json`) needs no key. It returns title, channel name and thumbnail. **Verified** live.
- Duration needs the Data API (`videos.list?part=contentDetails`, 1 quota unit, `YOUTUBE_API_KEY`). Without a key, Meloops learns the length from the player during the first preview.
- `search.list` now has its own bucket of 100 calls per day by default. Meloops doesn't search: users paste links.

## Live check log

| Date | Check | Result |
|---|---|---|
| 2026-10-19 | oEmbed for 5 official music videos | Worked, no key. |
| 2026-10-19 | Playback in automated Chromium and Chrome (headless, Playwright) | Every video, including `dQw4w9WgXcQ`, showed "This video is unavailable" (error 150). YouTube blocks automated browsers, so e2e tests use an API stub and real playback must be checked by hand. |
| — | iPhone Safari, Android Chrome: start, stop within ~300 ms of end, auto-advance, blocked-autoplay path | Not run yet. |

## Open questions

1. Does auto-advance keep playing on iOS Safari after the first tap?
2. How precise is `endSeconds` on mobile?
3. Which YouTube Music uploads (Topic channels, art tracks) allow embedding?
4. Is a subscription for non-playback features allowed (III.F.3.a vs III.G.2)?
