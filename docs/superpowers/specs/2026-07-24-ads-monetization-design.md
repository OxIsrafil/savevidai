# Ads monetization + closed-source copy sweep - design

Date: 2026-07-24
Status: approved (brainstorm)
Branch: feature/ads-monetization

## Problem

The site needs to earn its costs (~$14/mo VPS + domain). Owner decision: monetize
with a downloader-friendly ad network (Monetag / Adsterra / PropellerAds class)
using one banner plus one popunder per visit, kept as light as possible. The
GitHub repo was also flipped PRIVATE on 2026-07-24, so every "open source /
MIT / read the code / self-host" claim on the site is now false and every
GitHub link 404s for visitors.

Two goals in one change:
1. A server-side ad slot system that is OFF by default, network-agnostic, and
   never delays or gates a download.
2. A copy sweep so the site only promises things that remain true.

## Owner constraints (pinned)

- Downloads stay instant: our code never adds interstitials, waits, or gates
  before the download click works. (The popunder is the network's own
  click-triggered script; we cannot control which click fires it. What we
  guarantee is that OUR flow never blocks or delays the download itself, and
  the per-session frequency cap is configured in the network dashboard.)
- Ads ship dark: with no env vars set, the site is byte-for-byte equivalent
  in behavior to today (same pages, no ad code anywhere).
- Density is a dial, not a rebuild: banner-only mode must be reachable by
  clearing one env var.
- /admin and all /api/* responses never contain ad code.

## Configuration (deploy/app.env)

Three new optional env vars, read at app startup (restart to apply, same as
the rest of app.env; documented in deploy/app.env.example):

- `ADS_ENABLED` - master switch. Truthy set: `1/true/yes/on` (same parsing as
  MAINTENANCE_MODE). Unset/other = ads fully off.
- `AD_BANNER_SNIPPET` - raw HTML/script tag from the network for the banner
  placement. Optional.
- `AD_POPUNDER_SNIPPET` - raw script tag for the popunder. Optional. Clearing
  this while keeping ADS_ENABLED=1 gives banner-only mode.

If `ADS_ENABLED` is truthy but both snippets are empty, pages render as if ads
were off (marker stripped, no empty ad container).

Env vars hold multi-line-ish script tags fine as single lines; the example
file documents that the snippet must be pasted as one line.

## Serving architecture

New module `backend/app/pages.py`:

- `render_page(filename: str) -> HTMLResponse` - reads `$STATIC_DIR/<filename>`,
  replaces the `<!--ADS-->` marker, and serves it.
- Marker replacement:
  - ads on: marker -> `<div class="ad-slot">{AD_BANNER_SNIPPET}</div>` (only
    if banner snippet non-empty) + `{AD_POPUNDER_SNIPPET}` (only if non-empty).
  - ads off: marker -> empty string (visitors never see the comment).
- In-memory cache keyed by (filename, file mtime) so steady-state serving does
  no disk read; a redeploy (new file mtime) refreshes naturally. Ad config is
  read once at import/startup - flipping vars requires a container restart,
  which is the existing operational model on the VPS.
- Response uses the same `Cache-Control: no-cache` HTML behavior as today
  (the existing middleware already applies it to text/html).

Routing changes in `backend/app/main.py`:

- The existing `/tiktokvideodownloader` and `/redditvideodownloader` routes
  switch from FileResponse to `render_page(...)`.
- New explicit `GET /` route serving `render_page("index.html")` ahead of the
  static mount (route resolution order: explicit routes win over the mount).
- `/admin` intentionally keeps resolving through the static mount and never
  passes through render_page - ads on the admin panel are impossible by
  construction, not by conditional.
- Maintenance mode short-circuits in middleware before any of this, unchanged.

Frontend changes:

- `frontend/index.html`, `tiktokvideodownloader.html`,
  `redditvideodownloader.html`: add `<!--ADS-->` on its own line immediately
  before `</body>`.
- `frontend/src/styles/index.css`: a minimal `.ad-slot` style - centered,
  max-width matching the page column, top/bottom margin, and it collapses to
  nothing when empty (`:empty { display: none }`). No layout shift for the
  content above it (it sits below the footer content flow).
- No ad code in the React bundle at all; ads are purely server-injected.

## Copy sweep (all three public pages, meta + JSON-LD + FAQ + footer)

Remove everywhere (now false):
- "open source", "MIT licensed", "read the code", "run your own copy",
  "self-host", both GitHub links (repo is private; links 404).
- "no tracking" claims (ad networks track; keeping this line would be a lie).
- "no popups ... ever" phrasing.

Replace with claims that stay true with ads on:
- Meta descriptions: "... No fake download buttons, no forced redirects. Free
  and instant." (drop "open source", drop "no popups")
- FAQ safety answer: "No fake download buttons and no forced redirects: your
  download is always one real click. A small ad keeps the site free."
- FAQ privacy answer: "No login and no account. We only keep anonymous,
  aggregate usage counts." (true: analytics is aggregate; ad network scripts
  are disclosed via the ad line above)
- About/footer: "SaveVid AI is built by @israfill." Footer links lose
  GitHub/Self-host; keep the X link. Credit line drops "MIT licensed".
- Footer desc: "Twitter/X video downloader. No fake buttons, one paste, every
  quality." (per-page variants for TikTok/Reddit keep their specific value
  line: "no watermark" / "audio merged in")

Owner voice rules apply: lowercase-leaning, direct, no em dashes, no emoji.

Also update README.md: remove the open-source pitch/self-host sections'
public-facing framing (repo is private now; README is for the owner). Keep
operational docs (deploy/README.md) unchanged - still accurate.

## What does NOT change

- Download flow, resolve flow, proxy, mux: untouched.
- Analytics: untouched (no new events; ad performance lives in the network's
  own dashboard).
- Maintenance mode, admin dashboard, API responses: untouched.
- LICENSE file stays in the repo (MIT grant on the published history is
  irrevocable anyway); it just is not advertised on the site.

## Testing

Backend (pytest, new `tests/test_pages.py` + adjustments):
- ads off (no env): `/`, `/tiktokvideodownloader`, `/redditvideodownloader`
  contain neither `<!--ADS-->` nor `ad-slot`.
- ads on (both snippets): all three pages contain the banner inside
  `class="ad-slot"` and the popunder snippet; `/admin` (and `/admin.html`)
  contain neither; `/api/health` unaffected.
- banner-only mode (popunder var empty): banner present, popunder absent.
- ADS_ENABLED truthy but both snippets empty: pages contain no ad-slot and no
  marker.
- marker stripped in the off state (no `<!--ADS-->` leaks to visitors).
- mtime cache: editing the file on disk (new mtime) serves fresh content.
- Env parsing tests mirror the MAINTENANCE_MODE truthy set.
- Existing page-route tests (test_tiktok_page.py etc.) keep passing with the
  new renderer.

Frontend: `npm run build` clean; no test depends on the removed copy strings
(verify and update any that do).

Deployment note (runbook, not code): after merge, on the VPS -
`git pull && docker compose -f compose.prod.yaml up -d --build`. Ads stay off
until the owner adds the vars to deploy/app.env and restarts.

## Revenue expectation (recorded for honesty)

At current LATAM-heavy traffic (~1.5k visits/day surge): roughly $25-55/mo
with banner+popunder; roughly half that banner-only; drops if the surge
fades. Covers costs; not "good money" without traffic growth or more Tier-1
geo. The lever is traffic, not ad density.
