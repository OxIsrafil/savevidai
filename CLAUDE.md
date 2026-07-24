# SaveVid AI - project context

Ad-supported social video downloader. Live at https://savevidai.israfill.dev
Private repo: https://github.com/OxIsrafil/savevidai (owner: OxIsrafil, X: @israfill).

This file is auto-loaded into every chat opened in this repo. Read it first, then check
the owner's global memory and the ledger below before starting work.

## What it does

Paste a social post link, get the video (or photos) to download. Three platforms, each on
its own dedicated SEO page:
- Twitter/X (home `/`) - via the FixTweet public API (fxtwitter primary, vxtwitter fallback).
- TikTok (`/tiktokvideodownloader`) - no-watermark hd/sd via tikwm; photo slideshows too.
- Reddit (`/redditvideodownloader`) - videos WITH audio (ffmpeg-merged), GIFs, images.

## Architecture (the zero-cost model - protect it)

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

Owner-only, cookie-auth. Enabled by 4 Render env vars (TURSO_DATABASE_URL, TURSO_AUTH_TOKEN,
ADMIN_PASSWORD, ANALYTICS_SALT) - all set, analytics is LIVE. Contains:
- One-click maintenance toggle (in-memory flag; instant, fail-safe, no redeploy). Also togglable
  via `MAINTENANCE_MODE` env var as a hard override.
- Analytics: privacy-first, aggregate-only. Daily-rotating HMAC visitor hash (IP discarded, never
  stored), country, fetch/download/visit counts, top platforms/countries/qualities, error rates,
  avg active users/day (7d+30d), traffic sources, new vs returning. NO referrer URLs, NO cross-day
  IDs - any new event field MUST stay aggregate and non-identifying.

## Deployment

- Render (Docker Blueprint from this repo). Push to `main` = auto-deploy = full image rebuild
  (ffmpeg is installed in the image). CI must be green first.
- Cloudflare fronts savevidai.israfill.dev but is DNS-only (grey cloud) for the Render cert, so
  no edge caching - immutable asset Cache-Control helps browser caching only.
- Reddit galleries + share links need optional REDDIT_CLIENT_ID/SECRET (a reddit "script" app);
  not set, so the anonymous vxreddit+manifest path is what runs (videos/GIFs/images work without it).

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

- Reddit galleries/shares (needs the OAuth env vars).
- A $5 VPS move if a second always-on (not burst) service lands; ffmpeg mux is burst, so Render
  free still fits for now. YouTube is a separate future site (needs residential proxies, breaks
  zero-cost).
