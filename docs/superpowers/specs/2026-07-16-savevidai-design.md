# SaveVid AI - Design Spec

Date: 2026-07-16
Status: Approved pending user review

## What

SaveVid AI (savevidai.app) is a public, open source Twitter/X video downloader. Paste a tweet URL, see a preview, pick a quality, download. No popups, no redirects, no fake download buttons, nothing between the user and the download.

## Goals

- Best-in-class UX for downloading Twitter/X videos and GIFs from a post URL.
- Near-zero running cost: server resolves links only, video bytes flow from Twitter's CDN to the user's browser.
- Open source (MIT), trivially self-hostable with one Docker command.
- Premium visual design: polished typography, purposeful animation, dark-first.
- Monetizable later with a single passive ad slot that never gates the download.

## Non-goals (v1)

- Instagram, TikTok, or any other platform (architecture stays platform-neutral for later).
- Accounts, history, or any server-side persistence.
- Private, age-restricted, or login-required tweets. Unsupported, stated honestly in the error message.
- Server-side conversion (real .gif export, trimming, format transcodes).
- Ad-gated or incentivized-click downloads. Never.

## Architecture

One repo, one Docker container. FastAPI serves the API and the built React frontend as static files. Identical artifact deploys to Render free tier (testing/staging) and a $5 VPS (production).

```
savevidai/
  frontend/     Vite + React + TypeScript + Tailwind
  backend/      FastAPI + yt-dlp (Python 3.12)
  Dockerfile    multi-stage: build frontend, copy dist into backend image
  render.yaml   one-click Render deploy
  compose.yaml  VPS deploy (app + Caddy for HTTPS)
```

Extraction uses yt-dlp as a Python library in metadata-only mode (`skip_download`). It resolves a tweet URL to its mp4 variant URLs on video.twimg.com. The server never downloads video content in the normal path. When Twitter changes internals, the fix is a yt-dlp version bump.

## API

### POST /api/resolve

Request: `{ "url": "<tweet url>" }`

Accepts twitter.com, x.com, and mobile subdomains, plus the Discord-style mirror domains people actually paste (fxtwitter.com, vxtwitter.com, fixupx.com, twittpr.com), all normalized to the canonical tweet ID. Response:

```json
{
  "id": "1234567890",
  "author": "Display Name",
  "handle": "username",
  "avatar_url": "...",
  "text": "tweet text",
  "items": [
    {
      "index": 1,
      "kind": "video",        // "video" | "gif"
      "thumbnail": "...",
      "duration_seconds": 42.5,
      "variants": [
        { "label": "1080p", "width": 1920, "height": 1080, "url": "https://video.twimg.com/...", "size_bytes": 35651584 }
      ]
    }
  ]
}
```

- `items` is an array because a single tweet can contain up to 4 videos/GIFs; the UI renders one section per item. Single-video tweets (the overwhelming majority) show exactly as before.
- Variants sorted best-first. `size_bytes` fetched via HEAD request server-side, null if unavailable.
- In-memory LRU cache, ~1 hour TTL, keyed by tweet ID. Popular tweets do not re-hit Twitter.
- Per-IP rate limit (10/min, slowapi) to protect the server's IP reputation with Twitter.
- Errors are structured: `{ "error": "not_found" | "no_video" | "private_or_restricted" | "invalid_url" | "rate_limited" | "upstream_error", "message": "human text" }` with appropriate HTTP status.

### GET /api/proxy?url=...

Streaming fallback for the rare case browser-side CORS download fails. Hard-restricted to `https://video.twimg.com/` URLs (reject anything else with 403) so the server cannot be used as an open proxy. Same per-IP rate limit, plus a global concurrent-stream cap (e.g. 8) so fallback traffic can never saturate the small VPS. Sets `Content-Disposition` with the clean filename.

## Download mechanics

Browsers ignore the `download` attribute cross-origin, so a plain CDN link would play the video in a tab instead of saving. Primary path: frontend fetches the mp4 from video.twimg.com as a blob (their CDN sends permissive CORS), shows real progress from the response stream, saves via object URL with filename `{handle}_{tweetid}_{label}.mp4` (multi-video tweets append `_1`, `_2`, ...). If the response has no Content-Length, the progress bar switches to an indeterminate sweep instead of freezing at 0%. Fallback path: if the blob fetch fails (CORS regression, odd browser), the download button retries via `/api/proxy` transparently.

## Frontend UX

Single page, whole flow on one screen, zero navigation.

1. Hero: brand, one-line promise ("Twitter videos. One paste. No garbage."), large paste input.
2. Paste: auto-reads clipboard on input focus (permission-gated), Ctrl/Cmd+V anywhere on the page triggers resolve, URL in `?url=` query param resolves on load (enables browser bookmarklets/share targets later).
3. Resolving: skeleton preview card, subtle shimmer. Typical wait 1-2 s.
4. Preview card: thumbnail with duration badge, author avatar + name + handle, tweet text (clamped), GIF badge when `kind == "gif"`. Multi-video tweets show one media section per item inside the same card, labeled "Video 1", "Video 2".
5. Quality row: one button per variant, label + size ("1080p · 34 MB"), best quality visually primary. Click starts blob download with an animated progress bar in the button itself; completed state confirms saved filename.
6. Errors: inline under the input, specific and honest per error code, never a bare "something went wrong" when we know more.
7. Footer: GitHub link, "Support this project" (Ko-fi/GitHub Sponsors), privacy line ("No ads, no tracking, no cookies. Open source.").

### Design language

- Typography: Geist Sans (UI) + Geist Mono (resolutions, sizes, progress numbers). Both open-license, self-hosted, no third-party font CDN.
- Dark-first with light mode toggle, one restrained accent color, generous whitespace.
- Accessibility: fully keyboard-driven flow (paste, Enter, arrow between qualities, Enter to download), visible focus states styled as first-class hover-tier effects, ARIA live region announcing resolve/download/error state changes, WCAG AA contrast in both themes.
- No client-side analytics, no cookies, no fingerprinting, and the page says so. Traffic volume (for the future ad decision) comes from server access logs via goaccess on the VPS, which keeps the promise literally true.

### Motion design

Motion is a brand signature, not decoration. Every animation communicates state or affordance.

- System: a single easing/duration token set. Micro-interactions 150-200 ms ease-out; state transitions 250-400 ms spring (gentle, no bounce overshoot beyond ~1%). Implementation: CSS transitions for hover/press, Motion for React (AnimatePresence) for mount/unmount and layout transitions.
- Page load: hero elements stagger in (fade + 8 px rise, 60 ms stagger), paste input scales from 0.98 with its focus glow blooming once. Under 600 ms total, runs once.
- Paste input: idle state has a slow ambient border shimmer; on focus, accent glow ring expands; on paste, a quick highlight sweep across the text; invalid URL triggers a 3-shake horizontal wobble + error color pulse.
- Resolving: input's button morphs into a spinner in place, skeleton card slides up with shimmer that matches final card geometry exactly (no layout jump on swap).
- Card reveal: skeleton cross-fades into the real card, children cascade (thumbnail, then author row, then text, then quality buttons, 50 ms apart), thumbnail does a blur-up from the tiny preview.
- Hover effects (the premium layer): quality buttons lift 2 px with deepened shadow + accent border glow; thumbnail zooms 1.03 with the play badge pulsing subtly; footer links get animated underline sweeps; theme toggle icon rotates and cross-fades between sun/moon. All interactive elements also have a press state (scale 0.97) so clicks feel physical.
- Download: the button itself becomes the progress bar, filling left to right with the percentage ticking in Geist Mono; indeterminate mode is a sweeping gradient band. On completion the fill snaps to full and an SVG checkmark draws itself in (300 ms stroke animation), then the filename fades in below.
- Errors: message slides down with a soft red glow that decays over 1 s, never a harsh flash.
- Constraints: transforms and opacity only (60 fps on mid-range phones), no layout-triggering properties, nothing loops forever except the idle input shimmer, `prefers-reduced-motion` swaps all movement for instant opacity changes while keeping progress feedback visible.

## Monetization (future, designed now)

- Brand promise: "no popups, no redirects, no fake buttons - ever" (not "ad-free forever").
- One `<AdSlot>` component in the layout, feature-flagged via env var, off by default. Self-host builds stay clean.
- When traffic justifies (~1k+ daily visitors): EthicalAds/Carbon-style single text ad or one flat-rate direct sponsor. Never AdSense (downloader sites get banned), never popunder/incentivized networks, never anything that gates or delays a download.
- Donations from day one via footer link.

## Error handling

| Case | Detection | User message |
|---|---|---|
| Not a tweet URL | URL parse | "That doesn't look like a Twitter/X post link." |
| Tweet deleted/404 | yt-dlp error class | "This post doesn't exist or was deleted." |
| No video in tweet | yt-dlp result | "This post has no video. If the video is in a quoted post, paste that post's link." |
| Private/restricted | yt-dlp error class | "This post is private or age-restricted. SaveVid AI only works with public posts." |
| Twitter rate-limits us | yt-dlp error class | "Twitter is rate-limiting right now. Try again in a minute." |
| Unknown yt-dlp failure | catch-all | "Extraction failed. If this keeps happening, report it on GitHub." + server-side log |

All upstream failures logged with tweet ID and yt-dlp error so breakage from Twitter-side changes is visible immediately.

## SEO and landing content

Traffic is the whole growth plan, so the page is built to rank, not just to work.

- Title/H1 target the real query: "Twitter Video Downloader - Free, Fast, No Ads | SaveVid AI". Meta description sells the differentiator (no popups, no fake buttons, open source).
- Static content below the tool (server-rendered in the HTML, not JS-injected): 3-step how-to, honest FAQ (quality limits, private posts, is it legal, is it really ad-free), and an open source trust section linking the repo.
- FAQPage structured data (schema.org JSON-LD) for rich results; OpenGraph + Twitter Card tags with a branded OG image so shared links look premium.
- Performance as ranking signal: static shell, self-hosted fonts with `font-display: swap`, zero third-party requests, LCP well under 1 s. Lighthouse 95+ across the board is a release gate.
- sitemap.xml + robots.txt; canonical URL on the one page.

## Open source setup

- MIT license, README with screenshots, self-host one-liner (`docker run -p 8000:8000 ghcr.io/<owner>/savevidai`, image published from the repo's CI), Deploy-to-Render button.
- GitHub Actions: lint (ruff, eslint), backend tests, frontend build, Docker image publish to GHCR on tag.
- CONTRIBUTING note: extraction breakages usually mean "bump yt-dlp," documented so contributors can self-serve.

## Testing

- Backend unit tests (yt-dlp mocked): URL parsing/normalization for all tweet URL shapes including mirror domains, multi-video item mapping, variant sorting and labeling, cache behavior, rate limiting, proxy domain lock (must reject non-twimg URLs), error mapping.
- Frontend: component tests for the state machine (idle → resolving → card → downloading → done → error).
- One live smoke test against a known stable tweet, manual or scheduled, excluded from CI (depends on Twitter uptime).

## Deployment

- Staging: Render free tier via render.yaml. Known cold-start (~30-60 s after idle); acceptable for testing only.
- Production: $5 VPS (Hetzner CX22 or similar), compose.yaml runs app container + Caddy with automatic HTTPS. Watchtower optional for auto-updating yt-dlp patch releases.
- Domain: savevidai.app; site functions on a free subdomain until DNS is pointed.

## Risks

- Twitter breaks extraction: highest-likelihood risk. Mitigation: yt-dlp dependency, version bump releases, CI badge showing live smoke test status.
- Server IP gets rate-limited by Twitter at scale: mitigation is the cache + per-IP limits; if it ever happens anyway, escape hatch is rotating the VPS IP or adding a second cheap VPS.
- CDN CORS behavior changes: proxy fallback already designed in.
- Trademark: name avoids "Twitter"/"Tweet"/"X" marks; site copy says "for Twitter/X" descriptively, which is standard nominative use.
