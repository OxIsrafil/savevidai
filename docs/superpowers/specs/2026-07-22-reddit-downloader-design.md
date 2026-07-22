# Reddit Downloader + Speed Pass - Design

Adds Reddit (videos with audio, GIFs, images, galleries) as a third platform on a dedicated `/redditvideodownloader` page, plus three ride-along improvements: immutable asset caching, font preload, and a dashboard panel collapse.

## Goals

1. Paste any Reddit post link, get the media: videos WITH audio (merged server-side), GIFs, single images, and galleries (photo grid + Save all, reusing the TikTok slideshow UI).
2. Dedicated page `/redditvideodownloader`, same pattern as `/tiktokvideodownloader` (SEO content, how-to visual, example chip, OG image, PlatformLinks row grows to three).
3. Speed: hashed assets cached immutably at the browser and Cloudflare edge; HTML explicitly no-cache; main font preloaded.
4. Dashboard: long BarList panels (Top qualities, countries) collapse to ~8 rows with a Show all toggle.

## Non-goals

- No transcoding, ever - the only ffmpeg use is `-c copy` stream merging.
- No media storage: merged files are per-request temp files, deleted before the request ends. The database (Turso) continues to hold only analytics counters.
- No YouTube. No quality-bucketing analytics rework (stays on the v2 roadmap; the collapse solves the display problem).

## Verified constraints (probed 2026-07-22)

- Anonymous server access to reddit JSON is dead: `403 Blocked` from curl/python on www/old/api.reddit.com even with browser headers, from a residential IP. Datacenter IPs (Render) will be worse. The resolver therefore uses Reddit's official OAuth API (free, 100 QPM, exists for exactly this).
- Owner action required: create a "script" app at reddit.com/prefs/apps; backend reads `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` env vars (same pattern as analytics env config). Without them, reddit URLs resolve to a clear `not_configured` error; all other platforms unaffected. Self-hosters who skip the vars simply have no Reddit support.
- `v.redd.it` / `i.redd.it` media bytes are expected to fetch anonymously (CDN). MUST be verified with a real post id during implementation (Task order puts the OAuth client first so ids are obtainable); if the CDN requires headers, the mux/proxy fetches add them.

## 1. Reddit resolver (`backend/app/reddit.py`)

**Auth:** module-level token cache. `_get_token()` POSTs `https://www.reddit.com/api/v1/access_token` with HTTP basic auth (client id/secret), `grant_type=client_credentials`, custom UA `SaveVidAI/1.0 (+https://savevidai.israfill.dev)`. Token cached in-process until ~60s before expiry; thread-safe. Missing env vars raise `AppError("not_configured", ..., 503)` before any network call.

**Fetch:** `GET https://oauth.reddit.com/comments/{post_id}?raw_json=1&limit=1` with `Authorization: bearer`. 401 refreshes the token once. 404 -> `NOT_FOUND`; 403 -> `PRIVATE`; other non-200/malformed -> `UPSTREAM`.

**URL forms accepted (`parse_reddit_url` in `urls.py`):** `reddit.com/r/<sub>/comments/<id>[/...]`, `reddit.com/comments/<id>`, `redd.it/<id>`, `old./np./www.` variants, and share links `reddit.com/r/<sub>/s/<token>`. Share links carry no post id; the resolver resolves them by following the redirect through an OAuth-authenticated request (never anonymous). Host allowlist first, exactly like Twitter/TikTok; post ids validated as base36 `[a-z0-9]{1,13}`.

**Mapping (`map_reddit`, pure, inside a `_map_guarded` clone):** all inside the existing `ResolveResponse` shape.
- Video posts (`is_video`, `secure_media.reddit_video`): quality variants from the DASH renditions at or below the source height (ladder 1080/720/480/360/240 intersected with `height`), labels `<h>p` (matches the existing regex `\d{2,4}p`). Variant URLs are SITE-RELATIVE mux paths: `/api/mux/{vredd_id}/{h}.mp4` when `has_audio` is true; direct `https://v.redd.it/{vredd_id}/DASH_{h}.mp4` when `has_audio` is false (no mux needed). The `vredd_id` is extracted from `fallback_url`.
- GIF posts (`preview.reddit_video_preview` or gifv): treated as no-audio video.
- Single image posts: one `kind="image"` item (i.redd.it URL, label `photo`).
- Galleries (`is_gallery`): `media_metadata` items in `gallery_data` order -> `kind="image"` items 1..N, exactly the TikTok slideshow shape (PhotoGrid renders it for free).
- `author` displays as `u/name`; `handle` is the BARE username (it feeds filenames, which cannot contain a slash); text = post title. `avatar_url` None (not worth an extra API call).
- Removed/quarantined/empty -> the matching existing error codes.

## 2. Mux endpoint (`backend/app/mux.py`, route `GET /api/mux/{vid}/{height}.mp4`)

- Path params validated hard: `vid` matches `[A-Za-z0-9]{8,20}`, `height` in {240,360,480,720,1080}. The server constructs both source URLs itself on `https://v.redd.it/` - no user-supplied URL ever reaches httpx. SSRF surface: zero new.
- Fetch video `DASH_{h}.mp4`; fetch audio by trying `DASH_AUDIO_128.mp4`, then `DASH_AUDIO_64.mp4`, then legacy `DASH_audio.mp4`; if none exist, redirect the client to `/api/proxy` for the bare video.
- `ffmpeg -i video -i audio -c copy -movflags +faststart out.mp4` in a per-request `tempfile.TemporaryDirectory`; stream the result with Content-Length + the sanitized filename; the context manager deletes everything before the response generator closes. Nothing persists.
- Guards: its own `asyncio.Semaphore(2)` (ffmpeg + disk), rate limit `10/minute`, per-stream size cap (~300 MB combined) enforced from Content-Length before download, 60s ffmpeg timeout -> `UPSTREAM` on failure, ffmpeg absence at boot logged loudly (health endpoint reports it).
- Dockerfile: `apt-get install -y ffmpeg` in the backend image. CI unchanged (tests mock subprocess; one integration test runs only when ffmpeg exists locally).

## 3. Reddit page (frontend)

- `frontend/redditvideodownloader.html` + `src/reddit/RedditApp.tsx` + `main.tsx`: mirror of the TikTok page structure (hero "Reddit Video Downloader", subhead, PasteInput placeholder "Paste a Reddit post link", PlatformLinks active="reddit", example chip, visit beacon platform "reddit", FAQ: audio yes - merged automatically; galleries yes; free yes; is it safe). Vite entry `reddit`; FastAPI route `GET /redditvideodownloader`; sitemap entry; `og-reddit.png` via `make_og.py` variant.
- `PlatformLinks` gains `{key: "reddit", label: "Reddit", href: "/redditvideodownloader"}`; type unions and `EventIn`/frontend validators gain `"reddit"`.
- How-to visual: `RedditHowToVisual` fork (panel 2 `reddit.com/r/.../comm…`, panel 3 pills `720p` [HD chip? only >=720 rule applies - 720p yes] + `480p`, footnote "With audio. Straight from the source.").
- Download flow: variants whose `url` starts with `/` are fetched directly (they are our own mux endpoint) instead of being wrapped in `/api/proxy?url=`. One small branch in the download helper; absolute `https://` URLs keep the existing proxy path. Filenames: existing `buildFilename` (`u_name_id_720p.mp4`-style via the standard builder).
- Proxy allowlist grows by `v.redd.it` and `i.redd.it` (suffix-safe, security-reviewed change).

## 4. Ride-alongs

- **Cache headers:** middleware (or StaticFiles subclass) in `main.py`: `/assets/*` (and font files) get `Cache-Control: public, max-age=31536000, immutable`; HTML responses (`/`, the two platform pages, static-mount index fallback) get `Cache-Control: no-cache`. Fixes cold-load speed at the Cloudflare edge AND the stale-HTML-after-deploy artifact.
- **Font preload:** the Onest font currently loads via the fontsource CSS import with a hashed URL, which static HTML cannot preload. Move the latin variable woff2 to `frontend/public/fonts/onest-latin-wght.woff2` with a hand-written `@font-face` (same family name, `font-display: swap`), drop the fontsource import, and add `<link rel="preload" as="font" type="font/woff2" crossorigin>` to all three HTML entries. Visual output must be identical (same family, weights, unicode range latin + latin-ext kept as a second face if currently used).
- **Dashboard collapse:** `BarList` gains `maxRows` (default show-all to avoid surprising other panels; qualities and countries panels pass `maxRows={8}`). When rows exceed it, render the first 8 + a "Show all (N)" toggle button; expanded state shows "Show less". Test covers collapse, expand, and the under-limit case (no toggle).

## Constraints carried forward

- Response schema unchanged; labels: `\d{2,4}p` for reddit video, `photo` for images; beacons one-per-action; platform values exactly `twitter|tiktok|reddit` wherever validated.
- Proxy: exact-host or dot-suffix, never substring; no redirect-follow; mux endpoint takes ids, never URLs.
- Analytics off unless configured; reddit resolver off unless configured (independent flags).
- No em dashes, no emoji anywhere. Conventional commits. Backend from `backend/` (venv), frontend from `frontend/`. Warning baseline 5.

## Testing/verification gate

Fixture-driven tests throughout (recorded OAuth/post JSON shapes); mux tests mock the CDN + subprocess. Live gate (needs owner's REDDIT_CLIENT_ID/SECRET): real resolve of a video post, a gallery, a share link; mux download plays WITH audio (ffprobe shows both streams); gallery Save all; page + cross-links + both themes; cache headers visible in prod responses after deploy (cf-cache-status HIT on second asset fetch); Twitter and TikTok flows re-verified unchanged.
