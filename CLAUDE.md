# SaveVid AI - project context

Social video downloader, ad-free since 2026-09-06 (owner pulled the ads). Live at https://savevidai.israfill.dev
Private repo: https://github.com/OxIsrafil/savevidai (owner: OxIsrafil, X: @israfilv2).

This file is auto-loaded into every chat opened in this repo. Read it first, then check
the owner's global memory and the ledger below before starting work.

## What it does

Paste a social post link, get the video (or photos) to download. Three platforms, each on
its own dedicated SEO page:
- Twitter/X (home `/`) - via the FixTweet public API (fxtwitter primary, vxtwitter fallback).
- TikTok (`/tiktokvideodownloader`) - no-watermark hd/sd via tikwm; photo slideshows too.
- Reddit (`/redditvideodownloader`) - videos WITH audio (ffmpeg-merged), GIFs, images.

## Architecture (the resolve-based model - protect it)

- The server only RESOLVES links to direct media URLs. The browser downloads the bytes.
- The browser downloads straight from the CDN first (`frontend/src/lib/download.ts`: fetch with no
  Referer, because video.twimg.com refuses a third-party one), but only for CDNs verified to allow
  it: video.twimg.com, tiktokcdn*, fbcdn.net, cdninstagram.com. `/api/proxy` re-streams CDN media
  as the fallback and for every other host (redd.it, tikwm.com). SSRF-locked: exact-host or
  dot-suffix allowlist, never substring, no redirect-follow.
- `/api/mux/{vid}/{h}.mp4` (Reddit only) merges v.redd.it's separate video+audio streams with
  `ffmpeg -c copy` into a per-request temp file, streams it, deletes it. NOTHING is stored.
- Platform layer: `backend/app/platforms.py` detect_platform routes to per-platform resolvers
  (extractor.py=twitter, tiktok.py, reddit.py), all returning the same `ResolveResponse` shape.
- Backend: Python 3.12 / FastAPI / httpx (`backend/app`). Frontend: TypeScript / Vite 6 (multi-page)
  / React (`frontend/src`). Design system: Apple-style dark, aurora, Onest font (self-hosted),
  accent #2997ff dark / #0071e3 light, pill nav/buttons.

## Admin dashboard (`/admin`)

Owner-only, cookie-auth (`svid_admin`, 30 days, `Path=/api/admin`). `POST /api/admin/logout`
clears it in this browser only; changing `ADMIN_PASSWORD` signs out everywhere. Enabled by
`ADMIN_PASSWORD` + `ANALYTICS_SALT` plus a storage backend. Storage selection
(`backend/app/analytics/config.py`): `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` both set -> Turso
(legacy, still supported); else `ANALYTICS_DB_PATH` set -> local SQLite file; else disabled. LIVE
on the VPS using a LOCAL SQLite file at `/data/analytics.db` (the `analytics_data` Docker volume,
survives rebuilds). Turso was decommissioned 2026-07-25; `scripts/migrate_analytics.py` did the
one-time copy.

Redesigned 2026-09-23 after the premium store admin (spec
`docs/superpowers/specs/2026-09-23-admin-redesign-design.md`): dark only, system SF font,
sidebar with Analytics and Site, admin-only Tailwind tokens in `frontend/src/admin/admin.css`,
Recharts and lucide-react loaded by the admin entry only.
- Analytics: range tabs Today / 7 / 30 / 90 days (`?range=`), each compared with the period
  before (same length, shifted back; 90 days never has one because data is kept 90 days). Four
  metric tabs, eight tiles, funnel, fetch outcomes, platforms, qualities, countries, pages,
  busiest hours, new vs returning, traffic sources. Refreshes every 30s while the tab is visible.
- API: `GET /api/admin/report?range=&tz=` and `GET /api/admin/resolvers?tz=` (24-hour
  per-platform health), both in `backend/app/analytics/report.py` with an injectable `now`
  (never SQLite `datetime('now')`); maintenance GET/POST unchanged.
- Countries: offline DB-IP Lite lookup (`backend/app/analytics/geo.py`), the IP used in memory
  only. A daemon thread, started only when `GEOIP_UPDATE` is truthy (the Dockerfile sets it),
  refreshes `/data/geoip/dbip-country-lite.mmdb` monthly. Licence CC BY 4.0: the admin footnote
  must keep the "IP Geolocation by DB-IP" link.
- Visit events carry `locale` (en/es/hi) from the shell's `lang`, for the Pages panel.
- Site page: one-click maintenance toggle (in-memory flag; instant, fail-safe, no redeploy;
  `MAINTENANCE_MODE` env var is a hard override) and resolver health for the last 24 hours.
- Analytics stay privacy-first and aggregate-only: daily-rotating HMAC visitor hash (IP
  discarded, never stored), country code, locale, fetch/download/visit counts. NO referrer URLs,
  NO cross-day IDs; any new event field MUST stay aggregate and non-identifying.

## Deployment

- Netcup VPS (Ubuntu 24.04, 4 vCPU / 8GB, IP 159.195.159.26) since 2026-07-24, at `/opt/savevidai`.
  Runs `docker compose -f compose.prod.yaml up -d --build`: the app container + a Caddy reverse
  proxy that fetches Let's Encrypt certs automatically (tls-alpn-01). ffmpeg is in the image.
- Deploy is MANUAL, no auto-deploy anywhere: `ssh root@159.195.159.26`, `cd /opt/savevidai`,
  `git pull && docker compose -f compose.prod.yaml up -d --build`. A GitHub read-only DEPLOY KEY
  on the VPS lets it pull the private repo over SSH (git remote is the `git@github.com:` SSH URL).
  `up --build` only recreates the app container: a pull that changes the Caddyfile also needs
  `docker compose -f compose.prod.yaml restart caddy`.
- GitHub Actions CI still runs on every push (tests + ruff + build) but does NOT deploy. Render
  was decommissioned (its free tier bandwidth-SUSPENDED the site under a KOL traffic surge -
  SaveVid proxies download bytes, so egress scales with usage; the VPS bundles ~unlimited traffic).
- Cloudflare: `savevidai.israfill.dev` is an A record -> the VPS IP, DNS-only (grey cloud) so Caddy
  can issue its cert and video streams direct off the box. Do NOT orange-cloud it (video volume).
  So CF-* headers can only come from the client: Caddy strips them (`request_header -CF-*`) and
  `backend/app/client_ip.py` ignores CF-Connecting-IP / CF-IPCountry unless
  `TRUST_CLOUDFLARE_HEADERS=1` (keep it unset). The client IP is the first X-Forwarded-For hop,
  safe only because Caddy has no trusted_proxies and overwrites XFF with the real peer.
- Env/secrets live in `deploy/app.env` on the VPS (gitignored). See `deploy/app.env.example` +
  `deploy/README.md` for the full var list and runbook.
- Reddit galleries + share links need optional REDDIT_CLIENT_ID/SECRET (a reddit "script" app);
  not set, so the anonymous vxreddit+manifest path is what runs (videos/GIFs/images work without it).

## Monetization / ads

- None. Adsterra units (banner + popunder + social bar) ran on every public page from
  2026-08-01 to 2026-09-06, earning a few cents a day at launch against ~12 EUR/mo of VPS
  cost, and the owner pulled them. The env-gated injection layer (`backend/app/pages.py`, the
  `<!--ADS-->` marker in every shell, the `ADS_ENABLED` / `AD_*_SNIPPET` vars, the dormant
  `AdSlot` component) was removed in the same change on branch `chore/remove-ads`. History:
  `docs/superpowers/specs/2026-07-24-ads-monetization-design.md` and `git log`. If ads ever
  come back, `git revert` those two commits rather than rebuilding.
- The site is NO LONGER open source: the repo went private 2026-07-24 and the public copy was
  swept of every "open source / MIT / GitHub / no tracking" claim. Do NOT reintroduce those.
  Ad copy is neutral on purpose (no "ad-supported", and no "no ads" or "no popups" claims);
  adding an ad-free claim to the public copy is an owner decision, not a default.

## How to build features here

- Follow the superpowers workflow: brainstorm -> spec -> plan -> subagent-driven-development
  (fresh implementer subagent per task + adversarial review after each + whole-branch review).
- Specs live in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`, the running
  build ledger in `.superpowers/sdd/progress.md` (read it to see what's been done and why).
- Model split (owner rule, updated 2026-09-23): use the model the owner selected for the
  session (Opus 5.5 now) for implementers, fixers and heavy reviews, Sonnet for per-task
  reviews, Haiku for small mechanical checks. Never dispatch Fable unless the owner selects
  it. See global memory `model-preferences`.
- TDD always. Real live verification (browser + prod curl), never "should work".

## Conventions (hard rules)

- NO em dashes, NO emoji - anywhere (code, comments, UI copy, commits, docs). Use hyphen/comma/colon.
- Conventional commit prefixes. End commit messages with the Co-Authored-By trailer.
- Backend commands from `backend/` with venv active (`source .venv/bin/activate`); frontend from
  `frontend/`. Test warning baseline is 7 (pre-existing httpx/slowapi deprecations); anything new
  is a finding.
- Work on a feature branch, never commit to `main` directly; merge is fast-forward after review.
- Owner voice for any user-facing copy: lowercase, human, direct, no corporate filler (see the
  maintenance page `frontend/public/maintenance.html` as the reference tone).

## Roadmap / ideas (not yet built)

- Reddit galleries/shares (needs the REDDIT_CLIENT_ID/SECRET OAuth env vars).
- YouTube is a separate future site (needs residential proxies, ~$150-300/mo at scale).
