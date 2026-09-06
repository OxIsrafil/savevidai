# Ads monetization + closed-source copy sweep - design

Date: 2026-07-24
Status: approved (brainstorm + cold Fable review pass, rev 2)
Superseded: ads removed from the site and the codebase on 2026-09-06 (owner decision, branch chore/remove-ads). Kept as history.
Branch: feature/ads-monetization

## Problem

The site needs to earn its costs (~$14/mo VPS + domain). Owner decision: monetize
with Adsterra (downloader-friendly network) using one banner plus one popunder
per visit, kept as light as possible. The GitHub repo was flipped PRIVATE on
2026-07-24, so every "open source / MIT / read the code / self-host" claim on
the site is now false and every GitHub link 404s for visitors.

Two goals in one change:
1. A server-side ad slot system that is OFF by default, network-agnostic
   (Adsterra first, swappable to HilltopAds or others by pasting a different
   snippet), and never delays or gates a download.
2. A copy sweep so the site only promises things that remain true - across
   HTML shells, page titles, OG images, React heroes, structured data, and
   the maintenance page.

## Owner constraints (pinned)

- Downloads stay instant: our code never adds interstitials, waits, or gates
  before the download click works. (The popunder is the network's own
  click-triggered script; we cannot control which click fires it. What we
  guarantee is that OUR flow never blocks or delays the download itself; the
  per-session frequency cap is configured in the network dashboard.)
- Ads ship dark: with no ad env vars set, the rendered HTML of every page is
  identical to the pre-change build output (marker fully removed, no ad code,
  no empty containers).
- Density is a dial, not a rebuild: banner-only mode is reached by clearing
  one env var.
- /admin and all /api/* responses never contain ad code.

## Configuration

Three new optional env vars, read at `create_app()` time (restart to apply,
matching how analytics config is loaded; NOT at module import, so tests can
monkeypatch env per test):

- `ADS_ENABLED` - master switch. Truthy set `1/true/yes/on`, parsed by a new
  shared `env_truthy(name)` helper extracted from the inline logic in
  `_maintenance_on()` (backend/app/main.py) so the two parsers cannot drift.
  `_maintenance_on()` switches to the shared helper in this change.
- `AD_BANNER_SNIPPET` - raw HTML/script for the banner placement. Optional.
- `AD_POPUNDER_SNIPPET` - raw script tag for the popunder. Optional. Clearing
  it while keeping ADS_ENABLED=1 gives banner-only mode.

If ADS_ENABLED is truthy but both snippets are empty, pages render exactly as
in the off state.

### env_file hazard (must-do)

Docker compose interpolates `$` inside env_file values and truncates unquoted
values at " #". Minified ad snippets often contain `$`. Therefore:
- compose.prod.yaml switches to the explicit form:
  `env_file: [{path: ./deploy/app.env, format: raw}]` (compose v2.30+; the
  VPS installed current docker via get.docker.com, which satisfies this).
- deploy/app.env.example documents: paste each snippet as ONE line; with
  `format: raw` no `$` escaping is needed; do not include " #" sequences.

## Serving architecture

New module `backend/app/pages.py`:

- `render_page(filename: str) -> HTMLResponse` - reads `$STATIC_DIR/<filename>`,
  handles the ad marker, serves with media_type text/html. STATIC_DIR unset or
  file missing -> 404 (matches current dev behavior where Vite serves pages).
- Marker contract: the line `<!--ADS-->` sits on its own line immediately
  before `</body>` in the three public HTML shells.
  - ads on: the marker line is replaced by
    `<div class="ad-slot">{AD_BANNER_SNIPPET}</div>` (only if banner snippet
    non-empty) followed by `{AD_POPUNDER_SNIPPET}` (only if non-empty).
  - ads off (or enabled-but-both-empty): the ENTIRE marker line including its
    newline is removed - rendered output is identical to the file with no
    marker ever added.
  - a file with NO marker is served unchanged (existing minimal test fixtures
    must keep passing; marker-missing is not an error).
- Cache: in-memory, keyed by (absolute path, st_mtime_ns) per app instance
  (built inside create_app, not module-global), storing the RENDERED output
  for the app's fixed ad config. A redeploy (new mtime) refreshes naturally;
  config changes require restart, which rebuilds the app and the cache.
  Tests bump mtime with os.utime, never sleep.
- Accepted trade: switching FileResponse -> HTMLResponse drops
  ETag/Last-Modified 304 revalidation for these three pages. At this scale
  (HTML is ~10-20 KB, no-cache already forces revalidation round-trips) this
  is fine and not worth conditional-request logic.

Routing in `backend/app/main.py`:

- `/tiktokvideodownloader` and `/redditvideodownloader` routes switch to
  `render_page(...)`.
- New explicit `GET /` route -> `render_page("index.html")`. Verified: the
  static mount is registered last in create_app and Starlette matches in
  registration order, so explicit routes win.
- The raw file paths `/index.html`, `/tiktokvideodownloader.html`,
  `/redditvideodownloader.html` would otherwise still be reachable through
  the static mount and would leak the literal marker: add explicit routes for
  all three that serve the same render_page output as their clean URLs.
- `/admin` is served by the EXPLICIT route in
  `backend/app/analytics/router.py` (FileResponse of admin.html) - NOT by an
  html=True fallback of the static mount (Starlette has no path+".html"
  fallback). That route is untouched and never passes through render_page,
  so ads on /admin stay impossible by construction. Do not "simplify" that
  route away. `/admin.html` via the mount also stays ad-free (no marker is
  ever added to admin.html).
- Maintenance middleware short-circuits before all of this, unchanged: during
  maintenance, visitors get maintenance.html with no ad code.

Frontend:

- `frontend/index.html`, `tiktokvideodownloader.html`,
  `redditvideodownloader.html`: add the `<!--ADS-->` marker line before
  `</body>`.
- `frontend/src/styles/index.css`: `.ad-slot` - centered, max-width matching
  the page column, vertical margins ON THE SLOT CONTENT spacing kept modest;
  accepted limitation (recorded): under adblock the network script leaves a
  non-rendering child, so `:empty` tricks do not fire and adblock users may
  see a small blank gap. Keep margins small so the gap is negligible; do not
  attempt adblock detection.
- No ad code in the React bundle; ads are purely server-injected.

## Copy sweep (complete inventory)

Scope: the three public HTML shells (meta descriptions AND `<title>`,
`og:title`, `twitter:title`, JSON-LD FAQ questions AND answers, visible FAQ,
about section, footer), the three React hero taglines, the OG images, the
maintenance page, and repo docs.

Remove everywhere (now false with a private repo and/or ads):
- "open source", "MIT licensed", "read the code", "run your own copy",
  "self-host", both GitHub links.
- "no tracking" claims.
- "no popups", "No Ads", "ad-free" phrasing in ANY location, including:
  - Home `<title>` "... Free, Fast, No Ads" and og:title/twitter:title
    (frontend/index.html lines ~6, 14, 18); check the TikTok/Reddit titles
    for the same pattern.
  - React heroes: "No popups, no fake buttons, ever." in
    frontend/src/App.tsx (~line 185), frontend/src/tiktok/TikTokApp.tsx
    (~185), frontend/src/reddit/RedditApp.tsx (~187).
  - JSON-LD + visible FAQ QUESTION text "Is SaveVid AI really free and
    ad-free?" -> "Is SaveVid AI really free and safe?" (questions and answers
    must agree; FAQPage structured data updated in lockstep with visible FAQ).

Replacement copy (owner voice: lowercase-leaning, direct, no em dashes, no
emoji; exact final strings decided at implementation with these anchors):
- Titles: drop "No Ads"; keep the value claim, e.g. "SaveVid AI - Twitter/X
  Video Downloader. Free, Fast, Instant."
- Meta descriptions: "... No fake download buttons, no forced redirects. Free
  and instant."
- Hero taglines: "no fake buttons, no forced redirects. one real click."
- FAQ safety answer: "No fake download buttons and no forced redirects: your
  download is always one real click. A small ad keeps the site free."
- FAQ privacy answer: "No login and no account. We only keep anonymous,
  aggregate usage counts."
- About: "SaveVid AI is built by @israfill." Footer loses GitHub/Self-host
  links, keeps the X link; credit line drops "MIT licensed".
- Footer descs keep per-page value lines ("every quality" / "no watermark" /
  "audio merged in") minus the dead claims.

OG images:
- og.png currently renders "Free. No popups. No fake buttons. Open source."
  as image text. Regenerate with scripts/make_og.py with updated text (drop
  "No popups" and "Open source"); verify og-reddit.png (og-tiktok.png is
  already clean: "No watermark. Free.").

Maintenance page:
- frontend/public/maintenance.html contains "it's open source, always." and a
  GitHub link (~lines 240-241): rewrite that line in owner voice without the
  open-source claim and remove the link.

Repo docs (owner-facing now):
- README.md: remove the public open-source pitch framing AND the shields.io
  GitHub-stars badge (renders broken on a private repo). Keep operational
  content. deploy/README.md unchanged (still accurate).
- CONTRIBUTING.md: delete (contribution guide for a repo nobody can see).
- LICENSE stays (the MIT grant on published history is irrevocable anyway);
  it just is not advertised.

## What does NOT change

- Download flow, resolve flow, proxy, mux: untouched.
- Analytics: untouched (ad performance lives in Adsterra's dashboard).
- Maintenance mechanics, admin dashboard + its /admin route, API responses.

## Testing

Backend (pytest, new tests/test_pages.py + adjustments):
- ads off (no env): `/`, `/tiktokvideodownloader`, `/redditvideodownloader`,
  AND `/index.html`, `/tiktokvideodownloader.html`,
  `/redditvideodownloader.html` contain neither `<!--ADS-->` nor `ad-slot`,
  and their rendered bodies equal the on-disk file minus the marker line.
- ads on (both snippets): all six paths above contain the banner inside
  `class="ad-slot"` and the popunder snippet; `/admin` and `/admin.html`
  contain neither; `/api/health` unaffected.
- banner-only (popunder empty): banner present, popunder absent.
- ADS_ENABLED truthy + both snippets empty: identical to ads off.
- marker-less file: served unchanged (existing fixture tests keep passing).
- mtime cache: os.utime bump serves fresh content; same mtime serves cached.
- env_truthy: shared helper parses the truthy set; _maintenance_on uses it
  (regression: maintenance truthy behavior unchanged).
- maintenance on + ads on: visitors get maintenance.html, no ad code.
- STATIC_DIR unset: `/` returns 404 (dev parity).
- Existing page-route tests keep passing with the renderer.

Frontend: `npm run build` clean; grep the built dist for "open source",
"no popups", "No Ads", "github.com/OxIsrafil" - all must be absent; update
any test that asserted removed copy.

Deployment note (runbook, not code): merge -> on the VPS `git pull && docker
compose -f compose.prod.yaml up -d --build`. Ads stay off until the owner
adds the three vars to deploy/app.env and restarts. Adsterra domain
verification (meta tag or file) is handled when signing up; a meta tag can go
directly in the HTML shells.

## Revenue expectation (recorded for honesty)

At current LATAM-heavy traffic (~1.5k visits/day surge): roughly $25-55/mo
with banner+popunder; roughly half banner-only; drops if the surge fades.
The lever is traffic, not ad density.
