# Instagram Downloader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Instagram (reels, single videos, single photos) as the fourth platform on `/instagramvideodownloader`, resolved via the kkinstagram redirect service, metadata-light, zero VPS disk and near-zero VPS bandwidth.

**Architecture:** The server resolves an Instagram shortcode to a direct `scontent.cdninstagram.com` URL by reading the `Location` header of kkinstagram's 302 (no HTML, no JSON). The browser downloads straight from the CDN (`access-control-allow-origin: *`, verified live 2026-07-29); `/api/proxy` is CORS fallback only. One `MediaItem`, one variant; carousels resolve to first item only.

**Tech Stack:** FastAPI + httpx (backend), Vite 6 multi-page + React (frontend). Spec: `docs/superpowers/specs/2026-07-29-instagram-platform-design.md` - read it before starting any task.

## Global Constraints

- NO em dashes, NO emoji anywhere (code, comments, copy, commits, docs). Hyphen/comma/colon only.
- Conventional commits; every commit ends with the trailer line: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- Backend commands from `backend/` with venv active (`source .venv/bin/activate`); frontend from `frontend/`.
- Test warning baseline is 7 (pre-existing httpx/slowapi deprecations); any NEW warning is a finding.
- TDD: failing test first, always. Branch: `feature/instagram-downloader` (exists).
- User-facing copy in owner voice: lowercase-leaning, human, direct, honest (carousels = first item only). Never claim "no ads", "open source", "no tracking".
- kkinstagram is the single resolver dependency, no fallback in v1 (documented in module docstring).

---

### Task 1: URL parser + platform detection

**Files:**
- Modify: `backend/app/urls.py` (append after reddit section)
- Modify: `backend/app/platforms.py`
- Test: `backend/tests/test_instagram_urls.py` (new), `backend/tests/test_platforms.py` (extend)

**Interfaces:**
- Consumes: `InvalidTweetURL` from urls.py.
- Produces: `INSTAGRAM_HOSTS: set[str]`, `parse_instagram_url(raw: str) -> str` (returns shortcode), `detect_platform` returning `"instagram"`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_instagram_urls.py`:

```python
import pytest

from app.urls import InvalidTweetURL, parse_instagram_url

CODE = "DbKoX9xTgPz"


@pytest.mark.parametrize("url", [
    f"https://www.instagram.com/reel/{CODE}",
    f"https://www.instagram.com/reel/{CODE}/",
    f"https://instagram.com/reels/{CODE}",
    f"https://m.instagram.com/p/{CODE}",
    f"https://www.instagram.com/tv/{CODE}",
    f"https://www.instagram.com/nasa/reel/{CODE}/",
    f"https://www.instagram.com/some.user_1/p/{CODE}",
    f"https://instagr.am/p/{CODE}",
    f"www.instagram.com/reel/{CODE}",
    f"https://www.instagram.com/reel/{CODE}?igsh=abc123",
])
def test_accepts_and_extracts_shortcode(url):
    assert parse_instagram_url(url) == CODE


@pytest.mark.parametrize("url", [
    "",
    "https://example.com/reel/DbKoX9xTgPz",
    "https://kkinstagram.com/reel/DbKoX9xTgPz",
    "https://www.instagram.com/nasa",
    "https://www.instagram.com/stories/nasa/123456/",
    "https://www.instagram.com/reel/ab",
    "https://www.instagram.com/reel/has%20space",
    "ftp://www.instagram.com/reel/DbKoX9xTgPz",
    "https://www.instagram.com.evil.com/reel/DbKoX9xTgPz",
])
def test_rejects(url):
    with pytest.raises(InvalidTweetURL):
        parse_instagram_url(url)
```

Extend `backend/tests/test_platforms.py` (match its existing style):

```python
def test_detect_instagram():
    assert detect_platform("https://www.instagram.com/reel/DbKoX9xTgPz") == "instagram"
    assert detect_platform("instagr.am/p/DbKoX9xTgPz") == "instagram"
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `backend/`): `pytest tests/test_instagram_urls.py tests/test_platforms.py -v`
Expected: FAIL / ERROR with `ImportError: cannot import name 'parse_instagram_url'`.

- [ ] **Step 3: Implement**

Append to `backend/app/urls.py`:

```python
INSTAGRAM_HOSTS = {
    "instagram.com", "www.instagram.com", "m.instagram.com",
    "instagr.am", "www.instagr.am",
}

_IG_CODE = re.compile(r"[A-Za-z0-9_-]{5,20}")
_IG_USER = re.compile(r"[A-Za-z0-9._]{1,30}")
_IG_KINDS = ("p", "reel", "reels", "tv")


def parse_instagram_url(raw: str) -> str:
    """Return the shortcode for /p|reel|reels|tv/<code>, optionally username-prefixed.

    The shortcode is the only thing ever forwarded to the third-party resolver,
    and it is charset-validated here, so an arbitrary user URL (or path) can
    never reach it. We host-allowlist first, same rule as tiktok/reddit.
    """
    raw = (raw or "").strip()
    if not raw:
        raise InvalidTweetURL("empty input")
    if "://" not in raw:
        raw = "https://" + raw
    parsed = urlparse(raw)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise InvalidTweetURL(raw)
    if parsed.hostname.lower() not in INSTAGRAM_HOSTS:
        raise InvalidTweetURL(raw)
    parts = [p for p in parsed.path.split("/") if p]
    if len(parts) >= 2 and parts[0] in _IG_KINDS:
        code = parts[1]
    elif len(parts) >= 3 and parts[1] in _IG_KINDS and _IG_USER.fullmatch(parts[0]):
        code = parts[2]
    else:
        raise InvalidTweetURL(raw)
    if not _IG_CODE.fullmatch(code):
        raise InvalidTweetURL(raw)
    return code
```

In `backend/app/platforms.py`: add `INSTAGRAM_HOSTS` to the import from `.urls`, update the docstring to `'twitter' | 'tiktok' | 'reddit' | 'instagram' | None`, and before `return None` add:

```python
    if host in INSTAGRAM_HOSTS:
        return "instagram"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_instagram_urls.py tests/test_platforms.py -v` -> all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/urls.py backend/app/platforms.py backend/tests/test_instagram_urls.py backend/tests/test_platforms.py
git commit -m "feat(instagram): url parser and platform detection"
```

---

### Task 2: instagram.py resolver

**Files:**
- Create: `backend/app/instagram.py`
- Test: `backend/tests/test_instagram.py` (new)

**Interfaces:**
- Consumes: `app_error`, `NOT_FOUND`, `UPSTREAM`, `AppError` from errors.py; `MediaItem`, `ResolveResponse`, `Variant` from schemas.py.
- Produces: `extract_instagram(shortcode: str) -> ResolveResponse`, `map_instagram(shortcode: str, status: int, location: str | None) -> ResolveResponse`, `INSTAGRAM_MEDIA_HOSTS: tuple[str, ...]` = `("cdninstagram.com", "fbcdn.net")`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_instagram.py`:

```python
import base64
import json

import pytest

from app.errors import AppError
from app.instagram import _map_guarded, map_instagram

SC = "DbKoX9xTgPz"
EFG = base64.b64encode(json.dumps({"duration_s": 37}).encode()).decode()
VIDEO = f"https://scontent.cdninstagram.com/o1/v/t2/f2/m86/AQ.mp4?efg={EFG}&oe=6A6AD810"
IMAGE = "https://scontent-mad1-1.cdninstagram.com/v/t51/x.jpg?oe=6A6AD810"
FBCDN = "https://scontent.xx.fbcdn.net/v/t51/x.mp4"


def test_video_302_maps_to_single_hd_variant():
    res = map_instagram(SC, 302, VIDEO)
    assert res.id == SC and res.handle == SC
    assert res.author == "Instagram"
    assert res.avatar_url is None and res.text == ""
    [item] = res.items
    assert item.kind == "video" and item.index == 1
    assert item.duration_seconds == 37.0
    [v] = item.variants
    assert v.label == "hd" and v.url == VIDEO and v.size_bytes is None


def test_image_302_maps_to_photo():
    res = map_instagram(SC, 302, IMAGE)
    [item] = res.items
    assert item.kind == "image"
    assert item.variants[0].label == "photo"
    assert item.duration_seconds is None


def test_fbcdn_host_allowed():
    assert map_instagram(SC, 302, FBCDN).items[0].kind == "video"


def test_404_is_not_found():
    with pytest.raises(AppError) as e:
        map_instagram(SC, 404, None)
    assert e.value.code == "not_found"


@pytest.mark.parametrize("status,loc", [
    (200, None),
    (403, None),
    (500, None),
    (302, None),
    (302, "https://www.effectivegatecpm.com/nf52nwk7?key=x"),
    (302, "https://cdninstagram.com.evil.com/x.mp4"),
    (302, "http://scontent.cdninstagram.com/x.mp4"),
])
def test_non_redirect_and_disallowed_hosts_are_upstream(status, loc):
    with pytest.raises(AppError) as e:
        map_instagram(SC, status, loc)
    assert e.value.code == "upstream_error"


def test_malformed_efg_degrades_to_no_duration():
    res = map_instagram(SC, 302, "https://scontent.cdninstagram.com/x.mp4?efg=%%%not-b64")
    assert res.items[0].duration_seconds is None


def test_unknown_extension_defaults_to_video():
    res = map_instagram(SC, 302, "https://scontent.cdninstagram.com/o1/v/stream")
    assert res.items[0].kind == "video"


def test_guarded_mapper_never_500s(monkeypatch):
    # Anything unanticipated inside mapping must become a clean upstream_error.
    import app.instagram as ig
    monkeypatch.setattr(ig, "map_instagram", lambda *a: (_ for _ in ()).throw(TypeError("boom")))
    with pytest.raises(AppError) as e:
        _map_guarded(SC, 302, VIDEO)
    assert e.value.code == "upstream_error"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_instagram.py -v`
Expected: ERROR with `ModuleNotFoundError: No module named 'app.instagram'`.

- [ ] **Step 3: Implement `backend/app/instagram.py`**

```python
"""Resolve Instagram posts to direct CDN media via the kkinstagram redirect service.

kkinstagram is a pure redirector: GET /reel/<shortcode> answers 302 with a
Location on Instagram's own CDN. It serves no HTML and no metadata, so
responses are metadata-light by design: no author, caption, or thumbnail
(owner-accepted). Carousels resolve to their first item only (the service has
no index syntax; verified 2026-07-29). Media is progressive (single file) and
the CDN allows cross-origin fetches, so the browser downloads directly and
/api/proxy is only a fallback. CDN URLs are signed with a short expiry, so
resolve.py caches instagram with a reduced TTL. Single volunteer-run
dependency, like tikwm; a fallback fixer can slot in here later (mirrors
fxtwitter -> vxtwitter). kkinstagram gates the media redirect on embed-crawler
user agents, so the UA carries the Discordbot token alongside our own identity;
if resolves start failing with upstream_error, check this gate first.
"""
import base64
import json
import logging
from urllib.parse import parse_qs, urlparse

import httpx

from .errors import NOT_FOUND, UPSTREAM, AppError, app_error
from .schemas import MediaItem, ResolveResponse, Variant

logger = logging.getLogger("savevidai.instagram")

_FIXER = "https://kkinstagram.com"
# The Discordbot token is load-bearing: kkinstagram serves the media 302 only to
# embed-crawler UAs and 301s everything else to an "open in app" page (verified
# live 2026-07-29). Our own name and contact URL stay in the string.
_UA = "SaveVidAI/1.0 (compatible; Discordbot/2.0; +https://savevidai.israfill.dev)"
# Registrable suffixes the redirect may land on (scontent*.cdninstagram.com,
# scontent*.fbcdn.net). NOTE: this tuple feeds the /api/proxy SSRF allowlist,
# so widening it widens what the proxy will fetch on the server's behalf -
# change with care.
INSTAGRAM_MEDIA_HOSTS = ("cdninstagram.com", "fbcdn.net")

_IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".webp")
_REDIRECTS = (301, 302, 303, 307, 308)


def extract_instagram(shortcode: str) -> ResolveResponse:
    try:
        resp = httpx.get(f"{_FIXER}/reel/{shortcode}", headers={"User-Agent": _UA},
                         timeout=12.0, follow_redirects=False)
    except httpx.HTTPError as exc:
        logger.warning("instagram fetch failed for %s: %r", shortcode, exc)
        raise app_error(UPSTREAM) from exc
    return _map_guarded(shortcode, resp.status_code, resp.headers.get("location"))


def _map_guarded(shortcode: str, status: int, location: str | None) -> ResolveResponse:
    """Run the mapper over untrusted upstream output; any shape we didn't
    anticipate becomes a clean upstream_error instead of an unhandled 500
    (mirrors extractor/tiktok)."""
    try:
        return map_instagram(shortcode, status, location)
    except AppError:
        raise
    except Exception as exc:
        logger.warning("instagram mapping failed for %s: %r", shortcode, exc)
        raise app_error(UPSTREAM) from exc


def _allowed_media_url(url: str) -> bool:
    """Boundary-safe suffix match, never substring (mirrors proxy.py), so a
    hijacked fixer redirecting off-CDN can never mint a download link."""
    if not url.startswith("https://"):
        return False
    host = (urlparse(url).hostname or "").lower()
    return any(host == d or host.endswith("." + d) for d in INSTAGRAM_MEDIA_HOSTS)


def _duration(url: str) -> float | None:
    """Best-effort: the CDN URL's efg param is base64 JSON with duration_s."""
    try:
        efg = parse_qs(urlparse(url).query).get("efg", [""])[0]
        val = json.loads(base64.b64decode(efg + "=" * (-len(efg) % 4))).get("duration_s")
        return float(val) if isinstance(val, (int, float)) else None
    except Exception:
        return None


def map_instagram(shortcode: str, status: int, location: str | None) -> ResolveResponse:
    if status == 404:
        raise app_error(NOT_FOUND)
    if status not in _REDIRECTS or not location:
        raise app_error(UPSTREAM)
    if not _allowed_media_url(location):
        logger.warning("instagram redirect to disallowed host for %s", shortcode)
        raise app_error(UPSTREAM)
    path = urlparse(location).path.lower()
    if path.endswith(_IMAGE_EXTS):
        kind, label, duration = "image", "photo", None
    elif path.endswith(".gif"):
        kind, label, duration = "gif", "gif", None
    else:
        kind, label, duration = "video", "hd", _duration(location)
    return ResolveResponse(
        id=shortcode,
        author="Instagram",
        handle=shortcode,
        avatar_url=None,
        text="",
        items=[MediaItem(index=1, kind=kind, thumbnail=None, duration_seconds=duration,
                         variants=[Variant(label=label, url=location)])],
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_instagram.py -v` -> all PASS. Then `ruff check .` -> clean.

- [ ] **Step 5: Commit**

```bash
git add backend/app/instagram.py backend/tests/test_instagram.py
git commit -m "feat(instagram): kkinstagram redirect resolver"
```

---

### Task 3: proxy allowlist

**Files:**
- Modify: `backend/app/proxy.py` (import + `_ALLOWED_HOSTS` line)
- Test: `backend/tests/test_proxy_api.py` (extend, following its existing test style)

**Interfaces:**
- Consumes: `INSTAGRAM_MEDIA_HOSTS` from Task 2.
- Produces: `/api/proxy` accepts `scontent*.cdninstagram.com` and `*.fbcdn.net` URLs.

- [ ] **Step 1: Write the failing tests** (adapt to the file's existing fixture/client pattern; read it first)

```python
def test_proxy_allows_instagram_cdn_hosts():
    assert _allowed_host("https://scontent.cdninstagram.com/o1/v/x.mp4")
    assert _allowed_host("https://scontent-mad1-1.cdninstagram.com/v/x.jpg")
    assert _allowed_host("https://scontent.xx.fbcdn.net/v/x.mp4")


def test_proxy_rejects_instagram_lookalikes_and_hijack_targets():
    assert not _allowed_host("https://cdninstagram.com.evil.com/x.mp4")
    assert not _allowed_host("https://evilfbcdn.net/x.mp4")
    assert not _allowed_host("https://www.effectivegatecpm.com/nf52nwk7")
    assert not _allowed_host("http://scontent.cdninstagram.com/x.mp4")
```

(`_allowed_host` is importable from `app.proxy`; if the existing tests exercise the endpoint instead, mirror that idiom.)

- [ ] **Step 2: Run to verify failure** - `pytest tests/test_proxy_api.py -v`: new tests FAIL (hosts rejected).

- [ ] **Step 3: Implement** - in `backend/app/proxy.py` add `from .instagram import INSTAGRAM_MEDIA_HOSTS` (alphabetical with the others) and change:

```python
_ALLOWED_HOSTS = ("video.twimg.com", *TIKTOK_MEDIA_HOSTS, *REDDIT_MEDIA_HOSTS, *INSTAGRAM_MEDIA_HOSTS)
```

- [ ] **Step 4: Run to verify pass** - `pytest tests/test_proxy_api.py -v` -> PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/proxy.py backend/tests/test_proxy_api.py
git commit -m "feat(instagram): allow instagram cdn hosts in proxy allowlist"
```

---

### Task 4: resolve routing, cache TTL, analytics validator

**Files:**
- Modify: `backend/app/resolve.py`
- Modify: `backend/app/analytics/router.py:55` (platform validator tuple)
- Test: `backend/tests/test_resolve_api.py` or the file where tiktok's routing/TTL is pinned (find with `grep -rn "900" backend/tests/`), plus `backend/tests/test_analytics_api.py`

**Interfaces:**
- Consumes: `parse_instagram_url` (Task 1), `extract_instagram` (Task 2).
- Produces: `/api/resolve` handles instagram URLs; cache key `instagram:<shortcode>`; TTL 600.0.

- [ ] **Step 1: Write the failing tests** (mirror the existing tiktok routing test idiom exactly - locate it first; the shape will be close to):

```python
def test_resolve_routes_instagram(monkeypatch, client):
    calls = {}

    def fake_extract(shortcode):
        calls["sc"] = shortcode
        return ResolveResponse(id=shortcode, author="Instagram", handle=shortcode,
                               text="", items=[MediaItem(index=1, kind="video",
                               variants=[Variant(label="hd", url="https://scontent.cdninstagram.com/x.mp4")])])

    monkeypatch.setattr("app.resolve.extract_instagram", fake_extract)
    r = client.post("/api/resolve", json={"url": "https://www.instagram.com/reel/DbKoX9xTgPz"})
    assert r.status_code == 200
    assert calls["sc"] == "DbKoX9xTgPz"


def test_instagram_cache_ttl_is_600(monkeypatch, client):
    seen = {}
    real_set = cache.set

    def spy(key, value, ttl=None):
        seen[key] = ttl
        real_set(key, value, ttl)

    monkeypatch.setattr("app.resolve.cache.set", spy)
    # (with extract_instagram monkeypatched as above)
    client.post("/api/resolve", json={"url": "https://www.instagram.com/reel/DbKoX9xTgPz"})
    assert seen["instagram:DbKoX9xTgPz"] == 600.0
```

Analytics: extend the existing validator test in `test_analytics_api.py` so `platform="instagram"` is accepted (and an unknown platform still 422s).

- [ ] **Step 2: Run to verify failure** - instagram URL currently resolves to `invalid_url` -> FAIL.

- [ ] **Step 3: Implement** - in `backend/app/resolve.py`:

Imports: add `from .instagram import extract_instagram` and `parse_instagram_url` to the `.urls` import. Insert BEFORE the reddit `else` branch:

```python
        elif platform == "instagram":
            shortcode = parse_instagram_url(payload.url)
            key = f"instagram:{shortcode}"

            def resolver() -> ResolveResponse:
                return extract_instagram(shortcode)
```

Change the TTL line (signed-url expiries: tiktok ~hours -> 900, instagram `oe=` a few hours -> 600 for safety margin; comment stays accurate):

```python
        ttl = 900.0 if platform == "tiktok" else 600.0 if platform == "instagram" else None
        cache.set(key, result, ttl=ttl)
```

In `backend/app/analytics/router.py` line 55: `("twitter", "tiktok", "reddit", "instagram")`.

- [ ] **Step 4: Run to verify pass** - `pytest tests/ -x -q` (full suite; nothing else may regress). `ruff check .` clean.

- [ ] **Step 5: Commit**

```bash
git add backend/app/resolve.py backend/app/analytics/router.py backend/tests/
git commit -m "feat(instagram): resolve routing, 600s cache ttl, analytics platform"
```

---

### Task 5: backend page routes

**Files:**
- Modify: `backend/app/main.py` (after the reddit_page route)
- Test: `backend/tests/test_pages_routes.py` (extend, mirroring how tiktok/reddit routes are tested there - read it first)

**Interfaces:**
- Consumes: `PageRenderer.render(filename)` (existing).
- Produces: `GET /instagramvideodownloader` and `GET /instagramvideodownloader.html` render the shell through the ad-aware renderer (ads marker handling + maintenance behavior come free).

- [ ] **Step 1: Write the failing tests** - clone the existing tiktok route test cases for `instagramvideodownloader` (200, renderer used, `<!--ADS-->` marker stripped when ads off, blocked during maintenance like other public pages).
- [ ] **Step 2: Run to verify failure** - 404 on the new paths.
- [ ] **Step 3: Implement** in `create_app` after `reddit_page`:

```python
    @app.get("/instagramvideodownloader")
    @app.get("/instagramvideodownloader.html")
    def instagram_page():
        return renderer.render("instagramvideodownloader.html")
```

- [ ] **Step 4: Run to verify pass** - `pytest tests/test_pages_routes.py tests/test_maintenance.py -v`, then full suite.
- [ ] **Step 5: Commit**

```bash
git add backend/app/main.py backend/tests/test_pages_routes.py
git commit -m "feat(instagram): serve instagram page through ad-aware renderer"
```

---

### Task 6: frontend shell, vite entry, og image

**Files:**
- Create: `frontend/instagramvideodownloader.html`
- Modify: `frontend/vite.config.ts` (input map), `scripts/make_og.py` (VARIANTS)
- Create (generated): `frontend/public/og-instagram.png`

**Interfaces:**
- Produces: shell with `<div id="root">`, module script `/src/instagram/main.tsx` (Task 7 creates it, build happens in Task 8's gate), exactly one `<!--ADS-->` marker, JSON-LD FAQ matching the visible FAQ Task 7 renders.

- [ ] **Step 1: Write the shell.** Copy `frontend/tiktokvideodownloader.html` to `frontend/instagramvideodownloader.html`, then apply ALL of these exact replacements (keep everything else byte-identical, including the ads marker, ad-slot CSS, theme script, fonts preload):
  - `<title>`, `og:title`, `twitter:title`: `Instagram Reel Downloader - Fast, Free, HD | SaveVid AI`
  - meta description: `Download Instagram reels and videos in HD. No fake download buttons, no forced redirects. Free and instant.`
  - `og:description` + `twitter:description`: `Paste an Instagram link, get the video in seconds. No fake buttons, one real click.`
  - canonical + `og:url`: `https://savevidai.israfill.dev/instagramvideodownloader`
  - `og:image` + `twitter:image`: `https://savevidai.israfill.dev/og-instagram.png`
  - module script src: `/src/instagram/main.tsx`
  - JSON-LD FAQ `mainEntity`, exactly these four Q/As (Task 7 renders the same text in the visible FAQ - they MUST match):
    1. `Can I download Instagram reels?` / `Yes. Paste the reel link and you get the video in HD, straight from Instagram's servers. Public posts only.`
    2. `Is the Instagram downloader free?` / `Yes. No fake download buttons and no forced redirects: your download is always one real click. A small ad keeps the site free.`
    3. `Can I download photo carousels?` / `Carousel posts save the first photo or video only for now. Single photos and reels download in full.`
    4. `Is it safe to use SaveVid AI for Instagram?` / `Yes. There is no login and no account. We keep only anonymous, aggregate usage counts.`
  - Static crawlable landing section: keep the three-step structure, reword for Instagram (`paste the instagram link`, `pick your file`, `one real click`), and the FAQ text above.
  - No watermark claims anywhere (Instagram has no watermark to remove; do not copy the tiktok watermark wording).
- [ ] **Step 2: Vite entry** - in `frontend/vite.config.ts` input map add: `instagram: entry("./instagramvideodownloader.html"),`
- [ ] **Step 3: OG image** - in `scripts/make_og.py` add to `VARIANTS`: `"instagram": {"filename": "og-instagram.png", "title": "Instagram Reel Downloader", "subtitle": "Free. No fake buttons. One real click."}` and update the module docstring usage lines. Run `python scripts/make_og.py --variant instagram` (from repo root, backend venv has pillow; if not, `pip install pillow`). Verify `frontend/public/og-instagram.png` exists, 1200x630.
- [ ] **Step 4: Verify** - `npm run build` from `frontend/` fails ONLY because `/src/instagram/main.tsx` doesn't exist yet; that's expected. Confirm the shell greps: `grep -c 'ADS' frontend/instagramvideodownloader.html` -> 1; `grep -ci 'watermark\|no ads\|open source' frontend/instagramvideodownloader.html` -> 0.
- [ ] **Step 5: Commit**

```bash
git add frontend/instagramvideodownloader.html frontend/vite.config.ts scripts/make_og.py frontend/public/og-instagram.png
git commit -m "feat(instagram): seo shell, vite entry, og image"
```

---

### Task 7: frontend app, platform links, sitemap

**Files:**
- Create: `frontend/src/instagram/main.tsx`, `frontend/src/instagram/InstagramApp.tsx`, `frontend/src/instagram/InstagramApp.test.tsx`
- Modify: `frontend/src/components/PlatformLinks.tsx` (+ its test), `frontend/public/sitemap.xml`

**Interfaces:**
- Consumes: `PasteInput`, `PreviewCard`, `PlatformLinks`, `useResolve`, `sendEvent`, `visitContext` (all existing; read `frontend/src/tiktok/TikTokApp.tsx` and `main.tsx` first and mirror their structure and idioms exactly).
- Produces: `/src/instagram/main.tsx` entry that mounts `InstagramApp`.

- [ ] **Step 1: Write the failing tests.** Mirror `TikTokApp.test.tsx` (same mocking idioms), asserting at minimum:

```tsx
// visit beacon fires with the platform
expect(visitBody).toMatchObject({ type: "visit", platform: "instagram" });
// hero renders and PlatformLinks marks instagram active
// resolve flow: paste URL -> mocked /api/resolve response with one hd variant renders PreviewCard
// carousel honesty: FAQ text "first photo or video only" is present
```

PlatformLinks test additions: instagram entry renders on all pages, `active="instagram"` marks it current, href is `/instagramvideodownloader`.

- [ ] **Step 2: Run to verify failure** - `npx vitest run src/instagram src/components/PlatformLinks.test.tsx` fails (module missing / entry missing).
- [ ] **Step 3: Implement.**
  - `PlatformLinks.tsx`: `type Platform = "twitter" | "tiktok" | "reddit" | "instagram";` and append `{ key: "instagram", label: "Instagram", href: "/instagramvideodownloader" },` to `PLATFORMS`.
  - `src/instagram/main.tsx`: copy `src/tiktok/main.tsx`, swap the App import.
  - `src/instagram/InstagramApp.tsx`: copy `TikTokApp.tsx` structure; platform string `"instagram"` in the visit beacon and `PreviewCard` prop; hero copy in owner voice, e.g. heading `instagram reel downloader`, sub `paste an instagram link, get the video in hd. no fake buttons, one real click.`; visible FAQ text identical to the four JSON-LD answers in Task 6; skip the TikTok slideshow-specific HowTo visual (use the shared `HowToVisual` if generic; otherwise a plain three-step list matching the shell's static section). Metadata-light note: PreviewCard already tolerates `avatar_url: null` and empty `text` (verify; if it renders an empty caption block, guard it).
  - `frontend/public/sitemap.xml`: add a `<url>` entry for `https://savevidai.israfill.dev/instagramvideodownloader` matching the existing entries' shape.
- [ ] **Step 4: Run to verify pass** - `npx vitest run` (full suite) then `npm run build` (must succeed now that main.tsx exists; confirms the Task 6 entry).
- [ ] **Step 5: Commit**

```bash
git add frontend/src/instagram frontend/src/components/PlatformLinks.tsx frontend/src/components/PlatformLinks.test.tsx frontend/public/sitemap.xml
git commit -m "feat(instagram): instagram page app, platform links, sitemap"
```

---

### Task 8: full gate + live verification

**Files:** none new (fixes only if the gate finds regressions)

- [ ] **Step 1: Backend gate** - from `backend/`: `pytest tests/ -q` (all pass, warnings <= 7) and `ruff check .` plus `ruff check ../scripts` clean.
- [ ] **Step 2: Frontend gate** - from `frontend/`: `npx vitest run` all pass, `npm run build` clean; `grep -c 'ADS' dist/instagramvideodownloader.html` -> 1.
- [ ] **Step 3: Live resolver verification (real network, no mocks)** - from `backend/` venv:

```bash
python -c "
from app.instagram import extract_instagram
r = extract_instagram('DbKoX9xTgPz')
assert r.items[0].kind == 'video' and r.items[0].variants[0].url.startswith('https://')
print('live resolve OK:', r.items[0].variants[0].url[:80])
print('duration:', r.items[0].duration_seconds)
"
```

Expected: prints a `https://scontent...cdninstagram.com` URL and `duration: 37.0`. (If kkinstagram is down, note it in the report; do not fake the pass.) If the Location is a `kkclip.com` "open in app" URL instead, the crawler-UA gate is what failed: kkinstagram serves the media 302 only to embed-crawler user agents, so `_UA` must keep its `Discordbot/2.0` token (verified live 2026-07-29). `tests/test_instagram.py::test_request_pins_crawler_ua_and_no_redirect_follow` pins that string.
- [ ] **Step 4: Local end-to-end** - run backend (`uvicorn app.main:app --port 8000`) + `npm run dev`, browse `http://localhost:5173/instagramvideodownloader.html`, paste `https://www.instagram.com/reel/DbKoX9xTgPz`, confirm the card renders and the download button yields an mp4. Screenshot for the report.
- [ ] **Step 5: Update ledger** - append an `## Instagram downloader (feature/instagram-downloader, plan 2026-07-29)` section to `.superpowers/sdd/progress.md` summarizing task completions.
- [ ] **Step 6: Commit any gate fixes + ledger**

```bash
git add -A
git commit -m "chore(instagram): final gate fixes and ledger"
```

---

## Post-merge (owner runbook, not part of this branch)

Deploy: `ssh root@159.195.159.26`, `cd /opt/savevidai`, `git pull && docker compose -f compose.prod.yaml up -d --build`. Then prod-verify: `curl -s https://savevidai.israfill.dev/instagramvideodownloader | grep -c ADS` -> 0 (marker consumed), resolve a real reel through the live UI, check `/admin` shows instagram in platforms.
