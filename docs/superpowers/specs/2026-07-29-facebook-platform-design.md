# Facebook downloader - design spec (2026-07-29, rev2 after cold Fable review)

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
  `https://video.*.fna.fbcdn.net/...mp4?...&oe=<expiry>` (with `&amp;` HTML
  entities) and `og:title` carrying the post/page title. No `og:image` observed:
  thumbnail stays None (the PreviewCard first-frame video preview from commit
  7800031 covers display).
- Nonexistent video ids return **404** (verified with /watch/?v=1 and a 17-digit
  junk id). A 200 answer without og:video therefore most plausibly means a
  private/login-walled post, NOT a resolver failure: see mapping below.
- UA gate is inverted vs kkinstagram: bots and bare clients get og tags, real
  browser UAs get redirected. The existing hybrid UA
  `SaveVidAI/1.0 (compatible; Discordbot/2.0; +https://savevidai.israfill.dev)`
  works (verified); reuse it verbatim. Module docstring carries the same
  operational note as instagram.py: if resolves start failing with
  upstream_error, check this gate first.
- CDN URL verified fetchable from a different IP than the resolver's: HTTP 200,
  `content-type: video/mp4`, `access-control-allow-origin: *`, `accept-ranges:
  bytes`, content-length present. Progressive single file, not DASH: no muxing,
  no disk, browser downloads direct or via the existing /api/proxy fallback.
- Same `efg` base64 param scheme as Instagram (`duration_s` inside), same signed
  `oe=` expiry a few hours out -> cache TTL 600.0 like instagram.
- Rejected alternatives: fxfb.seria.moe (502 on every probe; its own README says
  unreliable), facebookez.com (HIJACKED: 301s to an ad network, same fate as
  instagramez - the redirect-host validation class again), direct Facebook
  scraping (bot walls, datacenter IP risk), paid APIs (per-request cost
  underwater).
- Single volunteer-run dependency, no fallback in v1: same documented posture as
  tikwm and kkinstagram.

## Backend

### urls.py

- `FACEBOOK_HOSTS = {"facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com", "fb.com", "www.fb.com", "fb.watch"}`
  (fb.watch is in the HOST set so its links are detected and attributed to the
  facebook platform in analytics, but the parser REJECTS them in v1: supporting
  them later becomes a parser-only change.)
- `parse_facebook_url(raw) -> tuple[str, str]` returning `(id, path)` where `path`
  is what the resolver appends to facebed.com, built ONLY from validated pieces
  (reddit-pattern). Video id regex `[0-9]{5,20}`; share token `[A-Za-z0-9]{1,32}`;
  page segment charset `[A-Za-z0-9.]{1,60}`. Accepted shapes:
  - `/watch` and `/watch/` with query `v=<digits>`: extract via `parse_qs`, take
    `v[0]`, must fullmatch the id regex; all other query params (mibextid, rdid,
    tracking junk) ignored. -> id=digits, path `/watch/?v=<id>`
  - `/reel/<digits>` -> id, path `/reel/<id>`
  - `/video.php` with query `v=<digits>` (legacy, still shared) -> path
    `/watch/?v=<id>`
  - `/story.php` with query `story_fbid=<digits>` (classic mobile share) -> path
    `/watch/?v=<id>`
  - `/<page>/videos/<digits>` and `/<page>/videos/<slug>/<digits>`: the id is the
    last all-digit segment occurring AFTER the `videos` segment (so
    `/12345678/videos/` can never pick the page id) -> path `/watch/?v=<id>`
    (normalized; facebed's documented shapes are watch/reel/share)
  - `/share/r/<token>`, `/share/v/<token>`, `/share/p/<token>` (share sheets emit
    /p/ for shared video posts) -> id=token, path `/share/<r|v|p>/<token>`
  - Anything else raises InvalidTweetURL. Host-allowlist FIRST, every platform's
    rule.
- OUT of v1 (parser rejects deliberately, tests pin): `fb.watch/<token>`
  (needs a facebook.com redirect hop we do not want to make), `/photo/` and
  `/photo.php` paths, group video permalinks, stories, live videos.

### efg.py (new, tiny shared helper)

`duration_from_efg(url: str) -> float | None`: the base64-JSON `efg` query param
parse currently private in instagram.py, lifted verbatim. instagram.py is
refactored to import it (its tests stay green unchanged); facebook.py imports the
same function. ONE implementation, no cross-platform private imports.

### facebook.py (new)

- `FACEBOOK_MEDIA_HOSTS = ("fbcdn.net",)` exported with the same SSRF warning
  comment, and SPLICED into proxy.py `_ALLOWED_HOSTS` like every sibling constant
  (the suffix is already present via INSTAGRAM_MEDIA_HOSTS; the duplicate is
  harmless and preserves the invariant that every `*_MEDIA_HOSTS` feeds the proxy,
  so a future widening cannot silently diverge). A test pins that
  `video.fhan5-6.fna.fbcdn.net` passes the proxy allowlist.
- `extract_facebook(parsed: tuple[str, str]) -> ResolveResponse`: GET
  `https://facebed.com<path>` with the hybrid UA, `timeout=12.0`,
  `follow_redirects=False` (a redirect answer means the UA gate flipped or the
  service was hijacked: upstream_error, never followed).
- og-tag extraction contract (regex over the HTML):
  - A meta tag matches only on EXACT property value: `og:video:secure_url` first;
    if absent, `og:video`. Never prefix-match (`og:video:type` with content
    "video/mp4" is the live trap and MUST NOT match). First matching tag in
    document order wins.
  - Tolerate both attribute orders (`property` before `content` and the reverse)
    and both quote styles. `html.unescape` the content (live URLs carry `&amp;`).
  - `og:title` same tolerance rules -> `text` (may be ""); absent -> "".
- Mapping (guarded mapper, mirrors instagram):
  - 404 -> NOT_FOUND; transport error or unanticipated exception -> UPSTREAM
  - any 3xx -> UPSTREAM (UA-gate flip / hijack; never followed)
  - other non-200 -> UPSTREAM
  - 200 without an og:video tag -> NOT_FOUND with an info-level log. Rationale
    (verified): nonexistent ids already 404, so the 200-no-og class is the
    private/login-walled case; NOT_FOUND's message ("doesn't exist or was
    deleted") is closer to truth than a retry-inducing upstream_error, and this
    keeps the admin error rate meaningful for real facebed outages.
  - og:video URL must be https and host suffix-match FACEBOOK_MEDIA_HOSTS
    (boundary-safe), else UPSTREAM + warning log (hijack class).
  - `author="Facebook"`, `handle=id`, `avatar_url=None`, `thumbnail=None`,
    duration via `duration_from_efg`. (handle=id renders as "@<digits>" and a
    digit in the avatar fallback circle: accepted cosmetic, consistent with
    instagram's shortcode handle; stem() collapses the filename duplicate.)
  - One MediaItem(index=1, kind="video", variant label "hd"); size_bytes=None
    (fill_sizes fills it).

### resolve.py

Branch before the reddit else: `parsed = parse_facebook_url(payload.url)`,
`key = f"facebook:{parsed[1]}"` (the PATH, not the id: share tokens and numeric
ids share no namespace, so keying on the id could alias an all-digit share token
with a video id; the path is collision-free by construction). Resolver
`extract_facebook(parsed)`. TTL: replace the ternary with a module-level dict
`_TTL = {"tiktok": 900.0, "instagram": 600.0, "facebook": 600.0}` and
`cache.set(key, result, ttl=_TTL.get(platform))`: correct because TTLCache.set
treats ttl=None as the default 3600 (verified in cache.py), so twitter/reddit
behavior is unchanged and existing TTL pins stay green. The signed-URL
explanatory comment currently above the ternary survives the refactor.

### platforms.py / analytics

- detect_platform gains FACEBOOK_HOSTS branch -> "facebook" (docstring updated).
- analytics/router.py validator tuple gains "facebook". No new event fields.

### main.py

`/facebookvideodownloader` + `.html` through PageRenderer, before the static mount.

## Frontend

Mirror the instagram page exactly (shell, vite entry `facebook`, `src/facebook/`
FacebookApp + main, sitemap entry, og-facebook.png via make_og variant
{"title": "Facebook Video Downloader", "subtitle": "Free. No fake buttons. One
real click."}). Explicit union/type updates this requires (the "no frontend type
changes" assumption is false): the platform union gains "facebook" in
PreviewCard.tsx (both the prop type and MediaSection's), QualityButton.tsx,
PhotoGrid.tsx, and PlatformLinks.tsx; PlatformLinks PLATFORMS gains
{ key: "facebook", label: "Facebook", href: "/facebookvideodownloader" }.

- Copy register: "Facebook Video Downloader - Fast, Free, HD | SaveVid AI";
  descriptions mirror instagram's with facebook wording ("Download Facebook
  videos and reels in HD. No fake download buttons, no forced redirects. Free
  and instant." / "Paste a Facebook link, get the video in seconds. No fake
  buttons, one real click.")
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
  4. "Is it safe to use SaveVid AI for Facebook?" / "Yes. There is no login and
     no account. We keep only anonymous, aggregate usage counts."
- Card renders og:title as the text line; first-frame video preview handles the
  missing thumbnail automatically.
- No watermark claims (none exists), no "no ads"/"open source"/"no tracking".
- Hero register: title case, matching the four existing pages (established
  ruling).

## Error handling summary

| Condition | Result |
|---|---|
| bad host / malformed URL / fb.watch | `invalid_url` (parser) |
| facebed timeout / transport error | `upstream_error` |
| facebed 404 | `not_found` |
| facebed 3xx (UA-gate flip, hijack) | `upstream_error`, never followed |
| facebed 200 without og:video (private post) | `not_found` + info log |
| og:video host off-allowlist | `upstream_error` + warning log |

## Testing (TDD, same gates)

- Parser: every accepted shape (watch with junk query params, reel, video.php,
  story.php, page/videos incl slug and the `/12345678/videos/` page-id trap,
  share r/v/p, fb.com, m/web subdomains), rejects: fb.watch, /photo/ paths,
  non-digit ids, oversize tokens, lookalike hosts (`facebook.com.evil.com`),
  profile-only paths.
- Resolver: mocked httpx: secure_url preferred over og:video, og:video:type
  prefix-trap pinned (must not match), attribute-order and quote-style variants,
  `&amp;` unescape pinned, og:title extraction, 200-no-og -> not_found,
  404 -> not_found, 302 -> upstream, off-allowlist og:video -> upstream (hijack
  regression), efg duration + malformed -> None, UA pin (exact string,
  follow_redirects=False, timeout 12.0).
- efg.py: instagram tests stay green after the refactor; direct unit tests move
  or are shared.
- Proxy: `video.fhan5-6.fna.fbcdn.net` accepted (pin), FACEBOOK_MEDIA_HOSTS
  spliced.
- Resolve routing: facebook branch, PATH-based cache key pinned, TTL dict keeps
  tiktok 900 / instagram 600 pins green, facebook 600 pinned.
- Frontend: FacebookApp mirror of InstagramApp tests (visit beacon platform
  "facebook", resolve flow, FAQ parity including "public videos and reels only"
  phrase), PlatformLinks 5 entries, union updates compile.
- Gate: full suites + ruff + build, live resolve of the two probe URLs, live
  end-to-end in browser, prod verification after deploy (resolve + HD download
  bytes + beacon 204).

## Out of scope

fb.watch short links (host detected, parser rejects), photo posts, stories, live
videos, group permalinks, carousels, fallback resolver, metadata beyond og:title.
