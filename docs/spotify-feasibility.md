# Spotify feasibility audit

**Date checked:** 2026-10-19
**Scope:** Meloops — a mobile-first web app for saving playlists of song *segments* (track link + start/end timestamps), using Spotify as the only music provider.

Status labels used below:

- **Verified** — stated in an official Spotify source listed here.
- **Uncertain** — not stated in official docs, contradicted, or only reported by community sources. Must be tested or confirmed with Spotify before relying on it.
- **Prohibited** — an official policy clause forbids it.

## Official sources

- Developer access update, 2026-02-06: https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security
- Web API quota update, 2026-07-23: https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates
- February 2026 migration guide: https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide
- Quota modes: https://developer.spotify.com/documentation/web-api/concepts/quota-modes
- Developer Policy (effective 2025-05-15): https://developer.spotify.com/policy
- Developer Terms (v10, 2025-05-15): https://developer.spotify.com/terms
- Embeds overview and terms: https://developer.spotify.com/documentation/embeds, https://developer.spotify.com/documentation/embeds/terms
- iFrame API: https://developer.spotify.com/documentation/embeds/references/iframe-api
- oEmbed: https://developer.spotify.com/documentation/embeds/reference/oembed
- Web Playback SDK: https://developer.spotify.com/documentation/web-playback-sdk
- Scopes and authorization: https://developer.spotify.com/documentation/web-api/concepts/scopes, https://developer.spotify.com/documentation/web-api/concepts/authorization
- Web API reference: Get Track, Start/Resume Playback, Seek, Get Playback State

Secondary (not authoritative, used only to flag uncertainty):

- https://community.spotify.com/t5/Spotify-for-Developers/Unable-to-embed-full-spotify-song-on-Electron-App/m-p/5938960
- https://techcrunch.com/2026/02/06/spotify-changes-developer-mode-api-to-require-premium-accounts-limits-test-users/

## Three different things

| Thing | What it means | Our status |
|---|---|---|
| API credentials | A Client ID/secret from the developer dashboard. | Available now (owner has Premium). |
| Production access (Extended Quota) | Permission to serve more than 5 users. | Not available to us: organizations only, 250k+ MAU. |
| Commercial permission | Permission to charge money or monetize. | Prohibited for streaming apps without written permission. |

## A. Developer access

| Question | Finding | Status |
|---|---|---|
| Can a new developer register an app today? | Yes. New Development Mode apps created after 2026-02-11 get the new restrictions; existing apps migrated 2026-03-09. | Verified |
| Is Premium required for Development Mode? | Yes: "Development Mode use will require a Spotify Premium account." If the owner's Premium lapses, the app stops working. | Verified |
| Authorized-user limit | "Each Client ID will be limited to up to five authorized users." Each user must be added to the app's allowlist. | Verified (Feb 2026). Whether it still applies after the July 2026 update is **Uncertain** — that post did not mention it. |
| Client IDs per developer | Raised from 1 to 25 (2026-07-23). Quota is counted per developer account across all IDs; 429 responses carry `"reason": "QUOTA_EXCEEDED"`. | Verified |
| Endpoints in Development Mode | Batch "get several" endpoints removed (`GET /tracks`, `/albums`, `/artists`, …). Search `limit` max 10. Track objects lose `available_markets`, `linked_from`, `popularity`. Playlist `/tracks` became `/items`, owned/collaborative playlists only. `GET /tracks/{id}` remains. | Verified |
| Extended Quota requirements | Organizations only (not individuals), established business, launched service, at least 250k MAU, key markets, commercial viability, adherence to terms. Applied for via partner form from a company email; review up to 6 weeks. | Verified |
| Does a public app need approval? | Yes, in practice: serving more than 5 users needs Extended Quota, which Spotify does not guarantee (Terms VI.7(b)). | Verified |
| Is Meloops eligible for Extended Quota? | No. It is an individual project with no MAU. | Verified |
| Credentials and configuration | Client ID, client secret, redirect URI(s) registered in the dashboard, allowlisted users (up to 5), owner Premium. | Verified |

## B. Track metadata and URLs

| Question | Finding | Status |
|---|---|---|
| Can a user paste a track URL? | Yes. We parse `open.spotify.com/track/{id}`, `open.spotify.com/intl-xx/track/{id}`, `?si=` query strings, and `spotify:track:{id}` URIs locally. | Verified (our code) |
| Is the ID extractable reliably? | Track IDs are 22 base-62 characters. Short links (`spotify.link/...`) need an HTTP redirect to a non-API page, so v1 rejects them with instructions. | Verified |
| Title, artist, duration, artwork | `GET /tracks/{id}` returns `name`, `artists`, `duration_ms`, `album.images`. oEmbed returns `title` (track name only) and `thumbnail_url`, with no artist or duration. | Verified |
| Does metadata need user authorization? | Client-credentials tokens reach "only endpoints that do not request user information", which should include Get Track; no page names it explicitly. Without a user, `market` must be passed or content "is considered unavailable". oEmbed documents no token. | **Uncertain** — test both |
| Caching limits | Terms IV.3(a)(i): do not create databases of Spotify Content or store it indefinitely. IV.3(b): no local caching except as strictly necessary. Policy II.5: metadata and cover art only in connection with the content; no playback without showing cover art and metadata. Policy II.4: attribute Spotify and link back. | Verified |
| Our approach | Store only the track ID plus *user-typed* title/artist/duration permanently. Spotify-sourced metadata lives in `track_meta_cache` with a 24 h TTL. Show artwork + metadata + a Spotify link whenever playing. | Design decision |
| Unavailable / deleted / region-restricted | Get Track returns 404 for unknown IDs; region-restricted tracks return without playable status for the given market. We show the error and fall back to manual entry. | Verified (behaviour per reference); exact region response **Uncertain** |

## C. Playback and segment controls

### iFrame Embed API

| Question | Finding | Status |
|---|---|---|
| Plays a track in the page? | Yes, via `IFrameAPI.createController` + `loadUri`/`loadEntity`. | Verified |
| Seek to a timestamp? | `seek(seconds)` exists, documented with podcast episodes. `startAt` (seconds) is an option of `loadEntity`/`loadUri`. Behaviour on music tracks is not documented. | **Uncertain** |
| Logged-out vs logged-in | Docs silent. Community reports: logged-out users get 30 s previews; full tracks only for logged-in users, possibly desktop only. | **Uncertain** |
| Stop at end timestamp | `playback_update` gives `position` and `duration` (ms); our code could call `pause()`. | Technically plausible, **Uncertain** |
| Autoplay | `play` "might not be supported in all browsers and for all users". | Verified |
| Terms | Widget shown "without alteration" (Embed Terms IV.3(a)), not obscured (IV.3(b)); Play Button not for commercial purposes (IV.3(e)); no local caching via widget (IV.2(c)). | Verified |

### Web Playback SDK + Web API player

| Question | Finding | Status |
|---|---|---|
| Premium required? | Yes, and "mobile only types of premium subscriptions are excluded". Player endpoints: "This API only works for users who have Spotify Premium." | Verified |
| Scopes | `streaming` for the SDK; `user-modify-playback-state` for play/seek; `user-read-playback-state` for state. `user-read-email`/`user-read-private` commonly requested but not documented as required. | Verified / **Uncertain** for the last two |
| Start at a timestamp | `PUT /me/player/play` with `uris` and `position_ms`. | Verified |
| Stop at end timestamp | SDK `player_state_changed` + `getCurrentState()` give position; our code calls `pause()`. | Technically possible |
| Advance between segments | Our code can issue the next `play` call. Endpoint execution order "is not guaranteed". | Technically possible; policy risk (see D) |
| Stays inside the web app? | Yes — the SDK creates a browser device. | Verified |
| Mobile browsers | iOS and Android listed. iOS: playback does not auto-start after transfer; call `activateElement()` from a user tap. | Verified; real-device behaviour to be tested |
| Commercial use | "This SDK must not be used in commercial projects without Spotify's prior written approval." | Verified |

### Are segment playlists permitted?

- Terms IV.2(a)(ii) prohibits "modifying, editing, altering, creating derivative works" (only resizing metadata/cover art excepted).
- Policy III.7: "Do not permit any device or system to segue, mix, re-mix, or overlap any Spotify Content."
- Policy III.11: no products that "mimic, or replicate or attempt to replace a core user experience of Spotify" without prior written permission.
- Neither document mentions "segments" or "excerpts".

Playing a track from a seek position and pausing it is ordinary player control, but a playlist that automatically jumps from one slice to the next comes close to "segue". **Uncertain.** Update 2026-10-22: at the owner's request, playlists now auto-play into the next moment for every provider, with Off / Repeat all / Repeat one modes. That accepts the III.7 risk for the private prototype. Settle it with Spotify before any public launch.

### Streaming vs playlist manager

Any in-app playback of sound recordings makes Meloops a **Streaming SDA** under the Developer Policy. Without playback (links out to Spotify only), it is a **Non-Streaming SDA**.

## D. Commercial feasibility

| Question | Finding | Status |
|---|---|---|
| Monetize a non-streaming playlist manager? | Policy IV.3.2 allows "the sale of, or sale of access to" a Non-Streaming SDA, within the policy's other limits. Terms III.1(a) still license SDAs "for private personal use", and V.5 forbids selling Spotify Content or data. | Possibly allowed; **Uncertain** without written confirmation |
| Timestamp functionality | Not addressed. See segment discussion above. | **Uncertain** |
| Charge for the app with playback | Policy IV.2: commercial uses not permitted for SDAs except limited Non-Streaming uses. IV.2.1 no sale of a Streaming SDA; IV.2.2 no in-app payment; IV.2.3 no ads or sponsorships. | **Prohibited** |
| Other platforms | Policy III.5: no product "integrated with streams or content from another service". III.9: limits on transferring data to other services. | Verified restriction |
| Written permission needed? | Yes, for: Web Playback SDK in a commercial project, anything under III.11, and any paid tier. | Verified |

**Consequence for ₹99/month or ₹499/year:** not implementable while the app plays Spotify audio. Revisit only as a Non-Streaming product, and only after Spotify confirms in writing.

## E. Verdict

**Accessible immediately**
- URL parsing, manual metadata entry, segments, playlists, reordering, likes, favourites, sharing — all provider-independent.
- "Open in Spotify" links.

**Requires credentials or account configuration**
- Track metadata via Get Track (client ID/secret) and oEmbed.
- Web Playback SDK playback (owner Premium, user Premium, user on the allowlist, redirect URI registered).

**Requires approval**
- More than 5 Spotify-connected users (Extended Quota — not reachable).
- Any commercial use of the Web Playback SDK.
- Any paid tier.

**Technically possible but restricted by policy**
- Auto-advancing segment playback (III.7 risk).
- Charging for a playback-capable app (IV.2 — prohibited).
- Storing Spotify metadata permanently (IV.3 — cache with TTL instead).

**Unsupported or uncertain**
- Segment playback via the iFrame embed (seek on music, preview limits).
- Spotify short links.
- Whether the 5-user cap survived the July 2026 update.

**Recommended initial integration**
- Update 2026-10-19: YouTube's embed is now the main in-app player (see `docs/youtube-feasibility.md`). Spotify moments use the SDK for Premium, or the embed with preview detection.
- Metadata: oEmbed + client-credentials Get Track (server side), cached 24 h, manual entry fallback.
- Playback: Web Playback SDK for connected Premium users; play from `position_ms`, pause at segment end. Otherwise "Open in Spotify".

**Safe MVP**
A free, private prototype for up to 5 allowlisted users. Google login for accounts; optional Spotify connection only for playback. No payments, no ads. Auto-play between moments is on, and its III.7 risk is accepted for the prototype only.

## Unresolved questions (to test with the owner's Premium account)

1. Does oEmbed respond without any token from our server? 
2. Does client-credentials `GET /tracks/{id}?market=IN` succeed in Development Mode?
3. Does SDK init succeed with only `streaming user-read-playback-state user-modify-playback-state`?
4. On iOS Safari, does `activateElement()` + `PUT /me/player/play` with `position_ms` start at the right spot? How close to `end_ms` can we pause?
5. Does the iFrame embed honour `startAt`/`seek` on music tracks for logged-in users? For logged-out users?
6. Would Spotify classify seek-and-pause segment playback as "altering" content? (Ask via developer support before any public launch.)
7. **Embed previews.** Spotify's docs don't mention previews. Community reports say the iFrame embed plays ~30 s previews on mobile browsers and for logged-out users, and that API-started `play()` can start a preview even for Premium. Meloops detects a preview-length stream and stops with an explanation. Confirm on real devices.
8. **Policy III.5.** "Do not create any product or service which is integrated with streams or content from another service." Meloops plays Spotify and YouTube moments in the same app and playlists. The owner accepted this risk for the private prototype (2026-10-19). Resolve it with Spotify before any public launch, or split or drop Spotify.
9. Meloops stores the song title and artist as the user's own labels, pre-filled from Spotify when available and editable. Is that "storing Spotify Content" under Terms IV.3? If yes, keep only user-typed labels and show Spotify metadata live from the 24 h cache.

## Live check log

| Date | Check | Result |
|---|---|---|
| 2026-10-19 | oEmbed from our server, no Spotify credentials configured | Works: returned title and thumbnail for 5 tracks (artwork rendered in the app). Answers question 1 for now; behaviour is undocumented and may change. |
| — | Client-credentials Get Track, SDK playback, iFrame seek | Not run yet. Needs the owner's Client ID/secret and Premium account. |
