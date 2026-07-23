# SaveVid AI

<p align="center">
  <a href="https://x.com/israfill"><img src="https://img.shields.io/badge/follow%20%40israfill%20on%20x-000000?style=for-the-badge&logo=x&logoColor=white" alt="Follow @israfill on X" /></a>
  <a href="https://github.com/OxIsrafil/savevidai/stargazers"><img src="https://img.shields.io/github/stars/OxIsrafil/savevidai?style=for-the-badge&logo=github&color=blue" alt="GitHub stars" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="License: MIT" /></a>
</p>

![SaveVid AI - paste a tweet URL, pick a quality, download the video](docs/screenshot.png)

Twitter/X video downloader with none of the garbage. Paste a post link, see a preview,
pick a quality, download. No popups, no redirects, no fake download buttons, no tracking.

**Live site:** https://savevidai.israfill.dev

## Why another downloader

Every existing Twitter video downloader is buried in popunders and fake buttons.
SaveVid AI is the opposite: open source, one passive ad slot at most (off by default),
and the download is never gated or delayed. Tweet metadata is resolved via the FixTweet
API; the video itself is streamed through a locked-down proxy (Twitter's CDN refuses
cross-origin browser reads), which is what makes the in-page progress bar and clean
filenames possible.

## Features

- All available qualities with file sizes, best-first
- Preview card (author, text, thumbnail, duration) before you download
- Multi-video tweets and GIFs supported
- Clean filenames: `handle_tweetid_1080p.mp4`
- Keyboard-first: paste anywhere on the page and it just fetches
- Dark and light themes, fast, accessible, no cookies

## Self-host

```bash
docker run -p 8000:8000 ghcr.io/oxisrafil/savevidai:latest
```

Open http://localhost:8000. That's the whole setup.

Or deploy your own: use `render.yaml` (free tier) or `compose.yaml` + `Caddyfile`
on any VPS (edit the domain in the Caddyfile).

### Maintenance mode

To take the site down cleanly for an update, set `MAINTENANCE_MODE=1` in the Render
env. That triggers a redeploy and the whole site starts serving a branded animated
maintenance page (503 with a `Retry-After` header); API calls return a 503 JSON
`{"error": "maintenance"}`. Push your update as normal, which redeploys again with
maintenance still shown. When you are ready to go live, remove `MAINTENANCE_MODE`
(or set it to `0`), which redeploys once more and the site is back. The flag is read
per request, so every redeploy picks up the current value. `/api/health` stays 200
throughout, so Render does not mark the deploy failed or roll it back.

## Development

```bash
# backend
cd backend && python3.12 -m venv .venv && source .venv/bin/activate
pip install -e '.[dev]' && pytest -q
uvicorn app.main:app --reload --port 8000

# frontend (second terminal)
cd frontend && npm install
npm run dev   # proxies /api to :8000
npm test -- --run
```

Live smoke test: `BASE_URL=http://localhost:8000 TWEET_URL=<public tweet with video> python scripts/smoke.py`

## When extraction breaks

SaveVid AI resolves videos through the FixTweet public API (`api.fxtwitter.com`),
with `api.vxtwitter.com` as a fallback, because Twitter closed anonymous video
access to yt-dlp. If resolving stops working, first check whether FixTweet itself
is up, then check whether their JSON shape changed (`backend/app/extractor.py`
maps it). Run the smoke test to confirm. See CONTRIBUTING for details.

## Traffic stats without tracking

There is no client-side analytics. On the VPS, Caddy writes a JSON access log;
run `goaccess /data/access.log --log-format=CADDY` for visitor counts.

## Analytics (optional, privacy-first)

The hosted site records aggregate usage so the maintainer can see growth and spot extraction breakage. What is stored: per-event timestamp, type (visit/fetch/download), outcome (quality label or error code), a 2-letter country (from Cloudflare, when proxied), and a daily-rotating HMAC hash used to estimate unique visitors. What is not stored: IP addresses, any identifier that survives a day, cookies for visitors, or anything that identifies a person. Two coarse buckets aid triage without weakening this: `source` (a browser-categorized traffic bucket such as search or direct, derived on the client with no referrer URL kept) and `visitor_kind` (new vs returning, a localStorage-based estimate consistent with the no-tracking stance, with no cross-day ID stored). Events are pruned after 90 days.

Analytics is off by default. It activates only when all of `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `ADMIN_PASSWORD`, and `ANALYTICS_SALT` are set, so self-hosted instances collect nothing unless you deliberately configure them. The admin dashboard lives at `/admin` behind a password.

### Enabling it (hosted)

1. Create a free Turso DB: `turso db create savevidai --region aws-us-west-2`, then grab the URL and a token:
   ```bash
   turso db show savevidai --url
   turso db tokens create savevidai
   ```
2. Set the four env vars in your hosting platform (Render, etc.):
   - `TURSO_DATABASE_URL`: your Turso connection string
   - `TURSO_AUTH_TOKEN`: your Turso auth token
   - `ADMIN_PASSWORD`: a long random value (it doubles as session-signing key material; use at least 32 random characters)
   - `ANALYTICS_SALT`: another long random value (used to salt the visitor hash; use at least 32 random characters)
3. Optional: proxy your domain through Cloudflare (orange cloud) to enable country data collection via the `CF-IPCountry` header.

## License

MIT

---

<p align="center">
  <b>SaveVid AI<span>.</span></b><br/>
  built by <a href="https://x.com/israfill"><b>@israfill</b></a> ·
  <a href="https://github.com/OxIsrafil">GitHub</a> ·
  <a href="https://savevidai.israfill.dev">savevidai.israfill.dev</a><br/>
  <sub>If this saved you from a popup hell site, drop it a star</sub>
</p>
