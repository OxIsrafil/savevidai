# Instagram downloader - design spec (2026-07-29)

## Goal

Add Instagram as the fourth platform (reels, single videos, single photos) on its own
SEO page `/instagramvideodownloader`, following the resolve-based model exactly. Facebook
is explicitly out of scope for this build. Metadata-light by owner decision: no author,
caption, or thumbnail in v1.

## Resolver (verified live 2026-07-29 against a real reel)

kkinstagram.com is a pure redirect service: `GET https://kkinstagram.com/reel/<shortcode>`
returns `302` with `Location:` pointing at a direct progressive MP4 (or image) on
`scontent.cdninstagram.com`. Facts verified by probe:

- The media 302 is gated on the User-Agent: only embed-crawler UAs get it, everything
  else (plain custom UA, browser UA, no UA) gets a 301 to a `kkclip.com` "open in app"
  page, and `curl/*` gets a 404. The UA therefore carries a `Discordbot/2.0` token
  alongside our own name and contact URL (verified live 2026-07-29).
- `/reel/<code>`, `/reels/<code>`, `/p/<code>` all resolve; indexed carousel forms
  (`/p/<code>/2`) 404. One media item per shortcode, no way to reach carousel items 2..N.
- Media is progressive (single file), NOT DASH. No muxing, no temp files, no disk.
- CDN URLs are NOT IP-bound (resolved on one IP, fetched from another) and serve
  `access-control-allow-origin: *` with byte-range support: the browser downloads
  directly from Instagram's CDN; VPS bandwidth per download is ~1KB (the resolve).
  /api/proxy remains a CORS fallback only.
- CDN URLs carry a signed `oe=` expiry a few hours out -> cache TTL 600s.
- The `efg` query param base64-decodes to JSON containing `duration_s`.
- Rejected alternatives: ddinstagram (403s), instafix.pages.dev (origin down),
  instagramez.com (HIJACKED - now 302s to an ad network; regression-test this class),
  direct Meta scraping (auth + datacenter-IP walls), paid JSON APIs (per-request cost
  underwater vs ad revenue).
- Single volunteer-run dependency, no fallback in v1: same documented posture as tikwm
  (see tiktok.py docstring). A fallback fixer can slot in later exactly like
  fxtwitter -> vxtwitter.

## Backend

### urls.py

- `INSTAGRAM_HOSTS = {"instagram.com", "www.instagram.com", "m.instagram.com", "instagr.am", "www.instagr.am"}`
- `_INSTAGRAM_SHORTCODE = re.compile(r"[A-Za-z0-9_-]{5,20}")`
- `parse_instagram_url(raw) -> str` returns the shortcode. Accepted path shapes:
  `/reel/<code>`, `/reels/<code>`, `/p/<code>`, `/tv/<code>`, and username-prefixed
  `/<user>/reel/<code>` and `/<user>/p/<code>` (user segment charset
  `[A-Za-z0-9._]{1,30}`). Trailing segments/slashes tolerated like the tweet parser.
  Host-allowlist FIRST so an arbitrary user URL is never forwarded to the third-party
  resolver (same rule as tiktok/reddit). Raise `InvalidTweetURL` otherwise.

### platforms.py

`detect_platform` gains an `INSTAGRAM_HOSTS` branch returning `"instagram"`.

### instagram.py (new)

- `INSTAGRAM_MEDIA_HOSTS = ("cdninstagram.com", "fbcdn.net")` - registrable suffixes;
  boundary-safe suffix match happens in proxy.py. NOTE: feeds the /api/proxy SSRF
  allowlist; widening it widens what the proxy fetches (same warning comment as tiktok).
- `_FIXER = "https://kkinstagram.com"`; request `GET {_FIXER}/reel/{shortcode}` with
  `_UA = "SaveVidAI/1.0 (compatible; Discordbot/2.0; +https://savevidai.israfill.dev)"`,
  `timeout=12.0`, `follow_redirects=False`.
- Mapping:
  - transport error, or any unanticipated exception while mapping -> `UPSTREAM`
    (guarded mapper, mirrors `_map_guarded` in tiktok.py)
  - 404 -> `NOT_FOUND`; any other non-302 -> `UPSTREAM`
  - `Location` must start `https://` and its host must suffix-match
    `INSTAGRAM_MEDIA_HOSTS`, else `UPSTREAM` + warning log (hijack/SSRF guard;
    this is the instagramez regression class)
  - kind from URL path extension: `.mp4`/`.mov` -> video; `.jpg`/`.jpeg`/`.png`/`.webp`
    -> image; `.gif` -> gif; unknown -> video (Instagram media URLs carry real
    extensions; verified)
  - `duration_seconds`: best-effort base64 decode of `efg` param -> `duration_s`;
    any failure -> None, never raises
  - Response: `id=shortcode`, `author="Instagram"`, `handle=shortcode`,
    `avatar_url=None`, `text=""`, one `MediaItem(index=1)` with one
    `Variant(label="hd", url=<location>)` (video) or `label="photo"` (image).
    `size_bytes=None` - fill_sizes fills it as for other platforms.

### proxy.py

`_ALLOWED_HOSTS = ("video.twimg.com", *TIKTOK_MEDIA_HOSTS, *REDDIT_MEDIA_HOSTS, *INSTAGRAM_MEDIA_HOSTS)`.
Boundary-safe matching is already in place; add explicit tests that
`cdninstagram.com.evil.com` and `effectivegatecpm.com` are rejected.

### resolve.py

Branch: `shortcode = parse_instagram_url(url)`, `key = f"instagram:{shortcode}"`,
resolver calls `extract_instagram(shortcode)`. Cache TTL override 600.0 (signed-URL
expiry), making the TTL choice three-way: tiktok 900, instagram 600, else default.

### analytics/router.py

Platform validator tuple gains `"instagram"`: `("twitter", "tiktok", "reddit", "instagram")`.
Aggregate-only invariant unchanged; no new event fields.

### main.py

`/instagramvideodownloader` + `/instagramvideodownloader.html` routes through
`PageRenderer` (ads marker + maintenance behavior come free, matching the other three).

## Frontend

- `frontend/instagramvideodownloader.html` shell: mirrors the tiktok shell - meta/OG/
  twitter tags ("Instagram Reel Downloader - fast, free, hd" register), JSON-LD FAQ,
  `<!--ADS-->` marker exactly once, ad-slot CSS, og-instagram.png.
- Vite `rollupOptions.input` gains `instagram: entry("./instagramvideodownloader.html")`.
- `src/instagram/`: `main.tsx` + `InstagramApp.tsx` mirroring RedditApp structure
  (hero, PasteInput, PreviewCard, HowTo, FAQ). PreviewCard renders metadata-light:
  no avatar (already nullable), handle shows the shortcode, no caption.
- Copy (owner voice, lowercase, honest): targets "instagram reel downloader";
  FAQ states carousels download the first item only; no watermark claims,
  no "no ads" claims.
- `PlatformLinks` gains the instagram entry on all pages.
- `lib/analytics.ts` visit/download beacons pass `platform: "instagram"` on the new
  page (same mechanism as tiktok/reddit pages).
- `frontend/public/sitemap.xml` gains the page; og-instagram.png generated via the
  existing make_og script.

## Error handling summary

| Condition | Result |
|---|---|
| bad host / malformed URL | `invalid_url` 4xx (parser) |
| kkinstagram timeout / transport error | `upstream_error` |
| kkinstagram 404 | `not_found` |
| kkinstagram non-302 (rate-limited, HTML page, hijack) | `upstream_error` |
| Location host not in allowlist | `upstream_error` + warning log |
| private post | surfaces as 404 -> `not_found` |

Failure is always a clean AppError; the mapper is exception-guarded so no upstream
shape change can 500.

## Testing (TDD throughout)

- Parser: every accepted URL shape incl. username-prefixed and short-host; rejects
  non-IG hosts, empty, garbage shortcodes, `/stories/` paths.
- Resolver: mocked httpx - 302 happy path (video + image extensions), 404 -> not_found,
  200/403/500 -> upstream, disallowed Location host -> upstream (hijack regression),
  efg duration parse + malformed efg -> None.
- Proxy: cdninstagram/fbcdn suffixes allowed; `cdninstagram.com.evil.com`,
  `effectivegatecpm.com` rejected.
- Resolve routing: instagram branch, cache key, 600s TTL pin.
- Analytics: validator accepts "instagram".
- Frontend: InstagramApp render + resolve flow + beacon platform; PlatformLinks;
  older-deploy guards unaffected.
- Gate: full backend suite + ruff (warnings baseline 7), frontend suite + build,
  live verification against a real reel before merge.

## Out of scope

Facebook, carousels beyond first item, metadata enrichment, fallback fixer, watermark
handling (none exists), stories/highlights.
