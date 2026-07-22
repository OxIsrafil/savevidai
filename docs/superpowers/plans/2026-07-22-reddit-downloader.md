# Reddit Downloader + Speed Pass Implementation Plan (hybrid, anonymous-first)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Reddit (videos with server-merged audio, GIFs, single images) as a third platform on `/redditvideodownloader` with ZERO signup required, an OAuth upgrade path for galleries later, plus immutable asset caching, font preload, and a dashboard panel collapse.

**Architecture:** The resolver is hybrid: anonymous-first via vxreddit OG tags (bot UA) + v.redd.it's open `DASHPlaylist.mpd` manifest (the single source of truth for rendition names, heights, and audio presence); the official OAuth API activates automatically when `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET` exist. Video variants point at `/api/mux/{vid}/{h}.mp4`, which re-reads the manifest server-side, fetches the matching video+audio streams, merges with `ffmpeg -c copy` into a per-request temp file, streams it, and deletes it.

**Tech Stack:** Python 3.12, FastAPI, httpx, pytest, respx, stdlib xml.etree + html.parser, ffmpeg (Docker). TypeScript, Vite 6, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-22-reddit-downloader-design.md` (read before starting).

**Previous revision:** tasks marked "UNCHANGED from the previous revision" carry their full step-by-step detail (test code, snippets, exact strings) in the archived first revision: `git show 3d2bf01:docs/superpowers/plans/2026-07-22-reddit-downloader.md`. The dispatching controller extracts that task's text and hands it to the implementer alongside this plan's deltas.

## Global Constraints

- Response schema unchanged: `ResolveResponse(id, author, handle, avatar_url, text, items[MediaItem(index, kind, thumbnail, duration_seconds, variants[Variant(label, width, height, url, size_bytes)])])`.
- Reddit video labels are `<height>p` (existing `\d{2,4}p` regex); images use label `photo`. `handle` is the bare username; `author` displays `u/name`.
- Platform values exactly `twitter|tiktok|reddit` in every validator (backend EventIn, frontend types).
- Mux endpoint takes validated ids only, never URLs: `vid` matches `^[A-Za-z0-9]{8,20}$`, `height` in {144,240,360,480,540,720,1080}; manifest `BaseURL` values validated `^[A-Za-z0-9_.]+$`; all stream URLs server-constructed as `https://v.redd.it/{vid}/{base_url}`.
- Merged files are per-request temp files deleted before the request ends. Nothing is ever stored; the database holds only analytics counters.
- Proxy host matching stays exact-host or dot-suffix, never substring; no redirect-follow. Allowlist additions (`redd.it` suffix covering v./i.) are security-reviewed.
- Anonymous path requires NO configuration. OAuth path activates only when both env vars exist; galleries on the anonymous path raise `AppError("unsupported_post", "Reddit galleries are not supported yet.", 422)`.
- No transcoding: ffmpeg is `-c copy` only. No new Python/npm dependencies (OG parsing via stdlib).
- No em dashes and no emoji anywhere, including page copy, JSON-LD, SVG text.
- Backend commands from `backend/` with venv active (`source .venv/bin/activate`); frontend from `frontend/`. Warning baseline: 5. Conventional commit prefixes.

## Verified third-party contract (real calls; artifacts saved)

Probed 2026-07-22/23. Saved artifacts for fixtures: `.superpowers/sdd/vx-video.html` (real vxreddit response for post d8qo81) and `.superpowers/sdd/mpd-old.xml` (real manifest for vid enxxsuo5xko31).

- Reddit JSON anonymously: 403 everywhere. OAuth app creation currently blocked for the owner. Anonymous-first is the launch path.
- `https://www.vxreddit.com/r/<sub>/comments/<id>/<slug>/` with UA `Discordbot/2.0 (SaveVidAI; +https://savevidai.israfill.dev)` -> 200 HTML whose OG tags carry: `og:title` (post title), `og:site_name` = `u/<author> on r/<sub> - ...`, `og:type` (`video.other` for video), `og:video` = `https://vxreddit.com/redditvideo.mp4?video_url=<urlencoded v.redd.it HLS url>&audio_url=...`. The v.redd.it id is the first path segment of the decoded `video_url`. Plain UAs get a meta-refresh redirect page instead - the bot UA is REQUIRED.
- `https://v.redd.it/<vid>/DASHPlaylist.mpd` -> 200 anonymously. `<Representation>` elements carry `mimeType` (`video/mp4` / `audio/mp4`), `height`/`width` (video only), and a child `<BaseURL>` with the real file name. Old post observed: video BaseURLs `DASH_720`, `DASH_480`, `DASH_360`, `DASH_240` (extensionless) + audio BaseURL `audio`; new posts use `DASH_<h>.mp4` + `DASH_AUDIO_128.mp4`. Renditions fetch anonymously (206 on range requests, `video/mp4`).
- Image posts / galleries / share links via vxreddit: UNVERIFIED. Tasks treat image posts as best-effort (og:type non-video + og:image), galleries as `unsupported_post`, share links as try-vxreddit-then-clear-error. The Task 14 live gate refines these against reality and updates fixtures + copy if needed.

## File structure

Backend:
- Modify `backend/app/urls.py`, `backend/app/platforms.py` - reddit hosts/parsing/detection.
- Create `backend/app/reddit.py` - vxreddit fetch + OG parse, manifest fetch/parse, hybrid `extract_reddit`, mapper(s), OAuth client.
- Create `backend/app/mux.py` - manifest-driven merge endpoint.
- Modify `backend/app/errors.py` - `NOT_CONFIGURED` (kept for internal use), `UNSUPPORTED_POST`.
- Modify `backend/app/resolve.py`, `backend/app/sizes.py`, `backend/app/proxy.py`, `backend/app/analytics/router.py`, `backend/app/main.py`, `backend/Dockerfile`.

Frontend: identical file list to the previous revision of this plan (page, visual, plumbing, cache/font, BarList).

---

### Task 1: Reddit URL parsing + platform detection

UNCHANGED from the previous plan revision except one addition: `parse_reddit_url` must ALSO return the full normalized post path for vxreddit fetching. New return contract: `("post", post_id, path)` where `path` is `/r/<sub>/comments/<id>/<slug>/` when the sub/slug are known, else `/comments/<id>`; and `("share", url, path)` for share links (path = the share path). Update the brief's tests accordingly: each POST case also asserts `path.startswith("/")` and contains the id; the share case asserts the `/s/` path is preserved.

**Files:** Modify `backend/app/urls.py`, `backend/app/platforms.py`; tests in `backend/tests/test_urls.py`, `backend/tests/test_platforms.py`.

Steps: failing tests (REDDIT_POST_CASES + REDDIT_INVALID + share case + detection cases exactly as in the previous revision, adapted to the 3-tuple), verify failure, implement (host allowlist first; id regex `^[a-z0-9]{1,13}$`; hosts {reddit.com, www.reddit.com, old.reddit.com, np.reddit.com, redd.it}), green, commit:

```bash
ruff check . && cd .. && git add backend/app/urls.py backend/app/platforms.py backend/tests/test_urls.py backend/tests/test_platforms.py && git commit -m "feat: reddit url parsing and platform detection" && cd backend
```

---

### Task 2: vxreddit fetcher + OG parser

**Files:**
- Create: `backend/app/reddit.py` (anonymous-fetch half)
- Modify: `backend/app/errors.py`
- Test: `backend/tests/test_reddit_vx.py`
- Fixture source: copy the relevant OG tags from `.superpowers/sdd/vx-video.html` (real response) into the test file as a string fixture.

**Interfaces:**
- Produces: `errors.UNSUPPORTED_POST = ("unsupported_post", "Reddit galleries are not supported yet.", 422)`; `reddit._VX_UA = "Discordbot/2.0 (SaveVidAI; +https://savevidai.israfill.dev)"`; `reddit.fetch_vx(path: str) -> dict` returning `{"title": str, "author": str|None, "subreddit": str|None, "og_type": str|None, "vredd_id": str|None, "image_url": str|None}`; `reddit._parse_og(html: str) -> dict[str, str]` (property -> content, first occurrence wins, html.unescape applied).
- `vredd_id` extraction: parse `og:video`'s query string, take `video_url`, URL-decode, require host `v.redd.it`, first path segment must match `^[A-Za-z0-9]{8,20}$`, else None.
- `author`/`subreddit` from `og:site_name` pattern `u/<author> on r/<sub>`; tolerate absence (None).
- Network: httpx GET `https://www.vxreddit.com{path}` with the bot UA, timeout 12, follow_redirects False; non-200 or a body without any `og:` tags -> `app_error(UPSTREAM)`. A meta-refresh-to-reddit body (no og tags) is the plain-UA signature - same UPSTREAM mapping, log a warning that the UA may have stopped working.

- [ ] **Step 1: failing tests** covering: real-fixture parse (title, author `Dynna13337`, sub `funny`, og_type `video.other`, vredd_id `enxxsuo5xko31`); html-entity unescaping in titles; missing og:video -> vredd_id None; og:video with a NON-v.redd.it video_url host -> vredd_id None (security); meta-refresh plain body -> UPSTREAM; 404 -> UPSTREAM; image-post shape (synthetic fixture: og:type `website`/absent + og:image on i.redd.it) -> image_url populated.
- [ ] **Step 2: verify failure.** **Step 3: implement** (stdlib regex over meta tags is fine; keep it tolerant of attribute order). **Step 4: green + full suite.**
- [ ] **Step 5: Commit**

```bash
ruff check . && cd .. && git add backend/app/reddit.py backend/app/errors.py backend/tests/test_reddit_vx.py && git commit -m "feat: anonymous reddit post fetch via vxreddit og tags" && cd backend
```

---

### Task 3: DASH manifest parser

**Files:**
- Modify: `backend/app/reddit.py`
- Test: `backend/tests/test_reddit_manifest.py`
- Fixture: embed the real `.superpowers/sdd/mpd-old.xml` content as OLD_MPD; author a NEW_MPD fixture with `DASH_1080.mp4`/`DASH_720.mp4` video BaseURLs + `DASH_AUDIO_128.mp4` audio, same element structure.

**Interfaces:**
- Produces: `reddit.fetch_manifest(vid: str) -> Manifest` where `Manifest` is a small dataclass: `videos: list[Rendition]` (`Rendition = (height: int, width: int | None, base_url: str)`, sorted height DESC) and `audio_base: str | None`. Parsing via `xml.etree.ElementTree` handling the MPD default namespace; representations classified by `mimeType` prefix (`video/` vs `audio/`); BaseURL values validated `^[A-Za-z0-9_.]+$` (reject anything else - they become URL path segments); malformed/empty manifest or no video representations -> `app_error(NO_VIDEO)`; network error / non-200 -> UPSTREAM.
- `vid` re-validated `^[A-Za-z0-9]{8,20}$` at entry (defense in depth).

- [ ] **Step 1: failing tests:** OLD_MPD -> 4 videos (720/480/360/240, extensionless names) + audio_base "audio"; NEW_MPD -> heights + `.mp4` names + `DASH_AUDIO_128.mp4`; audio absent -> audio_base None; BaseURL with a slash or `..` -> rejected (NO_VIDEO or UPSTREAM, pick one and pin it); non-XML body -> UPSTREAM; heights sorted DESC.
- [ ] **Steps 2-4:** verify failure, implement, green + full suite.
- [ ] **Step 5: Commit**

```bash
ruff check . && cd .. && git add backend/app/reddit.py backend/tests/test_reddit_manifest.py && git commit -m "feat: v.redd.it dash manifest parser, names and heights from truth" && cd backend
```

---

### Task 4: Hybrid mapper + extract_reddit (anonymous path)

**Files:**
- Modify: `backend/app/reddit.py`
- Test: `backend/tests/test_reddit_map.py`

**Interfaces:**
- Produces: `map_reddit_vx(post_id: str, vx: dict, manifest: Manifest | None) -> ResolveResponse` (pure); `_map_guarded(...)` (tiktok-style guard); `extract_reddit(parsed: tuple) -> ResolveResponse`; `is_configured() -> bool` (env check, used by Task 5's OAuth path; for now `extract_reddit` routes: configured -> `_extract_oauth` (stub raising UPSTREAM until Task 5 lands - mark with a TODO consumed by Task 5), else anonymous).
- Anonymous flow: `fetch_vx(path)` -> if `vredd_id`: `fetch_manifest(vredd_id)` -> video variants one per rendition (label `f"{height}p"`, width/height from the rendition, url `/api/mux/{vid}/{height}.mp4` if `manifest.audio_base` else `https://v.redd.it/{vid}/{base_url}`), single `MediaItem(kind="video", index=1, duration_seconds=None)`. If no `vredd_id` but `image_url` on an allowed host (i.redd.it suffix): one `kind="image"` item, label `photo`. Neither -> `unsupported_post` when og tags exist (likely gallery/text), NO_VIDEO if manifest empty.
- `handle` = author or "unknown"; `author` = `f"u/{handle}"`; `text` = title; `id` = post_id; avatar None; thumbnail None (vx og:image for videos is unreliable - leave None; PreviewCard handles absent thumbnails).
- Share links: anonymous path calls `fetch_vx(share_path)` directly - if vxreddit resolves it, fine; a meta-refresh/no-og response maps to `AppError(INVALID_URL-code)`? No: use `app_error(NOT_FOUND)` with the standard message. (OAuth path in Task 5 does it properly.)

- [ ] **Step 1: failing tests:** video post (vx fixture dict + OLD-style Manifest) -> 4 variants, labels/mux URLs/dimensions correct, single video item; no-audio manifest -> direct v.redd.it URLs with the REAL base_url (extensionless) preserved; image post -> image item with i.redd.it URL; evil image host -> unsupported_post (not mapped); no media at all -> unsupported_post; guard test: malformed vx dict shape -> upstream_error via `_map_guarded`; `handle`/`author` contract.
- [ ] **Steps 2-4:** verify failure, implement, green + full suite.
- [ ] **Step 5: Commit**

```bash
ruff check . && cd .. && git add backend/app/reddit.py backend/tests/test_reddit_map.py && git commit -m "feat: reddit anonymous mapper and hybrid extract entrypoint" && cd backend
```

---

### Task 5: OAuth upgrade path

The previous plan revision's Task 2 (OAuth client: token cache, fetch_post, error mapping, share-link redirect follow) + Task 3 (OAuth mapper: is_video/gallery/image/gif handling incl PhotoGrid-shaped gallery items) COMBINED, adapted: `_extract_oauth(parsed)` replaces the stub from Task 4; galleries map to image items 1..N exactly like the TikTok slideshow shape; all fixture-driven (no live creds needed). Keep every test from both original task descriptions (token caching, 401-refresh-once, 404/403 mapping, not-configured guard, video ladder from `secure_media.reddit_video` limited to manifest-verified heights is NOT required here - OAuth path may trust `height` and emit the standard ladder at-or-below, since the mux endpoint re-reads the manifest anyway and picks nearest-at-or-below).

Commit:

```bash
ruff check . && cd .. && git add backend/app/reddit.py backend/tests/test_reddit_auth.py backend/tests/test_reddit_oauth_map.py && git commit -m "feat: reddit oauth upgrade path with gallery support" && cd backend
```

---

### Task 6: Resolve routing + analytics + sizes guard

As in the previous revision (resolve branch, cache key `f"reddit:{post_id}"` / `f"reddit:{share_url}"`, default TTL, platform-tagged events, EventIn adds `"reddit"`), PLUS: `backend/app/sizes.py` skips variants whose url starts with `/` (site-relative mux URLs are ours; HEADing them through httpx would fail pointlessly). Test: a variant with a `/api/mux/...` url keeps `size_bytes` None with zero HTTP calls (respx with no routes).

Commit:

```bash
ruff check . && cd .. && git add backend/app/resolve.py backend/app/analytics/router.py backend/app/sizes.py backend/tests/test_resolve_api.py backend/tests/test_analytics_api.py backend/tests/test_sizes.py && git commit -m "feat: resolve routes reddit; analytics accepts reddit; sizes skip relative urls" && cd backend
```

---

### Task 7: Proxy allowlist

UNCHANGED from the previous revision: `REDDIT_MEDIA_HOSTS = ("redd.it",)` exported from `reddit.py`, spliced into `_ALLOWED_HOSTS`; tests: `v.redd.it` + `i.redd.it` pass, `redd.it.evil.com` + `vredd.it` 403.

```bash
ruff check . && cd .. && git add backend/app/proxy.py backend/tests/test_proxy_api.py && git commit -m "feat: proxy allows reddit media hosts, suffix-safe" && cd backend
```

---

### Task 8: Mux endpoint (manifest-driven)

**Files:**
- Create: `backend/app/mux.py`
- Modify: `backend/app/main.py` (router), `backend/Dockerfile` (ffmpeg)
- Test: `backend/tests/test_mux_api.py`

**Interfaces:**
- `GET /api/mux/{vid}/{height}.mp4?filename=...`: validate vid `^[A-Za-z0-9]{8,20}$` and height in {144,240,360,480,540,720,1080} (422 otherwise). Flow: `reddit.fetch_manifest(vid)` -> pick the video rendition with the requested height, else nearest BELOW, else 404-style NO_VIDEO; audio = `manifest.audio_base`. No audio -> 307 redirect to `/api/proxy?url=https://v.redd.it/{vid}/{video_base}&filename=...`. Otherwise: download both streams (Content-Length cap 300 MB combined -> 413; anonymous, UA SaveVidAI/1.0) into a `tempfile.TemporaryDirectory`, run `ffmpeg -i v -i a -c copy -movflags +faststart out.mp4` via `asyncio.create_subprocess_exec` (60s timeout, nonzero exit -> UPSTREAM 502), stream `out.mp4` with Content-Length + `Content-Disposition: attachment` (sanitized filename, default `video.mp4`), and delete the temp dir in the stream generator's `finally`. Rate limit `10/minute`; `asyncio.Semaphore(2)` released on every path.
- Tests: respx-mock manifest + streams; monkeypatched fake ffmpeg writing a marker file. Cover: happy path (old-style extensionless names AND new-style .mp4 names); nearest-below height selection; bad vid/height 422; no-audio redirect (assert the exact proxy URL); oversize 413; ffmpeg failure 502 + temp dir gone; semaphore no-leak after failures; one real-ffmpeg integration test skip-marked `shutil.which("ffmpeg") is None`.

Commit:

```bash
ruff check . && cd .. && git add backend/app/mux.py backend/app/main.py backend/Dockerfile backend/tests/test_mux_api.py && git commit -m "feat: manifest-driven mux endpoint, stream-copy only, nothing stored" && cd backend
```

---

### Task 9: Frontend platform plumbing

UNCHANGED from the previous revision: `Platform` unions gain `"reddit"` everywhere; PlatformLinks third card `{key: "reddit", label: "Reddit", href: "/redditvideodownloader"}`; `proxyUrl(url, filename)` passes through site-relative URLs appending `?filename=`; tests for both branches + PlatformLinks href.

```bash
cd .. && git add frontend/src/components/PlatformLinks.tsx frontend/src/components/PlatformLinks.test.tsx frontend/src/lib/analytics.ts frontend/src/lib/download.ts frontend/src/lib/download.test.ts frontend/src/components/QualityButton.tsx frontend/src/components/PreviewCard.tsx frontend/src/components/PhotoGrid.tsx && git commit -m "feat: reddit platform plumbing, site-relative mux download path"
```

---

### Task 10: Reddit page

As in the previous revision (mirror the TikTok page files/tests/route/sitemap) with TWO copy changes:
- FAQ galleries answer: "Not yet. Reddit galleries are coming; videos, GIFs, and single images work today." (visible + JSON-LD, byte-identical).
- Example chip: `const EXAMPLE_URL = "https://www.reddit.com/r/funny/comments/d8qo81/baby_crocodiles_sound_like_theyre_shooting_laser/"` - live-verified resolving through the anonymous path on 2026-07-23.
Title "Reddit Video Downloader - With Audio, Free | SaveVid AI"; subhead "Paste a Reddit post link, get the video with audio, in seconds."; PasteInput placeholder "Paste a Reddit post link", ariaLabel "Reddit post link"; visit beacon platform "reddit" (exactly-once test first in file).

```bash
cd .. && git add frontend/redditvideodownloader.html frontend/src/reddit frontend/vite.config.ts frontend/public/sitemap.xml backend/app/main.py backend/tests/test_reddit_page.py && git commit -m "feat: dedicated /redditvideodownloader page"
```

---

### Task 11: Reddit how-to visual + OG image

UNCHANGED from the previous revision (fork TikTokHowToVisual: panel 2 `reddit.com/r/aww/comm…`, panel 3 pills `720p`/`480p`, saved line `user_1abc23x_720p.mp4`, footnote "With audio. Straight from the source.", aria "from Reddit"; og-reddit.png "Reddit Video Downloader" / "With audio. Free.").

```bash
cd .. && git add frontend/src/reddit/RedditHowToVisual.tsx frontend/src/reddit/RedditHowToVisual.test.tsx frontend/src/reddit/RedditApp.tsx scripts/make_og.py frontend/public/og-reddit.png frontend/redditvideodownloader.html && git commit -m "feat: reddit how-to visual and og image"
```

---

### Task 12: Cache headers + font preload

UNCHANGED from the previous revision (middleware: `/assets/*` + `/fonts/*` immutable year-long, HTML no-cache, `/api/*` untouched; Onest latin woff2 moved to `frontend/public/fonts/onest-latin-wght.woff2` with hand-written @font-face replacing the fontsource import, preload link in all FOUR html entries now - index, tiktok, reddit, admin if it shares the font).

```bash
cd .. && git add backend/app/main.py backend/tests/test_cache_headers.py frontend/src/styles/index.css frontend/public/fonts frontend/index.html frontend/tiktokvideodownloader.html frontend/redditvideodownloader.html frontend/admin.html && git commit -m "feat: immutable asset caching, no-cache html, font preload"
```

---

### Task 13: Dashboard BarList collapse

UNCHANGED from the previous revision (`maxRows` prop, qualities + countries pass 8, Show all (N)/Show less, tests for collapse/expand/under-limit).

```bash
cd .. && git add frontend/src/admin/Admin.tsx frontend/src/admin/Admin.test.tsx && git commit -m "feat: dashboard panels collapse long lists behind show-all"
```

---

### Task 14: Full verification (release gate, NO credentials required)

- [ ] Backend suite + ruff; frontend suite + build; dist has all four entries + og-reddit.png + fonts/.
- [ ] Live anonymous e2e through the dev server: resolve the example post (video, old-style names), one RECENT video post (new-style names - find one via the browser pane on a non-reddit aggregator or ask the owner for any reddit link), one no-audio GIF post if findable; mux download and `ffprobe` the file: exactly one video + one audio stream, `-c copy` sizes sane; image post best-effort check; gallery link shows the honest unsupported message; share link behavior recorded (works via vxreddit or clean error).
- [ ] Browser pass on `/redditvideodownloader` (themes, mobile stacked visual, cross-links on all three pages), Twitter + TikTok regression via example chips.
- [ ] Cache headers: curl -I local asset + `/`; post-deploy confirm `cf-cache-status: HIT` on second asset fetch.
- [ ] If any vxreddit/manifest reality differs from fixtures: fix fixtures, re-run affected tests, note in ledger. Commit verification fixes; whole-branch review judges merge readiness. Do not push or deploy without the owner.
