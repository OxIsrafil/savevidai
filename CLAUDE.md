# SaveVid AI - project context

Social video downloader, ad-free since 2026-09-06 (owner pulled the ads). Live at https://savevidai.israfill.dev
Private repo: https://github.com/OxIsrafil/savevidai (owner: OxIsrafil, X: @israfill).

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
- `/api/proxy` re-streams CDN media when the browser can't fetch cross-origin (twimg, tiktokcdn,
  redd.it). SSRF-locked: exact-host or dot-suffix allowlist, never substring, no redirect-follow.
- `/api/mux/{vid}/{h}.mp4` (Reddit only) merges v.redd.it's separate video+audio streams with
  `ffmpeg -c copy` into a per-request temp file, streams it, deletes it. NOTHING is stored.
- Platform layer: `backend/app/platforms.py` detect_platform routes to per-platform resolvers
  (extractor.py=twitter, tiktok.py, reddit.py), all returning the same `ResolveResponse` shape.
- Backend: Python 3.12 / FastAPI / httpx (`backend/app`). Frontend: TypeScript / Vite 6 (multi-page)
  / React (`frontend/src`). Design system: Apple-style dark, aurora, Onest font (self-hosted),
  accent #2997ff dark / #0071e3 light, pill nav/buttons.

## Admin dashboard (`/admin`)

Owner-only, cookie-auth. Enabled by `ADMIN_PASSWORD` + `ANALYTICS_SALT` plus a storage backend.
Storage selection (`backend/app/analytics/config.py`): `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`
both set -> Turso (legacy, still supported); else `ANALYTICS_DB_PATH` set -> local SQLite file;
else disabled. LIVE on the VPS using a LOCAL SQLite file at `/data/analytics.db` (the
`analytics_data` Docker volume, survives rebuilds). Turso was decommissioned 2026-07-25 after a
rows-read quota scare; `scripts/migrate_analytics.py` did the one-time copy. Contains:
- One-click maintenance toggle (in-memory flag; instant, fail-safe, no redeploy). Also togglable
  via `MAINTENANCE_MODE` env var as a hard override.
- Analytics: privacy-first, aggregate-only. Daily-rotating HMAC visitor hash (IP discarded, never
  stored), country, fetch/download/visit counts, top platforms/countries/qualities, error rates,
  avg active users/day (7d+30d), traffic sources, new vs returning. NO referrer URLs, NO cross-day
  IDs - any new event field MUST stay aggregate and non-identifying.

## Deployment

- Netcup VPS (Ubuntu 24.04, 4 vCPU / 8GB, IP 159.195.159.26) since 2026-07-24, at `/opt/savevidai`.
  Runs `docker compose -f compose.prod.yaml up -d --build`: the app container + a Caddy reverse
  proxy that fetches Let's Encrypt certs automatically (tls-alpn-01). ffmpeg is in the image.
- Deploy is MANUAL, no auto-deploy anywhere: `ssh root@159.195.159.26`, `cd /opt/savevidai`,
  `git pull && docker compose -f compose.prod.yaml up -d --build`. A GitHub read-only DEPLOY KEY
  on the VPS lets it pull the private repo over SSH (git remote is the `git@github.com:` SSH URL).
- GitHub Actions CI still runs on every push (tests + ruff + build) but does NOT deploy. Render
  was decommissioned (its free tier bandwidth-SUSPENDED the site under a KOL traffic surge -
  SaveVid proxies download bytes, so egress scales with usage; the VPS bundles ~unlimited traffic).
- Cloudflare: `savevidai.israfill.dev` is an A record -> the VPS IP, DNS-only (grey cloud) so Caddy
  can issue its cert and video streams direct off the box. Do NOT orange-cloud it (video volume).
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
  adding an ad-free claim to the site is an owner decision, not a default.

## How to build features here

- Follow the superpowers workflow: brainstorm -> spec -> plan -> subagent-driven-development
  (fresh implementer subagent per task + adversarial review after each + whole-branch review).
- Specs live in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`, the running
  build ledger in `.superpowers/sdd/progress.md` (read it to see what's been done and why).
- Model split (owner rule): Fable 5 for planning/spec/brainstorming, Opus for building
  (implementer + fix subagents). See global memory `model-preferences`.
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
