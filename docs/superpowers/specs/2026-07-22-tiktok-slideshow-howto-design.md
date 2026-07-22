# TikTok Slideshow Downloader + How-To Visual - Design

Pre-merge additions to the `feature/tiktok` branch. Two features plus four small improvements, all scoped to ship before the branch merges.

## Goals

1. Download TikTok photo slideshows (photos + soundtrack), not just videos.
2. Give the TikTok page the same annotated how-to graphic the home page has, with TikTok-specific art.
3. Fold in four small improvements: HD chip on the `hd` pill, example chip on the TikTok page, shorter TikTok cache TTL, TikTok-specific OG image.

## Non-goals

- No server-side media processing (no ffmpeg, no zip assembly). Zero-cost model holds.
- No changes to the Twitter flow. The home page changes only if the HD chip rule touches shared code, and then only additively.
- No new third-party dependencies on the backend.

## 1. Slideshow backend

**Where:** `backend/app/tiktok.py` (`map_tiktok`), inside the existing `_map_guarded` protection.

**Detection:** tikwm returns `data.images: [str, ...]` for photo posts. When a non-empty `images` list is present, map the post as a slideshow instead of requiring `play`/`hdplay` video variants.

**Mapping:**
- One `MediaItem(kind="image")` per photo: `index` = 1-based position, `thumbnail` = the image URL itself, `duration_seconds` = None, one `Variant(label="photo", url=<image url>)`.
- One `MediaItem(kind="audio")` when tikwm's music mp3 URL is present: single `Variant(label="sound", url=<mp3 url>)`. No conversion - tikwm serves a ready mp3.
- If the real response also carries `play`/`hdplay` on photo posts (tikwm server-renders slideshows into a video with the sound baked in), include the video item(s) exactly as the video path does today. Verify against reality before finalizing; do not assume.
- A photo post with an empty/malformed `images` list and no video URLs raises `no_video`, same as today.

**Schema:** no backend model changes. `MediaItem.kind` comment widens to `"video" | "gif" | "image" | "audio"`. The frontend union in `frontend/src/lib/api.ts` (`kind: "video" | "gif"`) widens to match - it is a closed TS union and will not compile otherwise.

**Item indexes:** photos take `index` 1..N; the audio item takes `index` N+1. PreviewCard keys on `item.index`, so indexes must be unique within a post.

**Sizing:** `fill_sizes` must skip items whose kind is `image` or `audio` (photos/sound show no size label). Without this guard, a 30-photo album triggers 30 sequential HEAD requests inside the resolve handler (3s timeout each, worst case ~100s). Sizes stay for video/gif variants only.

**Verification contract (same discipline as the video resolver):** before finalizing, hit the real tikwm endpoint once with a public slideshow URL. Confirm: the `images` key name and shape, the music URL key and its host, the image byte hosts, and whether `play`/`hdplay` exist on photo posts. Check every observed host against the proxy allowlist (`tikwm.com`, `tiktokcdn.com`, `tiktokcdn-us.com`, `tiktokcdn-eu.com`, suffix-matched); widen `TIKTOK_MEDIA_HOSTS` only if an observed host falls outside it, and remember the tuple feeds the SSRF allowlist - changes there are security-reviewed.

**Analytics:** the `/api/event` quality regex widens to exactly `^(\d{2,4}p|video|hd|sd|photo|album|sound)$`.

## 2. Slideshow frontend

**Where:** `frontend/src/components/PreviewCard.tsx` (and a small new grid subcomponent if cleaner). `QualityButton`'s video download behavior is unchanged; its only edit is the HD chip rule in section 4.

**Rendering:** `kind="image"` items render as a thumbnail grid (the photos themselves), consistent with the existing card/panel tokens. `kind="audio"` renders as a small secondary "Sound" pill under the grid.

**Downloads:** through the proxy blob flow, with three known adaptations (the current flow hardcodes mp4 in places):
- A new filename helper for non-video media (`buildFilename` appends `.mp4` unconditionally): photos save as `{handle}_{id}_photo_{n}.jpg`, sound as `{handle}_{id}_sound.mp3`.
- The proxy currently responds `media_type="video/mp4"` always; it forwards the upstream Content-Type when present, falling back to `video/mp4`. The blob type on the frontend follows the response type.
- Tap a photo: saves that photo. `Save all`: downloads every photo sequentially with a short stagger, with per-photo success/fail state in the grid so a browser-blocked download is visible, never silently marked saved. No zip.

**Rate limit:** `/api/proxy` moves from 20/minute to 60/minute. TikTok albums run up to ~35 photos; at 20/minute Save all would 429 partway through. Abuse remains bounded by the per-IP limiter, the 8-slot semaphore, and bandwidth; photos are small.

**Browser behavior (known, documented):** Chrome prompts "allow multiple downloads" on the second programmatic save and drops the rest if denied; Safari is stricter. The per-photo state makes any drop visible, and the slideshow FAQ mentions the permission prompt in one sentence. No further engineering.

**Beacons:** one per user action, not per file. Single photo -> `quality: "photo"`; Save all -> one event `quality: "album"`; sound -> `quality: "sound"`. All carry `platform: "tiktok"`.

**Copy updates:** the slideshow FAQ answer flips from "Not yet" to yes in `frontend/tiktokvideodownloader.html` (both the visible `<details>` section and the JSON-LD block), phrased plainly, including the one-sentence multiple-downloads permission note. No em dashes, no emoji.

**Tests:** real-DOM tests for the grid render, per-photo filename, single-beacon-per-action semantics, and the sound button. Backend fixture tests for the slideshow mapping, empty-images edge, and sound-absent edge.

## 3. TikTok how-to visual

**Where:** new `frontend/src/tiktok/TikTokHowToVisual.tsx` (fork of `HowToVisual.tsx`, ~300 lines of inline SVG; forking over parameterizing because the panel art is platform-specific and the SVG is the component).

**Art, mirroring the home reference style (red marker annotations, theme-aware tokens):**
- Panel 1: TikTok post mock with Share > Copy link circled.
- Panel 2: input showing `tiktok.com/@user/vid…` + Fetch button, circled.
- Panel 3: quality pills - `hd` with HD chip (circled), `sd` - saved-file line (`user_123_hd.mp4`, check icon) and the note "No watermark. Straight from the source."
- Landscape flow on sm+ screens, stacked phone-only variant, same as home.

**Placement:** above the step cards on the TikTok page, same slot as home.

## 4. Extras

- **HD chip:** `QualityButton` shows the HD chip when `variant.label === "hd"` in addition to the existing height >= 720 rule. TikTok variants carry no dimensions, so this is the only signal. Intended render for the TikTok hd pill: the HD chip next to the label text "hd" (matches the how-to panel art).
- **Example chip:** the TikTok page gets the home-style "try an example" chip wired to a stable public TikTok video URL, verified resolving manually during implementation; input mirrors the URL, then resolves.
- **TikTok cache TTL:** TikTok resolve cache entries live ~15 minutes (twitter stays 1 hour). tikwm play URLs are time-signed; an hour-old cache hit can hand out a URL that 403s at download. This narrows the stale window; it does not close it (a user who resolves then waits 20 minutes can still hit a 403, surfaced as the retryable upstream error). Implementation detail (per-entry TTL or a second TTLCache instance) is the implementer's choice; behavior contract: a TikTok resolve older than 15 minutes re-resolves.
- **OG image:** TikTok-specific `og-tiktok.png` rendered with the existing `make_og.py` dev-script pattern; `tiktokvideodownloader.html` OG/Twitter meta points at it.

## Constraints carried forward

- Response shape unchanged; labels for video stay exactly `hd`/`sd`; watermarked URL never offered.
- Proxy matching stays exact-host or dot-suffix, never substring; no redirect-follow.
- Analytics off unless configured; no em dashes or emoji anywhere, including page copy.
- Backend from `backend/` with venv active; frontend from `frontend/`. Warning baseline is 5.

## Testing/verification gate

Full suites green, build emits all entries, and a live browser end-to-end on a real slideshow post: resolve, grid renders, single photo saves, Save all saves every photo, sound saves, beacons fire once per action. Video flow re-verified unchanged.
