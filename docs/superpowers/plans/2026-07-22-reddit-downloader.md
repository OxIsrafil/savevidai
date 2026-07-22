# Reddit Downloader + Speed Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Reddit (videos with server-merged audio, GIFs, images, galleries) as a third platform on `/redditvideodownloader`, plus immutable asset caching, font preload, and a dashboard panel collapse.

**Architecture:** A `reddit.py` resolver authenticates via Reddit's OAuth client-credentials API (env-gated) and maps posts into the existing `ResolveResponse`. Video variants point at a new `/api/mux/{vid}/{h}.mp4` endpoint that fetches v.redd.it's separate video+audio streams, merges with `ffmpeg -c copy` into a per-request temp file, streams it, and deletes it. Galleries reuse the TikTok PhotoGrid untouched. The page mirrors the TikTok page pattern.

**Tech Stack:** Python 3.12, FastAPI, httpx, pytest, respx, ffmpeg (Docker). TypeScript, Vite 6, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-22-reddit-downloader-design.md` (read before starting).

## Global Constraints

- Response schema unchanged: `ResolveResponse(id, author, handle, avatar_url, text, items[MediaItem(index, kind, thumbnail, duration_seconds, variants[Variant(label, width, height, url, size_bytes)])])`.
- Reddit video labels are `<height>p` (matching the existing `\d{2,4}p` regex); images use label `photo`. `handle` is the bare username (feeds filenames); `author` displays `u/name`.
- Platform values exactly `twitter|tiktok|reddit` in every validator (backend EventIn, frontend types).
- Mux endpoint takes validated ids only, never URLs: `vid` matches `^[A-Za-z0-9]{8,20}$`, `height` in {240,360,480,720,1080}. All source URLs are server-constructed on `https://v.redd.it/`.
- Merged files are per-request temp files deleted before the request ends. Nothing is ever stored; the database holds only analytics counters.
- Proxy host matching stays exact-host or dot-suffix, never substring; no redirect-follow. Allowlist additions (`v.redd.it`, `i.redd.it`) are security-reviewed.
- Reddit support is env-gated (`REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`): missing vars -> `AppError("not_configured", "Reddit support is not configured on this server.", 503)` with no network call. Analytics gating unchanged and independent.
- No transcoding: ffmpeg is `-c copy` only. No new Python/npm dependencies.
- No em dashes and no emoji anywhere, including page copy, JSON-LD, SVG text.
- Backend commands from `backend/` with venv active (`source .venv/bin/activate`); frontend from `frontend/`. Warning baseline: 5. Conventional commit prefixes.

## Verified third-party contract

Probed 2026-07-22: anonymous reddit JSON access returns `403 Blocked` (curl/python, browser headers, residential IP) - OAuth is mandatory, not optional. `v.redd.it`/`i.redd.it` CDN anonymity is EXPECTED but unverified (no post id obtainable without creds); Task 2 carries the live verification step once the owner supplies env vars, and Tasks 3/6/7 use the recorded fixture shapes below, which follow Reddit's documented API. If live verification contradicts a fixture, fix the fixture and re-run the affected task's tests before proceeding.

Documented shapes the fixtures encode:
- Video post: `data.children[0].data` has `is_video: true`, `secure_media.reddit_video: {fallback_url: "https://v.redd.it/<vid>/DASH_<h>.mp4?source=fallback", height, width, duration, has_audio, dash_url, hls_url}`.
- Gallery: `is_gallery: true`, `gallery_data.items: [{media_id, id}]` (order), `media_metadata.<media_id>: {status: "valid", m: "image/jpg", s: {u: "https://preview.redd.it/...", x, y}}` - the original lives at `https://i.redd.it/<media_id>.<ext>` (ext from `m`).
- Image post: `post_hint: "image"`, `url_overridden_by_dest: "https://i.redd.it/<id>.jpg"`.
- GIF: `preview.reddit_video_preview: {fallback_url, has_audio: false, height, ...}` or `secure_media.reddit_video.is_gif: true`.
- Audio renditions on v.redd.it: `DASH_AUDIO_128.mp4`, `DASH_AUDIO_64.mp4`, legacy `DASH_audio.mp4`; any may 404.

## File structure

Backend:
- Modify `backend/app/urls.py` - `REDDIT_HOSTS`, `parse_reddit_url` -> `("post", post_id) | ("share", url)`.
- Modify `backend/app/platforms.py` - `detect_platform` returns `"reddit"` for reddit hosts.
- Create `backend/app/reddit.py` - OAuth token cache, `fetch_post`, `resolve_share_link`, `map_reddit` (guarded), `extract_reddit`.
- Create `backend/app/mux.py` - `/api/mux/{vid}/{height}.mp4` route.
- Modify `backend/app/errors.py` - `NOT_CONFIGURED` tuple.
- Modify `backend/app/resolve.py` - reddit branch.
- Modify `backend/app/proxy.py` - allowlist + `REDDIT_MEDIA_HOSTS`.
- Modify `backend/app/analytics/router.py` - platform validator adds `reddit`.
- Modify `backend/app/main.py` - mux router, `/redditvideodownloader` route, cache-header middleware.
- Modify `backend/Dockerfile` - ffmpeg.

Frontend:
- Create `frontend/redditvideodownloader.html`, `frontend/src/reddit/{main,RedditApp,RedditHowToVisual}.tsx`.
- Modify `frontend/src/components/PlatformLinks.tsx` - third card.
- Modify `frontend/src/lib/download.ts` - direct-fetch branch for site-relative variant URLs.
- Modify `frontend/src/lib/analytics.ts` + type unions - `"reddit"`.
- Modify `frontend/src/components/BarList` (in `admin/Admin.tsx`) - `maxRows` collapse.
- Modify `frontend/vite.config.ts`, `frontend/public/sitemap.xml`, `frontend/public/fonts/` (new), all three HTML entries (font preload), `scripts/make_og.py` + `frontend/public/og-reddit.png`.

---

### Task 1: Reddit URL parsing + platform detection

**Files:**
- Modify: `backend/app/urls.py`, `backend/app/platforms.py`
- Test: `backend/tests/test_urls.py`, `backend/tests/test_platforms.py`

**Interfaces:**
- Produces: `REDDIT_HOSTS: set[str]` = {"reddit.com", "www.reddit.com", "old.reddit.com", "np.reddit.com", "redd.it"}; `parse_reddit_url(raw: str) -> tuple[str, str]` returning `("post", post_id)` for comment/redd.it links (post id validated `^[a-z0-9]{1,13}$`, lowercased) or `("share", normalized_https_url)` for `/r/<sub>/s/<token>` share links; raises `InvalidTweetURL` otherwise. `detect_platform` returns `"reddit"` for these hosts.

- [ ] **Step 1: Write the failing tests** (append to `backend/tests/test_urls.py`)

```python
from app.urls import parse_reddit_url

REDDIT_POST_CASES = [
    ("https://www.reddit.com/r/aww/comments/1abc23x/cute_dog/", "1abc23x"),
    ("https://reddit.com/r/aww/comments/1abc23x", "1abc23x"),
    ("https://old.reddit.com/r/aww/comments/1abc23x/title/?share=1", "1abc23x"),
    ("https://www.reddit.com/comments/1abc23x", "1abc23x"),
    ("https://redd.it/1abc23x", "1abc23x"),
    ("redd.it/1abc23x", "1abc23x"),
]
REDDIT_INVALID = [
    "",
    "https://reddit.com.evil.com/r/aww/comments/1abc23x",
    "https://evilreddit.com/r/aww/comments/1abc23x",
    "https://reddit.com/r/aww",
    "https://reddit.com/user/someone",
    "ftp://reddit.com/r/aww/comments/1abc23x",
    "https://x.com/jack/status/20",
]


@pytest.mark.parametrize("url,expected_id", REDDIT_POST_CASES)
def test_parse_reddit_post(url, expected_id):
    kind, value = parse_reddit_url(url)
    assert kind == "post"
    assert value == expected_id


def test_parse_reddit_share_link():
    kind, value = parse_reddit_url("https://www.reddit.com/r/aww/s/AbCdEfGh1")
    assert kind == "share"
    assert value.startswith("https://www.reddit.com/r/aww/s/")


@pytest.mark.parametrize("url", REDDIT_INVALID)
def test_parse_reddit_invalid(url):
    with pytest.raises(InvalidTweetURL):
        parse_reddit_url(url)
```

And append to `backend/tests/test_platforms.py`:

```python
REDDIT_DETECT = [
    ("https://www.reddit.com/r/aww/comments/1abc23x/x/", "reddit"),
    ("https://redd.it/1abc23x", "reddit"),
    ("reddit.com/r/aww/comments/1abc23x", "reddit"),
]


@pytest.mark.parametrize("url,expected", REDDIT_DETECT)
def test_detect_reddit(url, expected):
    assert detect_platform(url) == expected
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest tests/test_urls.py -k reddit tests/test_platforms.py -k reddit -v`
Expected: ImportError `parse_reddit_url`.

- [ ] **Step 3: Implement**

`backend/app/urls.py` (follow the existing normalize idiom used by `parse_tiktok_url`):

```python
REDDIT_HOSTS = {"reddit.com", "www.reddit.com", "old.reddit.com", "np.reddit.com", "redd.it"}

_REDDIT_ID = re.compile(r"^[a-z0-9]{1,13}$")


def parse_reddit_url(raw: str) -> tuple[str, str]:
    """Return ("post", id) or ("share", url) for an allowed reddit link.

    Share links (/r/<sub>/s/<token>) carry no post id; the resolver follows
    them through an authenticated request. Everything else must yield a
    base36 post id.
    """
    raw = (raw or "").strip()
    if not raw:
        raise InvalidTweetURL("empty input")
    if "://" not in raw:
        raw = "https://" + raw
    parsed = urlparse(raw)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise InvalidTweetURL(raw)
    host = parsed.hostname.lower()
    if host not in REDDIT_HOSTS:
        raise InvalidTweetURL(raw)
    parts = [p for p in parsed.path.split("/") if p]
    post_id = None
    if host == "redd.it":
        post_id = parts[0].lower() if parts else None
    elif len(parts) >= 4 and parts[0] == "r" and parts[2] == "comments":
        post_id = parts[3].lower()
    elif len(parts) >= 2 and parts[0] == "comments":
        post_id = parts[1].lower()
    elif len(parts) >= 3 and parts[0] == "r" and parts[2] == "s":
        if raw.startswith("http://"):
            raw = raw.replace("http://", "https://", 1)
        return ("share", raw)
    if not post_id or not _REDDIT_ID.match(post_id):
        raise InvalidTweetURL(raw)
    return ("post", post_id)
```

`backend/app/platforms.py`: import `REDDIT_HOSTS`, add `if host in REDDIT_HOSTS: return "reddit"` before the final `return None`.

- [ ] **Step 4: Run tests to verify green** - `python -m pytest tests/test_urls.py tests/test_platforms.py -v`

- [ ] **Step 5: Commit**

```bash
ruff check . && cd .. && git add backend/app/urls.py backend/app/platforms.py backend/tests/test_urls.py backend/tests/test_platforms.py && git commit -m "feat: reddit url parsing and platform detection" && cd backend
```

---

### Task 2: OAuth client + post fetch

**Files:**
- Create: `backend/app/reddit.py` (auth + fetch half)
- Modify: `backend/app/errors.py`
- Test: `backend/tests/test_reddit_auth.py`

**Interfaces:**
- Consumes: `AppError`, `app_error`, `NOT_FOUND`, `PRIVATE`, `UPSTREAM` from `app.errors`.
- Produces: `errors.NOT_CONFIGURED = ("not_configured", "Reddit support is not configured on this server.", 503)`; `reddit.is_configured() -> bool`; `reddit._get_token() -> str` (cached, thread-safe, refreshes 60s before expiry); `reddit.fetch_post(post_id: str) -> dict` (the post `data` dict); `reddit.resolve_share_link(url: str) -> str` (post id). All network via a module-level `httpx.Client` factory so respx can intercept; UA `SaveVidAI/1.0 (+https://savevidai.israfill.dev)`.

- [ ] **Step 1: Write the failing tests** (`backend/tests/test_reddit_auth.py`) - use respx; monkeypatch env vars

```python
import httpx
import pytest
import respx

import app.reddit as reddit_mod
from app.errors import AppError

TOKEN_URL = "https://www.reddit.com/api/v1/access_token"
POST_URL = "https://oauth.reddit.com/comments/1abc23x"


@pytest.fixture(autouse=True)
def creds(monkeypatch):
    monkeypatch.setenv("REDDIT_CLIENT_ID", "cid")
    monkeypatch.setenv("REDDIT_CLIENT_SECRET", "csec")
    reddit_mod._token_cache.clear()
    yield


def _mock_token(mock, token="tok1", expires=3600):
    mock.post(TOKEN_URL).mock(return_value=httpx.Response(200, json={
        "access_token": token, "token_type": "bearer", "expires_in": expires}))


def test_not_configured_raises_before_network(monkeypatch):
    monkeypatch.delenv("REDDIT_CLIENT_ID")
    with pytest.raises(AppError) as exc:
        reddit_mod.fetch_post("1abc23x")
    assert exc.value.code == "not_configured"
    assert exc.value.status == 503


def test_token_cached_across_calls():
    with respx.mock as mock:
        _mock_token(mock)
        route = mock.get(url__startswith=POST_URL).mock(return_value=httpx.Response(200, json={
            "data": {"children": [{"data": {"id": "1abc23x", "title": "t"}}]}}))
        reddit_mod.fetch_post("1abc23x")
        reddit_mod.fetch_post("1abc23x")
        assert mock.routes[0].call_count == 1  # one token fetch
        assert route.call_count == 2


def test_post_404_maps_not_found():
    with respx.mock as mock:
        _mock_token(mock)
        mock.get(url__startswith=POST_URL).mock(return_value=httpx.Response(404))
        with pytest.raises(AppError) as exc:
            reddit_mod.fetch_post("1abc23x")
    assert exc.value.code == "not_found"


def test_post_403_maps_private():
    with respx.mock as mock:
        _mock_token(mock)
        mock.get(url__startswith=POST_URL).mock(return_value=httpx.Response(403))
        with pytest.raises(AppError) as exc:
            reddit_mod.fetch_post("1abc23x")
    assert exc.value.code == "private_or_restricted"


def test_expired_token_refreshes_once_on_401():
    with respx.mock as mock:
        mock.post(TOKEN_URL).mock(side_effect=[
            httpx.Response(200, json={"access_token": "old", "token_type": "bearer", "expires_in": 3600}),
            httpx.Response(200, json={"access_token": "new", "token_type": "bearer", "expires_in": 3600}),
        ])
        mock.get(url__startswith=POST_URL).mock(side_effect=[
            httpx.Response(401),
            httpx.Response(200, json={"data": {"children": [{"data": {"id": "1abc23x"}}]}}),
        ])
        out = reddit_mod.fetch_post("1abc23x")
        assert out["id"] == "1abc23x"
```

- [ ] **Step 2: Run to verify failure** - ModuleNotFoundError `app.reddit`.

- [ ] **Step 3: Implement** (`backend/app/reddit.py`, auth half)

```python
"""Reddit resolver: OAuth client-credentials + post fetch + mapping.

Anonymous server access to reddit JSON is blocked (403, verified 2026-07-22),
so this module requires REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET (a free
"script" app at reddit.com/prefs/apps). Without them every call raises
not_configured and no network is touched.
"""
import logging
import os
import threading
import time

import httpx

from .errors import NOT_CONFIGURED, NOT_FOUND, PRIVATE, UPSTREAM, AppError, app_error

logger = logging.getLogger("savevidai.reddit")

_UA = "SaveVidAI/1.0 (+https://savevidai.israfill.dev)"
_TOKEN_URL = "https://www.reddit.com/api/v1/access_token"
_API = "https://oauth.reddit.com"
_token_cache: dict = {}
_token_lock = threading.Lock()


def is_configured() -> bool:
    return bool(os.environ.get("REDDIT_CLIENT_ID")) and bool(os.environ.get("REDDIT_CLIENT_SECRET"))


def _client() -> httpx.Client:
    return httpx.Client(timeout=12.0, headers={"User-Agent": _UA})


def _get_token(force: bool = False) -> str:
    if not is_configured():
        raise app_error(NOT_CONFIGURED)
    with _token_lock:
        if not force and _token_cache.get("expires", 0) > time.time() + 60:
            return _token_cache["token"]
        try:
            with _client() as c:
                r = c.post(_TOKEN_URL,
                           auth=(os.environ["REDDIT_CLIENT_ID"], os.environ["REDDIT_CLIENT_SECRET"]),
                           data={"grant_type": "client_credentials"})
            body = r.json()
            token = body["access_token"]
            _token_cache.update(token=token, expires=time.time() + float(body.get("expires_in", 3600)))
            return token
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            logger.warning("reddit token fetch failed: %r", exc)
            raise app_error(UPSTREAM) from exc


def _api_get(path: str, token: str) -> httpx.Response:
    with _client() as c:
        return c.get(f"{_API}{path}", headers={"Authorization": f"bearer {token}"})


def fetch_post(post_id: str) -> dict:
    """Return the post's data dict, or raise the mapped AppError."""
    token = _get_token()
    try:
        r = _api_get(f"/comments/{post_id}?raw_json=1&limit=1", token)
        if r.status_code == 401:
            r = _api_get(f"/comments/{post_id}?raw_json=1&limit=1", _get_token(force=True))
    except httpx.HTTPError as exc:
        logger.warning("reddit fetch failed for %s: %r", post_id, exc)
        raise app_error(UPSTREAM) from exc
    if r.status_code == 404:
        raise app_error(NOT_FOUND)
    if r.status_code == 403:
        raise app_error(PRIVATE)
    if r.status_code != 200:
        raise app_error(UPSTREAM)
    try:
        body = r.json()
        listing = body[0] if isinstance(body, list) else body
        return listing["data"]["children"][0]["data"]
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        raise app_error(UPSTREAM) from exc


def resolve_share_link(url: str) -> str:
    """Follow a /s/ share link (authenticated, no auto-redirects) to its post id."""
    from .urls import InvalidTweetURL, parse_reddit_url
    token = _get_token()
    try:
        with _client() as c:
            r = c.get(url, headers={"Authorization": f"bearer {token}"}, follow_redirects=False)
    except httpx.HTTPError as exc:
        raise app_error(UPSTREAM) from exc
    loc = r.headers.get("location", "")
    if r.status_code not in (301, 302, 303, 307, 308) or not loc:
        raise app_error(NOT_FOUND)
    try:
        kind, value = parse_reddit_url(loc)
    except InvalidTweetURL as exc:
        raise app_error(NOT_FOUND) from exc
    if kind != "post":
        raise app_error(NOT_FOUND)
    return value
```

Add to `backend/app/errors.py`:

```python
NOT_CONFIGURED = ("not_configured", "Reddit support is not configured on this server.", 503)
```

- [ ] **Step 4: Green + full suite** - `python -m pytest tests/test_reddit_auth.py -v && python -m pytest -q`

- [ ] **Step 5: Commit**

```bash
ruff check . && cd .. && git add backend/app/reddit.py backend/app/errors.py backend/tests/test_reddit_auth.py && git commit -m "feat: reddit oauth client with cached token and error mapping" && cd backend
```

**LIVE VERIFICATION (controller, requires owner env vars):** once `REDDIT_CLIENT_ID/SECRET` exist, run one real `fetch_post` on a known video post, confirm the fixture shapes in this plan match reality (fallback_url pattern, audio rendition names, i.redd.it anonymity), and record findings in the ledger. Fix fixtures if reality differs.

---

### Task 3: Reddit mapper

**Files:**
- Modify: `backend/app/reddit.py` (mapping half)
- Test: `backend/tests/test_reddit_map.py`

**Interfaces:**
- Consumes: `MediaItem, ResolveResponse, Variant` from `app.schemas`; `NO_VIDEO` from errors.
- Produces: `map_reddit(post_id: str, post: dict) -> ResolveResponse` (pure), `_map_guarded(post_id, post)` (clone of tiktok's guard), `extract_reddit(parsed: tuple[str, str]) -> ResolveResponse` (fetch + share-resolve + guard), `REDDIT_MEDIA_HOSTS = ("redd.it",)` (covers v.redd.it + i.redd.it via suffix).
- Video variants: heights from `_LADDER = (1080, 720, 480, 360, 240)` filtered `<= source height`, plus the source height itself if absent from the ladder; each label `f"{h}p"`, width/height scaled from source aspect; `has_audio` true -> url `/api/mux/{vid}/{h}.mp4`, false -> `https://v.redd.it/{vid}/DASH_{h}.mp4`. `vid` extracted from `fallback_url` (`v.redd.it/<vid>/...`), validated `^[A-Za-z0-9]{8,20}$` else UPSTREAM.
- Gallery -> image items 1..N from `gallery_data.items` order, url `https://i.redd.it/{media_id}.{ext}` (ext from `media_metadata[..].m` after "image/", jpg for jpeg); skip non-valid statuses. Single image -> one item. GIF (`reddit_video_preview` or `is_gif`) -> no-audio video treatment. Nothing usable -> NO_VIDEO.

- [ ] **Step 1: Write the failing tests** (`backend/tests/test_reddit_map.py`) - fixtures per the documented shapes: a video post (has_audio true, height 720 -> expect variants 720p/480p/360p/240p, urls /api/mux/...), a no-audio video (direct v.redd.it urls), a gallery of 3 (image items, i.redd.it urls, order preserved), a single image, a text-only post (NO_VIDEO), malformed media_metadata entry skipped, non-dict secure_media -> guarded upstream via _map_guarded. Assert `handle` bare username and `author == "u/" + handle`. Write complete fixtures (compact dicts) - no placeholders.

- [ ] **Step 2: Run to verify failure** - ImportError `map_reddit`.

- [ ] **Step 3: Implement** the mapping half in `reddit.py`, mirroring `tiktok.py`'s structure (`_map_guarded` catching AppError-then-Exception; helpers `_video_items`, `_gallery_items`). `extract_reddit(parsed)`: share links resolve to a post id first, then `fetch_post`, then `_map_guarded`.

- [ ] **Step 4: Green + full suite.**

- [ ] **Step 5: Commit**

```bash
ruff check . && cd .. && git add backend/app/reddit.py backend/tests/test_reddit_map.py && git commit -m "feat: reddit post mapper (video, gif, image, gallery)" && cd backend
```

---

### Task 4: Resolve routing + analytics platform

**Files:**
- Modify: `backend/app/resolve.py`, `backend/app/analytics/router.py`
- Test: `backend/tests/test_resolve_api.py`, `backend/tests/test_analytics_api.py`

**Interfaces:**
- Consumes: `detect_platform` ("reddit"), `parse_reddit_url`, `extract_reddit`.
- Produces: `/api/resolve` routes reddit; cache key `f"reddit:{post_id}"` for post links and `f"reddit:{share_url}"` for share links (default TTL - v.redd.it DASH urls are not time-signed); fetch events platform-tagged `reddit`; EventIn platform validator accepts `"reddit"`.

- [ ] **Step 1: Failing tests:** resolve routes a reddit URL to a monkeypatched `extract_reddit` (mirror the existing TT-fixture test pattern); reddit fetch event carries platform "reddit"; `/api/event` accepts platform "reddit" and still rejects "youtube". Also: an unconfigured-reddit resolve (monkeypatch `extract_reddit` to raise `app_error(NOT_CONFIGURED)`) returns 503 with error code `not_configured`.
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement:** reddit branch in `resolve.py` (parse -> key -> `def resolver(): return extract_reddit(parsed)`); add `"reddit"` to the EventIn platform tuple.
- [ ] **Step 4: Green + full suite.**
- [ ] **Step 5: Commit**

```bash
ruff check . && cd .. && git add backend/app/resolve.py backend/app/analytics/router.py backend/tests/test_resolve_api.py backend/tests/test_analytics_api.py && git commit -m "feat: resolve routes reddit; analytics accepts reddit platform" && cd backend
```

---

### Task 5: Proxy allowlist + reddit hosts

**Files:**
- Modify: `backend/app/proxy.py`
- Test: `backend/tests/test_proxy_api.py`

**Interfaces:**
- Consumes: `REDDIT_MEDIA_HOSTS` from `app.reddit`.
- Produces: `_ALLOWED_HOSTS = ("video.twimg.com", *TIKTOK_MEDIA_HOSTS, *REDDIT_MEDIA_HOSTS)`; `v.redd.it` and `i.redd.it` pass (suffix of `redd.it`), `redd.it.evil.com` 403.

- [ ] **Step 1: Failing tests:** `https://v.redd.it/abc/DASH_720.mp4` mocked 200 passes; `https://i.redd.it/x.jpg` passes; `https://redd.it.evil.com/x.mp4` and `https://vredd.it/x.mp4` 403.
- [ ] **Step 2: Verify failure (v.redd.it currently 403).**
- [ ] **Step 3: Implement** the one-tuple change with a comment noting redd.it is a registrable suffix covering v./i. subdomains.
- [ ] **Step 4: Green + full suite.**
- [ ] **Step 5: Commit**

```bash
ruff check . && cd .. && git add backend/app/proxy.py backend/tests/test_proxy_api.py && git commit -m "feat: proxy allows reddit media hosts, suffix-safe" && cd backend
```

---

### Task 6: Mux endpoint

**Files:**
- Create: `backend/app/mux.py`
- Modify: `backend/app/main.py` (include router), `backend/Dockerfile` (ffmpeg)
- Test: `backend/tests/test_mux_api.py`

**Interfaces:**
- Produces: `GET /api/mux/{vid}/{height}.mp4` with `vid` regex `^[A-Za-z0-9]{8,20}$` and height in {240,360,480,720,1080} (422 otherwise); rate limit `10/minute`; `asyncio.Semaphore(2)`; combined Content-Length cap 300 MB -> 413; audio fallback chain `DASH_AUDIO_128.mp4` -> `DASH_AUDIO_64.mp4` -> `DASH_audio.mp4`; all-audio-404 -> 307 redirect to `/api/proxy?url=https://v.redd.it/{vid}/DASH_{h}.mp4&filename=...`; ffmpeg `-i v -i a -c copy -movflags +faststart` in `tempfile.TemporaryDirectory`, 60s timeout -> 502; response streams the merged file with `Content-Disposition: attachment` (sanitized filename param, default `video.mp4`) and Content-Length; temp dir removed after the response finishes (wrap the file iterator so cleanup runs in `finally`). ffmpeg invoked via `asyncio.create_subprocess_exec` (no shell). Semaphore released on every path.

- [ ] **Step 1: Failing tests** (respx for v.redd.it fetches; monkeypatch the ffmpeg subprocess call with a fake that writes a marker output file): happy path 200 with merged bytes + attachment header; bad vid 422; bad height 422; oversize Content-Length 413; all-audio-404 redirects to the proxy URL; ffmpeg nonzero exit -> 502 and no temp leak (assert the temp dir is gone); semaphore not leaked after failures (mirror the existing proxy no-leak test pattern).
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement** `mux.py`; add `apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*` to the backend Dockerfile runtime stage; include the router in `main.py`.
- [ ] **Step 4: Green + full suite. If ffmpeg exists locally, also run the real-subprocess integration test (skip-marked otherwise).**
- [ ] **Step 5: Commit**

```bash
ruff check . && cd .. && git add backend/app/mux.py backend/app/main.py backend/Dockerfile backend/tests/test_mux_api.py && git commit -m "feat: mux endpoint merges reddit video and audio, stream-copy only" && cd backend
```

---

### Task 7: Frontend platform plumbing

**Files:**
- Modify: `frontend/src/components/PlatformLinks.tsx`, `frontend/src/lib/analytics.ts` (type), `frontend/src/lib/download.ts`, `frontend/src/components/QualityButton.tsx` + `PreviewCard.tsx` + `PhotoGrid.tsx` platform prop unions
- Test: `frontend/src/components/PlatformLinks.test.tsx`, `frontend/src/lib/download.test.ts`

**Interfaces:**
- Produces: `Platform` union gains `"reddit"` everywhere a `"twitter" | "tiktok"` union exists (grep them all); PlatformLinks third card `{key: "reddit", label: "Reddit", href: "/redditvideodownloader"}`; `proxyUrl(url, filename)` returns `url` UNCHANGED when it starts with `/` (site-relative mux URLs are already ours; append the filename query param: `/api/mux/x/720.mp4?filename=...`), else wraps in `/api/proxy` as today.

- [ ] **Step 1: Failing tests:** PlatformLinks renders a reddit link with the exact href on both other pages' active states; `proxyUrl("/api/mux/abc12345/720.mp4", "u_1_720p.mp4")` returns `/api/mux/abc12345/720.mp4?filename=u_1_720p.mp4` and the https case still wraps in /api/proxy.
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement.** Keep `downloadVariant` signature unchanged - the branch lives in `proxyUrl`.
- [ ] **Step 4:** `npm test -- --run && npm run build`.
- [ ] **Step 5: Commit**

```bash
cd .. && git add frontend/src/components/PlatformLinks.tsx frontend/src/components/PlatformLinks.test.tsx frontend/src/lib/analytics.ts frontend/src/lib/download.ts frontend/src/lib/download.test.ts frontend/src/components/QualityButton.tsx frontend/src/components/PreviewCard.tsx frontend/src/components/PhotoGrid.tsx && git commit -m "feat: reddit platform plumbing, site-relative mux download path"
```

---

### Task 8: Reddit page

**Files:**
- Create: `frontend/redditvideodownloader.html`, `frontend/src/reddit/main.tsx`, `frontend/src/reddit/RedditApp.tsx`
- Modify: `frontend/vite.config.ts`, `backend/app/main.py`, `frontend/public/sitemap.xml`
- Test: `frontend/src/reddit/RedditApp.test.tsx`, `backend/tests/test_reddit_page.py`

Mirror the TikTok page task exactly (read `tiktokvideodownloader.html`, `src/tiktok/*` as the source pattern):
- Title "Reddit Video Downloader - With Audio, Free | SaveVid AI"; canonical/OG `https://savevidai.israfill.dev/redditvideodownloader`; crawlable how-to (open the post, tap Share then Copy link, paste, download) + FAQ (audio: yes, merged automatically; galleries: yes, grid + save all; free: yes; safe: yes) in visible `<details>` AND JSON-LD, byte-identical answers.
- `RedditApp.tsx`: hero H1 "Reddit Video Downloader", subhead "Paste a Reddit post link, get the video with audio, in seconds.", PasteInput placeholder "Paste a Reddit post link" + ariaLabel "Reddit post link", `PlatformLinks active="reddit"`, visit beacon `{platform:"reddit"}` module-guarded, `PreviewCard platform="reddit"`, example chip (URL supplied by the controller after live verification; use a placeholder const with a `LIVE-VERIFY` comment until then).
- Vite entry `reddit`; FastAPI route `GET /redditvideodownloader` (mirror the tiktok route + its 2 tests); sitemap entry.
- Tests: brief render test (H1 + placeholder) + visit-beacon exactly-once test FIRST in file (mirror TikTokApp.test.tsx).

Commit:

```bash
cd .. && git add frontend/redditvideodownloader.html frontend/src/reddit frontend/vite.config.ts frontend/public/sitemap.xml backend/app/main.py backend/tests/test_reddit_page.py && git commit -m "feat: dedicated /redditvideodownloader page"
```

---

### Task 9: Reddit how-to visual + OG image

**Files:**
- Create: `frontend/src/reddit/RedditHowToVisual.tsx`, `frontend/public/og-reddit.png`
- Modify: `frontend/src/reddit/RedditApp.tsx` (placement), `scripts/make_og.py` (variant), `frontend/redditvideodownloader.html` (og meta)
- Test: `frontend/src/reddit/RedditHowToVisual.test.tsx`

Fork `TikTokHowToVisual.tsx` (the already-de-Twittered fork): panel 2 input text `reddit.com/r/aww/comm…`, panel 3 pills primary `720p` (circled; the HD chip appears via the >=720 rule only if the component renders dims - in the art, draw the pill with just "720p"), secondary `480p`, saved line `user_1abc23x_720p.mp4`, footnote "With audio. Straight from the source." aria-labels say "from Reddit". Same structure, tokens, markers, stacked variant. Render test mirrors the TikTok one (asserts `reddit.com/r/` text and `with audio` footnote). OG variant: title "Reddit Video Downloader", subtitle "With audio. Free." -> `og-reddit.png`, meta pointed at it.

Commit:

```bash
cd .. && git add frontend/src/reddit/RedditHowToVisual.tsx frontend/src/reddit/RedditHowToVisual.test.tsx frontend/src/reddit/RedditApp.tsx scripts/make_og.py frontend/public/og-reddit.png frontend/redditvideodownloader.html && git commit -m "feat: reddit how-to visual and og image"
```

---

### Task 10: Cache headers + font preload

**Files:**
- Modify: `backend/app/main.py` (middleware), `frontend/src/styles/index.css` (font-face), all three `frontend/*.html` (preload), `frontend/package.json` only if the fontsource import removal allows dropping the dep (do NOT add anything)
- Create: `frontend/public/fonts/onest-latin-wght.woff2` (copied from the fontsource package's latin variable file)
- Test: `backend/tests/test_cache_headers.py`, plus `npm run build` + grep checks

**Interfaces:**
- Produces: HTTP middleware in `create_app`: response paths starting `/assets/` or `/fonts/` get `Cache-Control: public, max-age=31536000, immutable`; text/html responses get `Cache-Control: no-cache`. Font: `@font-face { font-family: "Onest Variable"; src: url("/fonts/onest-latin-wght.woff2") format("woff2-variations"); font-weight: 100 900; font-display: swap; unicode-range: <latin range from the fontsource css>; }` replacing the fontsource import (copy latin-ext too if the current CSS includes it); `<link rel="preload" href="/fonts/onest-latin-wght.woff2" as="font" type="font/woff2" crossorigin>` in all three HTML heads.

- [ ] **Step 1: Failing backend test:** with STATIC_DIR set to a temp dir containing `assets/x.js` and `index.html`, assert `/assets/x.js` response carries the immutable header and `/` carries no-cache. Also assert `/api/health` is untouched (no cache header forced).
- [ ] **Step 2-3: Implement middleware + font move.** Verify visually that the font still renders (dev server, both pages) - the family name must match exactly so existing CSS keeps working.
- [ ] **Step 4:** backend suite + `npm run build`; grep `dist/redditvideodownloader.html dist/index.html dist/tiktokvideodownloader.html` for the preload tag; confirm `dist/fonts/onest-latin-wght.woff2` emitted; confirm the old fontsource asset no longer appears in `dist/assets`.
- [ ] **Step 5: Commit**

```bash
cd .. && git add backend/app/main.py backend/tests/test_cache_headers.py frontend/src/styles/index.css frontend/public/fonts frontend/index.html frontend/tiktokvideodownloader.html frontend/redditvideodownloader.html && git commit -m "feat: immutable asset caching, no-cache html, font preload"
```

(Include `frontend/package.json`/lock in the git add only if the fontsource dependency was actually removed.)

---

### Task 11: Dashboard BarList collapse

**Files:**
- Modify: `frontend/src/admin/Admin.tsx`
- Test: `frontend/src/admin/Admin.test.tsx`

**Interfaces:**
- Produces: `BarList` prop `maxRows?: number` (absent = current behavior, all rows). When `rows.length > maxRows`: render first `maxRows` rows + a button "Show all (N)"; expanded renders all + "Show less". Qualities and Countries panels pass `maxRows={8}`. Existing note/empty-state behavior unchanged.

- [ ] **Step 1: Failing test:** stats fixture with 12 quality rows -> only 8 render + "Show all (12)" present; click -> all 12 + "Show less"; a panel with 3 rows shows no toggle.
- [ ] **Step 2-4:** implement, `npm test -- --run && npm run build`.
- [ ] **Step 5: Commit**

```bash
cd .. && git add frontend/src/admin/Admin.tsx frontend/src/admin/Admin.test.tsx && git commit -m "feat: dashboard panels collapse long lists behind show-all"
```

---

### Task 12: Full verification (release gate)

- [ ] **Step 1:** Backend suite + ruff; frontend suite + build; `dist/` contains all four HTML entries + og-reddit.png + fonts/.
- [ ] **Step 2 (requires owner env vars):** live reddit resolve of a real video post, a gallery, and a share link through the dev server; confirm fixture-vs-reality per Task 2's note; pick and wire the example-chip URL; ffprobe the muxed download shows one video + one audio stream; gallery Save all works in the browser; not-configured path returns the polite 503 when vars are unset.
- [ ] **Step 3:** browser pass on `/redditvideodownloader` (both themes, mobile stacked visual, cross-links from all three pages), plus Twitter and TikTok regression (example chips) - the PlatformLinks row changed on every page.
- [ ] **Step 4:** cache-header check locally (curl -I an asset and `/`); after deploy, confirm `cf-cache-status: HIT` on a second asset fetch in prod.
- [ ] **Step 5:** commit any verification fixes; whole-branch review judges merge readiness. Do not push or deploy without the owner.
