# Facebook downloader - design spec (2026-07-29)

## Goal

Add Facebook as the fifth platform (videos and reels, NO photo posts) on its own SEO
page `/facebookvideodownloader`, following the resolve-based model. Deltas from the
Instagram platform only; everything unstated mirrors the instagram implementation.

## Resolver (verified live 2026-07-29)

facebed.com (github.com/facebed/facebed, volunteer-run) mirrors Facebook paths and
serves HTML whose Open Graph tags carry a direct progressive MP4 on Facebook's CDN.
Facts verified by probe:

- `GET https://facebed.com/reel/578721235067082` and `/watch/?v=1664876787784263`
  return 200 HTML with `og:video` / `og:video:secure_url` pointing at
  `https://video.*.fna.fbcdn.net/...mp4?...&oe=<expiry>` and `og:title` carrying the
  post/page title. No `og:image` observed: thumbnail stays None (the PreviewCard
  first-frame video preview from commit 7800031 covers display).
- UA gate is inverted vs kkinstagram: bots and bare clients get og tags, real
  browser UAs get redirected. The existing hybrid UA
  `SaveVidAI/1.0 (compatible; Discordbot/2.0; +https://savevidai.israfill.dev)`
  works (verified); reuse it verbatim.
- CDN URL verified fetchable from a different IP than the resolver's: HTTP 200,
  `content-type: video/mp4`, `access-control-allow-origin: *`, `accept-ranges: bytes`,
  content-length present. Progressive single file, not DASH: no muxing, no disk,
  browser downloads direct or via the existing /api/proxy fallback.
- Same `efg` base64 param scheme as Instagram (`duration_s` inside), same signed
  `oe=` expiry a few hours out -> cache TTL 600.0 like instagram.
- Rejected alternatives: fxfb.seria.moe (502 on every probe; its own README says
  unreliable), facebookez.com (HIJACKED: 301s to an ad network, same fate as
  instagramez - the redirect-host validation class again), direct Facebook scraping
  (bot walls, datacenter IP risk), paid APIs (per-request cost underwater).
- Single volunteer-run dependency, no fallback in v1: same documented posture as
  tikwm and kkinstagram.

## Backend

### urls.py

- `FACEBOOK_HOSTS = {"facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com", "fb.com", "www.fb.com"}`
- `parse_facebook_url(raw) -> tuple[str, str]` returning `(id, path)` where `path`
  is what the resolver appends to facebed.com, built ONLY from validated pieces
  (reddit-pattern). Accepted shapes:
  - `/watch?v=<digits>` and `/watch/?v=<digits>` -> id=digits, path `/watch/?v=<id>`
  - `/reel/<digits>` -> id, path `/reel/<id>`
  - `/<page>/videos/<digits>` and `/<page>/videos/<slug>/<digits>` (page charset
    `[A-Za-z0-9.]{1,60}`, id = LAST all-digit segment) -> path `/watch/?v=<id>`
    (normalized; facebed's documented shapes are watch/reel/share)
  - `/share/r/<token>` and `/share/v/<token>` (token `[A-Za-z0-9]{1,32}`) ->
    id=token, path `/share/<r|v>/<token>`
  - video id regex `[0-9]{5,20}`; anything else raises InvalidTweetURL.
  - Host-allowlist FIRST, same rule as every platform.
- OUT of v1: `fb.watch/<token>` short links (needs a facebook.com redirect hop we
  do not want to make), photo posts, live videos, stories.

### facebook.py (new)

- `FACEBOOK_MEDIA_HOSTS = ("fbcdn.net",)` exported with the same SSRF warning
  comment. proxy.py needs NO change (fbcdn.net already allowed via
  INSTAGRAM_MEDIA_HOSTS); a test pins that a `video.fhan5-6.fna.fbcdn.net` URL
  passes the proxy allowlist.
- `extract_facebook(parsed: tuple[str, str]) -> ResolveResponse`: GET
  `https://facebed.com<path>` with the hybrid UA, `timeout=12.0`,
  `follow_redirects=False` (a redirect answer means the UA gate flipped or the
  service was hijacked: upstream_error, never followed).
- Mapping (guarded mapper, mirrors instagram):
  - 404 -> NOT_FOUND; transport error or unanticipated exception -> UPSTREAM
  - non-200 (incl 3xx) -> UPSTREAM
  - Parse the FIRST `og:video:secure_url` (fallback `og:video`) meta tag from the
    HTML with a regex over `<meta property="..." content="...">`; html.unescape
    the content. No tag found -> UPSTREAM (facebed answers 200 for pages it cannot
    resolve; treating that as not_found would lie about private posts).
  - URL must be https and host suffix-match FACEBOOK_MEDIA_HOSTS (boundary-safe),
    else UPSTREAM + warning log (hijack class).
  - `og:title` content, html.unescaped -> `text` (may be ""); `author="Facebook"`,
    `handle=id`, `avatar_url=None`, `thumbnail=None`.
  - duration: same `_duration` efg helper as instagram - import it from
    app.instagram rather than duplicating (rename there to a shared private is NOT
    needed; plain import of `_duration` is acceptable within the app package, or
    lift it to a tiny shared helper if the implementer prefers - either way ONE
    implementation).
  - One MediaItem(index=1, kind="video", label "hd"); size_bytes=None (fill_sizes).

### resolve.py

Branch before the reddit else: `parsed = parse_facebook_url(payload.url)`,
`key = f"facebook:{parsed[0]}"`, resolver `extract_facebook(parsed)`. TTL: refactor
the ternary into the per-platform dict the instagram final review called for:
`_TTL = {"tiktok": 900.0, "instagram": 600.0, "facebook": 600.0}` ->
`cache.set(key, result, ttl=_TTL.get(platform))`. Existing TTL tests must stay green.

### platforms.py / analytics

- detect_platform gains FACEBOOK_HOSTS branch -> "facebook" (docstring updated).
- analytics/router.py validator tuple gains "facebook". No new event fields.

### main.py

`/facebookvideodownloader` + `.html` through PageRenderer, before the static mount.

## Frontend

Mirror the instagram page exactly (shell, vite entry `facebook`, `src/facebook/`
FacebookApp + main, PlatformLinks entry { key "facebook", label "Facebook",
href "/facebookvideodownloader" }, sitemap entry, og-facebook.png via make_og
variant {"title": "Facebook Video Downloader", "subtitle": "Free. No fake buttons.
One real click."}). Deltas:

- Copy register: "Facebook Video Downloader - Fast, Free, HD | SaveVid AI";
  descriptions mirror instagram's with facebook wording ("Download Facebook videos
  and reels in HD. No fake download buttons, no forced redirects. Free and
  instant." / "Paste a Facebook link, get the video in seconds. No fake buttons,
  one real click.")
- JSON-LD FAQ, four Q/As (visible FAQ in shell must be character-identical):
  1. "Can I download Facebook videos and reels?" / "Yes. Paste the video or reel
     link and you get the file in HD, straight from Facebook's servers. Public
     posts only."
  2. "Is the Facebook downloader free?" / "Yes. No fake download buttons and no
     forced redirects: your download is always one real click. A small ad keeps
     the site free."
  3. "Can I download photos or private videos?" / "Not yet. Photo posts and
     private or friends-only videos are not supported: public videos and reels
     only."
  4. "Is it safe to use SaveVid AI for Facebook?" / "Yes. There is no login and no
     account. We keep only anonymous, aggregate usage counts."
- Card renders og:title as the text line; first-frame video preview handles the
  missing thumbnail automatically (no PreviewCard change expected).
- No watermark claims (none exists), no "no ads"/"open source"/"no tracking".
- Hero register: title case, matching the four existing pages (established ruling).

## Error handling summary

Same table as instagram, with: facebed 200-without-og:video -> upstream_error;
facebed 3xx -> upstream_error (never followed).

## Testing (TDD, same gates)

- Parser: every accepted shape (watch, reel, page/videos incl slug, share r/v,
  fb.com, m/web subdomains), rejects: fb.watch, /photo/ paths, non-digit ids,
  oversize tokens, lookalike hosts, profile-only paths.
- Resolver: mocked httpx: og parse happy path (secure_url preferred over og:video,
  entity unescaping pinned with &amp; in URL), title extraction, missing og:video
  -> upstream, 404 -> not_found, 302 -> upstream (UA-gate flip), off-allowlist
  og:video -> upstream (hijack regression), efg duration + malformed -> None, UA
  pin test (exact UA string, follow_redirects=False, timeout 12.0).
- Proxy: fbcdn regional host accepted (pin), no allowlist change needed.
- Resolve routing: facebook branch, cache key, TTL dict refactor keeps tiktok 900 /
  instagram 600 pins green, facebook 600 pinned.
- Frontend: FacebookApp mirror of InstagramApp tests (visit beacon platform
  "facebook", resolve flow, FAQ parity including "public videos and reels only"
  phrase), PlatformLinks 5 entries.
- Gate: full suites + ruff + build, live resolve of the two probe URLs, live
  end-to-end in browser, prod verification after deploy (resolve + HD download
  bytes + admin beacon 204).

## Out of scope

fb.watch short links, photo posts, stories, live videos, carousels, fallback
resolver, metadata beyond og:title.
