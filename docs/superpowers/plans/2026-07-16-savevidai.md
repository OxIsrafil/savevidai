# SaveVid AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build SaveVid AI, an open source Twitter/X video downloader: paste a post URL, preview it, pick a quality, download straight from Twitter's CDN.

**Architecture:** One repo, one Docker container. FastAPI wraps yt-dlp in metadata-only mode and serves the built React SPA as static files. The browser downloads video bytes directly from video.twimg.com (blob fetch with progress), with a locked-down server proxy as fallback. No database, no accounts.

**Tech Stack:** Python 3.12, FastAPI, yt-dlp, slowapi, httpx, pytest, respx. TypeScript, Vite 6, React, Tailwind CSS v4, Motion (`motion` package), Vitest, Testing Library. Docker, Caddy, Render, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-07-16-savevidai-design.md` (read it before starting).

## Global Constraints

- Python >= 3.12. Backend deps: fastapi, uvicorn[standard], yt-dlp, slowapi, httpx, pydantic v2. Dev: pytest, respx, ruff.
- Node 22. Frontend: react, react-dom, motion, @fontsource-variable/geist, @fontsource-variable/geist-mono. TypeScript strict. Tailwind v4 via @tailwindcss/vite.
- No third-party requests at runtime from the page: fonts self-hosted, no analytics, no CDN scripts, no cookies.
- Error copy is verbatim from the spec table in "Error handling" (reproduced in Task 3 code).
- Download filename: `{handle}_{tweetid}_{label}.mp4`, multi-video tweets insert `_{index}` before the label.
- Rate limits: resolve 10/minute/IP, proxy 20/minute/IP. Proxy concurrency cap: 8 global. Cache: 512 entries, 1 hour TTL.
- Proxy accepts only URLs starting with `https://video.twimg.com/`.
- App listens on port 8000. Health check path: `/api/health`.
- Animation: transforms and opacity only; `prefers-reduced-motion` respected globally.
- All commits use conventional commit prefixes (feat:, test:, chore:, docs:, ci:).
- `OWNER` in URLs (GitHub, Ko-fi, ghcr.io) is a deliberate token: replace with the real GitHub username when the repo is published. It must not block any task.
- Run backend commands from `backend/` with its venv active (Task 1 creates it); frontend commands from `frontend/`.

---

### Task 1: Repo scaffold + backend skeleton with health endpoint

**Files:**
- Create: `.gitignore`, `LICENSE`, `backend/pyproject.toml`, `backend/app/__init__.py`, `backend/app/errors.py` (stub, filled in Task 3), `backend/app/main.py`, `backend/tests/__init__.py`, `backend/tests/test_health.py`

**Interfaces:**
- Produces: `create_app() -> FastAPI` in `app.main`, module-level `app` instance; `AppError` exception class in `app.errors` with `.code`, `.message`, `.status`.

- [ ] **Step 1: Write .gitignore and LICENSE**

`.gitignore`:

```gitignore
__pycache__/
*.egg-info/
.venv/
.pytest_cache/
.ruff_cache/
node_modules/
dist/
coverage/
.DS_Store
```

`LICENSE`: the standard MIT license text, first line `MIT License`, copyright line:

```text
Copyright (c) 2026 SaveVid AI contributors
```

- [ ] **Step 2: Write backend/pyproject.toml**

```toml
[project]
name = "savevidai-backend"
version = "0.1.0"
description = "SaveVid AI API: resolves Twitter/X post URLs to downloadable video links"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.30",
    "yt-dlp>=2025.1.1",
    "slowapi>=0.1.9",
    "httpx>=0.27",
    "pydantic>=2.7",
]

[project.optional-dependencies]
dev = ["pytest>=8", "respx>=0.21", "ruff>=0.5"]

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
include = ["app*"]

[tool.ruff]
line-length = 100

[tool.pytest.ini_options]
testpaths = ["tests"]
```

- [ ] **Step 3: Write the minimal errors stub** (`backend/app/errors.py`)

```python
class AppError(Exception):
    """Domain error rendered as {"error": code, "message": message} with the given HTTP status."""

    def __init__(self, code: str, message: str, status: int):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
```

- [ ] **Step 4: Write the failing test** (`backend/tests/test_health.py`)

```python
from fastapi.testclient import TestClient

from app.main import create_app


def test_health():
    client = TestClient(create_app())
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"ok": True}


def test_app_error_shape():
    from app.errors import AppError

    app = create_app()

    @app.get("/api/boom")
    def boom():
        raise AppError("upstream_error", "nope", 502)

    client = TestClient(app, raise_server_exceptions=False)
    res = client.get("/api/boom")
    assert res.status_code == 502
    assert res.json() == {"error": "upstream_error", "message": "nope"}
```

- [ ] **Step 5: Set up venv, install, run test to verify it fails**

```bash
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -e '.[dev]'
python -m pytest tests/test_health.py -v
```

Expected: FAIL / error with `ModuleNotFoundError: No module named 'app.main'`. (Create `backend/app/__init__.py` and `backend/tests/__init__.py` as empty files first.)

- [ ] **Step 6: Write minimal app.main** (`backend/app/main.py`)

```python
import os

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .errors import AppError


def create_app() -> FastAPI:
    app = FastAPI(title="SaveVid AI", docs_url=None, redoc_url=None)

    @app.exception_handler(AppError)
    async def on_app_error(request: Request, exc: AppError):
        return JSONResponse(status_code=exc.status, content={"error": exc.code, "message": exc.message})

    @app.get("/api/health")
    def health():
        return {"ok": True}

    # Serves the built frontend in the Docker image; absent in dev, where Vite serves it.
    static_dir = os.environ.get("STATIC_DIR", "")
    if static_dir and os.path.isdir(static_dir):
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
    return app


app = create_app()
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `python -m pytest tests/test_health.py -v`
Expected: 2 passed

- [ ] **Step 8: Ruff and commit**

```bash
ruff check .
cd .. && git add -A && git commit -m "feat: backend skeleton with health endpoint and AppError handler"
```

---

### Task 2: Tweet URL parsing

**Files:**
- Create: `backend/app/urls.py`, `backend/tests/test_urls.py`

**Interfaces:**
- Produces: `parse_tweet_url(raw: str) -> str` (returns tweet ID, raises `InvalidTweetURL(ValueError)`), `canonical_url(tweet_id: str) -> str` in `app.urls`.

- [ ] **Step 1: Write the failing tests** (`backend/tests/test_urls.py`)

```python
import pytest

from app.urls import InvalidTweetURL, canonical_url, parse_tweet_url

VALID = [
    ("https://twitter.com/jack/status/20", "20"),
    ("https://x.com/jack/status/20", "20"),
    ("http://www.x.com/jack/status/20", "20"),
    ("https://mobile.twitter.com/jack/status/20", "20"),
    ("https://x.com/jack/status/1234567890123456789?s=20&t=abc", "1234567890123456789"),
    ("https://x.com/jack/status/1234567890123456789/video/1", "1234567890123456789"),
    ("https://twitter.com/i/web/status/1234567890123456789", "1234567890123456789"),
    ("x.com/jack/status/1234567890123456789", "1234567890123456789"),
    ("https://fxtwitter.com/jack/status/1234567890123456789", "1234567890123456789"),
    ("https://vxtwitter.com/jack/status/1234567890123456789", "1234567890123456789"),
    ("https://fixupx.com/jack/status/1234567890123456789", "1234567890123456789"),
    ("https://twittpr.com/jack/status/1234567890123456789", "1234567890123456789"),
    ("  https://x.com/jack/status/20  ", "20"),
]

INVALID = [
    "",
    "not a url",
    "https://youtube.com/watch?v=abc",
    "https://x.com/jack",
    "https://x.com/jack/status/",
    "https://x.com/jack/status/notdigits",
    "https://evil.com/x.com/jack/status/20",
    "ftp://x.com/jack/status/20",
]


@pytest.mark.parametrize("url,expected", VALID)
def test_valid_urls(url, expected):
    assert parse_tweet_url(url) == expected


@pytest.mark.parametrize("url", INVALID)
def test_invalid_urls(url):
    with pytest.raises(InvalidTweetURL):
        parse_tweet_url(url)


def test_canonical_url():
    assert canonical_url("20") == "https://twitter.com/i/web/status/20"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_urls.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.urls'`

- [ ] **Step 3: Write the implementation** (`backend/app/urls.py`)

```python
import re
from urllib.parse import urlparse


class InvalidTweetURL(ValueError):
    pass


_HOSTS = {
    "twitter.com", "www.twitter.com", "mobile.twitter.com", "m.twitter.com",
    "x.com", "www.x.com", "mobile.x.com",
    "fxtwitter.com", "www.fxtwitter.com",
    "vxtwitter.com", "www.vxtwitter.com",
    "fixupx.com", "www.fixupx.com",
    "twittpr.com", "www.twittpr.com",
}

# /<handle>/status/<id> or /i/web/status/<id>, tolerating trailing segments like /video/1
_PATH = re.compile(r"^/(?:[A-Za-z0-9_]{1,15}|i/web)/status(?:es)?/(\d{1,25})(?:/|$)")


def parse_tweet_url(raw: str) -> str:
    """Return the tweet ID for any supported tweet URL shape, else raise InvalidTweetURL."""
    raw = raw.strip()
    if not raw:
        raise InvalidTweetURL("empty input")
    if "://" not in raw:
        raw = "https://" + raw
    parsed = urlparse(raw)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise InvalidTweetURL(raw)
    if parsed.hostname.lower() not in _HOSTS:
        raise InvalidTweetURL(raw)
    match = _PATH.match(parsed.path)
    if not match:
        raise InvalidTweetURL(raw)
    return match.group(1)


def canonical_url(tweet_id: str) -> str:
    return f"https://twitter.com/i/web/status/{tweet_id}"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_urls.py -v`
Expected: all pass (13 valid + 8 invalid + 1 canonical)

- [ ] **Step 5: Commit**

```bash
ruff check . && cd .. && git add -A && git commit -m "feat: tweet URL parsing incl. mirror domains" && cd backend
```

---

### Task 3: Error catalog and yt-dlp error mapping

**Files:**
- Modify: `backend/app/errors.py`
- Create: `backend/tests/test_errors.py`

**Interfaces:**
- Produces in `app.errors`: error spec tuples `INVALID_URL`, `NOT_FOUND`, `NO_VIDEO`, `PRIVATE`, `RATE_LIMITED`, `UPSTREAM` (each `(code, message, status)`); `app_error(spec) -> AppError`; `map_extractor_error(exc: Exception) -> AppError`.

- [ ] **Step 1: Write the failing tests** (`backend/tests/test_errors.py`)

```python
import pytest

from app.errors import (
    NO_VIDEO,
    NOT_FOUND,
    PRIVATE,
    RATE_LIMITED,
    UPSTREAM,
    app_error,
    map_extractor_error,
)

CASES = [
    ("ERROR: No video could be found in this tweet", NO_VIDEO),
    ("ERROR: No status found with that ID.", NOT_FOUND),
    ("requested tweet does not exist", NOT_FOUND),
    ("NSFW tweet requires authentication", PRIVATE),
    ("This tweet is from a protected account", PRIVATE),
    ("age-restricted content", PRIVATE),
    ("login required to view", PRIVATE),
    ("HTTP Error 429: rate-limit exceeded", RATE_LIMITED),
    ("something totally unexpected", UPSTREAM),
]


@pytest.mark.parametrize("msg,spec", CASES)
def test_mapping(msg, spec):
    err = map_extractor_error(Exception(msg))
    assert err.code == spec[0]
    assert err.status == spec[2]


def test_app_error_builder():
    err = app_error(NO_VIDEO)
    assert err.code == "no_video"
    assert err.status == 422
    assert "quoted post" in err.message
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_errors.py -v`
Expected: FAIL with `ImportError` (names not defined)

- [ ] **Step 3: Extend errors.py** (append below the `AppError` class; user-facing copy is verbatim from the spec)

```python
INVALID_URL = ("invalid_url", "That doesn't look like a Twitter/X post link.", 422)
NOT_FOUND = ("not_found", "This post doesn't exist or was deleted.", 404)
NO_VIDEO = (
    "no_video",
    "This post has no video. If the video is in a quoted post, paste that post's link.",
    422,
)
PRIVATE = (
    "private_or_restricted",
    "This post is private or age-restricted. SaveVid AI only works with public posts.",
    403,
)
RATE_LIMITED = ("rate_limited", "Twitter is rate-limiting right now. Try again in a minute.", 503)
UPSTREAM = ("upstream_error", "Extraction failed. If this keeps happening, report it on GitHub.", 502)


def app_error(spec: tuple[str, str, int]) -> AppError:
    return AppError(*spec)


# Substring -> error spec, checked in order against the lowercased yt-dlp message.
# Extend this list when Twitter/yt-dlp change their error wording (see CONTRIBUTING).
_PATTERNS: list[tuple[str, tuple[str, str, int]]] = [
    ("no video could be found", NO_VIDEO),
    ("no status found", NOT_FOUND),
    ("does not exist", NOT_FOUND),
    ("tweet is unavailable", NOT_FOUND),
    ("nsfw tweet", PRIVATE),
    ("protected", PRIVATE),
    ("age-restricted", PRIVATE),
    ("login required", PRIVATE),
    ("rate-limit", RATE_LIMITED),
    ("rate limit", RATE_LIMITED),
    ("429", RATE_LIMITED),
]


def map_extractor_error(exc: Exception) -> AppError:
    text = str(exc).lower()
    for needle, spec in _PATTERNS:
        if needle in text:
            return app_error(spec)
    return app_error(UPSTREAM)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_errors.py -v`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
ruff check . && cd .. && git add -A && git commit -m "feat: error catalog with yt-dlp message mapping" && cd backend
```

---

### Task 4: TTL cache

**Files:**
- Create: `backend/app/cache.py`, `backend/tests/test_cache.py`

**Interfaces:**
- Produces: `TTLCache(maxsize: int = 512, ttl: float = 3600.0)` with `.get(key) -> Any | None` and `.set(key, value)` in `app.cache`. Thread-safe.

- [ ] **Step 1: Write the failing tests** (`backend/tests/test_cache.py`)

```python
import time

from app.cache import TTLCache


def test_get_set_roundtrip():
    cache = TTLCache(maxsize=4, ttl=60)
    cache.set("a", {"x": 1})
    assert cache.get("a") == {"x": 1}
    assert cache.get("missing") is None


def test_expiry():
    cache = TTLCache(maxsize=4, ttl=0.05)
    cache.set("a", 1)
    assert cache.get("a") == 1
    time.sleep(0.06)
    assert cache.get("a") is None


def test_lru_eviction():
    cache = TTLCache(maxsize=2, ttl=60)
    cache.set("a", 1)
    cache.set("b", 2)
    cache.get("a")  # refresh "a"
    cache.set("c", 3)  # evicts "b", the least recently used
    assert cache.get("a") == 1
    assert cache.get("b") is None
    assert cache.get("c") == 3
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_cache.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.cache'`

- [ ] **Step 3: Write the implementation** (`backend/app/cache.py`)

```python
import threading
import time
from collections import OrderedDict
from typing import Any


class TTLCache:
    """Small thread-safe LRU cache with per-entry TTL. Endpoints run in a threadpool, hence the lock."""

    def __init__(self, maxsize: int = 512, ttl: float = 3600.0):
        self._data: OrderedDict[str, tuple[float, Any]] = OrderedDict()
        self._lock = threading.Lock()
        self.maxsize = maxsize
        self.ttl = ttl

    def get(self, key: str) -> Any | None:
        now = time.monotonic()
        with self._lock:
            item = self._data.get(key)
            if item is None:
                return None
            expires, value = item
            if expires < now:
                del self._data[key]
                return None
            self._data.move_to_end(key)
            return value

    def set(self, key: str, value: Any) -> None:
        with self._lock:
            self._data[key] = (time.monotonic() + self.ttl, value)
            self._data.move_to_end(key)
            while len(self._data) > self.maxsize:
                self._data.popitem(last=False)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_cache.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
ruff check . && cd .. && git add -A && git commit -m "feat: thread-safe TTL LRU cache" && cd backend
```

---

### Task 5: Response schemas and yt-dlp info mapping

**Files:**
- Create: `backend/app/schemas.py`, `backend/app/extractor.py`, `backend/tests/test_extractor.py`

**Interfaces:**
- Consumes: `canonical_url` from `app.urls`; `map_extractor_error`, `app_error`, `NO_VIDEO` from `app.errors`.
- Produces in `app.schemas`: pydantic models `Variant(label, width, height, url, size_bytes)`, `MediaItem(index, kind, thumbnail, duration_seconds, variants)`, `ResolveRequest(url)`, `ResolveResponse(id, author, handle, avatar_url, text, items)`.
- Produces in `app.extractor`: `extract(tweet_id: str) -> ResolveResponse` (network, via yt-dlp) and `map_info(tweet_id: str, info: dict) -> ResolveResponse` (pure, tested).

- [ ] **Step 1: Write schemas** (`backend/app/schemas.py`)

```python
from pydantic import BaseModel


class Variant(BaseModel):
    label: str
    width: int | None = None
    height: int | None = None
    url: str
    size_bytes: int | None = None


class MediaItem(BaseModel):
    index: int
    kind: str  # "video" | "gif"
    thumbnail: str | None = None
    duration_seconds: float | None = None
    variants: list[Variant]


class ResolveRequest(BaseModel):
    url: str


class ResolveResponse(BaseModel):
    id: str
    author: str
    handle: str
    avatar_url: str | None = None  # yt-dlp does not expose avatars today; kept for the future
    text: str = ""
    items: list[MediaItem]
```

- [ ] **Step 2: Write the failing tests** (`backend/tests/test_extractor.py`)

```python
import pytest

from app.errors import AppError
from app.extractor import map_info

SINGLE = {
    "id": "111",
    "uploader": "Ada Lovelace",
    "uploader_id": "ada",
    "description": "engine demo",
    "thumbnail": "https://pbs.twimg.com/thumb.jpg",
    "duration": 12.5,
    "formats": [
        {"url": "https://video.twimg.com/ext_tw_video/1/vid/480x270/a.mp4",
         "vcodec": "h264", "width": 480, "height": 270, "protocol": "https"},
        {"url": "https://video.twimg.com/ext_tw_video/1/pl/x.m3u8",
         "vcodec": "h264", "height": 720, "protocol": "m3u8_native"},
        {"url": "https://video.twimg.com/ext_tw_video/1/vid/1920x1080/b.mp4",
         "vcodec": "h264", "width": 1920, "height": 1080, "protocol": "https"},
        {"url": "https://video.twimg.com/audio/only.mp4", "vcodec": "none", "acodec": "mp4a"},
    ],
}

MULTI = {
    "_type": "playlist",
    "id": "222",
    "uploader": "Ada Lovelace",
    "uploader_id": "ada",
    "description": "two clips",
    "entries": [
        {"thumbnail": "https://pbs.twimg.com/t1.jpg", "duration": 5,
         "formats": [{"url": "https://video.twimg.com/ext_tw_video/2/vid/640x360/a.mp4",
                      "vcodec": "h264", "width": 640, "height": 360, "protocol": "https"}]},
        {"thumbnail": "https://pbs.twimg.com/t2.jpg", "duration": 8,
         "formats": [{"url": "https://video.twimg.com/ext_tw_video/3/vid/1280x720/b.mp4",
                      "vcodec": "h264", "width": 1280, "height": 720, "protocol": "https"}]},
    ],
}

GIF = {
    "id": "333",
    "uploader": "Ada Lovelace",
    "uploader_id": "ada",
    "formats": [{"url": "https://video.twimg.com/tweet_video/AAA.mp4",
                 "vcodec": "h264", "width": 480, "height": 480, "protocol": "https"}],
}

NO_VIDEO_INFO = {"id": "444", "uploader": "Ada", "uploader_id": "ada", "formats": []}


def test_single_video_mapping():
    res = map_info("111", SINGLE)
    assert res.id == "111"
    assert res.author == "Ada Lovelace"
    assert res.handle == "ada"
    assert res.text == "engine demo"
    assert len(res.items) == 1
    item = res.items[0]
    assert item.kind == "video"
    assert item.thumbnail == "https://pbs.twimg.com/thumb.jpg"
    assert item.duration_seconds == 12.5
    # HLS and audio-only formats are excluded; sorted best-first
    assert [v.label for v in item.variants] == ["1080p", "270p"]
    assert item.variants[0].url.endswith("/1920x1080/b.mp4")


def test_multi_video_mapping():
    res = map_info("222", MULTI)
    assert [i.index for i in res.items] == [1, 2]
    assert res.items[1].variants[0].label == "720p"


def test_gif_detection():
    res = map_info("333", GIF)
    assert res.items[0].kind == "gif"


def test_no_video_raises():
    with pytest.raises(AppError) as exc:
        map_info("444", NO_VIDEO_INFO)
    assert exc.value.code == "no_video"
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `python -m pytest tests/test_extractor.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.extractor'`

- [ ] **Step 4: Write the extractor** (`backend/app/extractor.py`)

```python
import yt_dlp

from .errors import NO_VIDEO, app_error, map_extractor_error
from .schemas import MediaItem, ResolveResponse, Variant
from .urls import canonical_url

_YDL_OPTS = {"quiet": True, "no_warnings": True, "skip_download": True}


def extract(tweet_id: str) -> ResolveResponse:
    """Resolve a tweet ID to its video variants via yt-dlp (metadata only, no download)."""
    try:
        with yt_dlp.YoutubeDL(_YDL_OPTS) as ydl:
            info = ydl.extract_info(canonical_url(tweet_id), download=False)
    except yt_dlp.utils.DownloadError as exc:
        raise map_extractor_error(exc) from exc
    return map_info(tweet_id, info)


def map_info(tweet_id: str, info: dict) -> ResolveResponse:
    entries = info.get("entries") if info.get("_type") == "playlist" else [info]
    items: list[MediaItem] = []
    for i, entry in enumerate([e for e in (entries or []) if e], start=1):
        item = _map_entry(entry, i)
        if item is not None:
            items.append(item)
    if not items:
        raise app_error(NO_VIDEO)
    handle = info.get("uploader_id") or "unknown"
    return ResolveResponse(
        id=tweet_id,
        author=info.get("uploader") or handle,
        handle=handle,
        text=(info.get("description") or "").strip(),
        items=items,
    )


def _map_entry(entry: dict, index: int) -> MediaItem | None:
    variants: list[Variant] = []
    for f in entry.get("formats") or []:
        url = f.get("url") or ""
        if f.get("vcodec") in (None, "none"):
            continue  # audio-only
        if not url.startswith("https://video.twimg.com/"):
            continue
        if f.get("protocol") not in (None, "https", "http"):
            continue  # skip HLS playlists; browsers download plain mp4s
        height = f.get("height")
        variants.append(
            Variant(
                label=f"{height}p" if height else "video",
                width=f.get("width"),
                height=height,
                url=url,
            )
        )
    if not variants:
        return None
    variants.sort(key=lambda v: (v.height or 0, v.width or 0), reverse=True)
    kind = "gif" if "/tweet_video/" in variants[0].url else "video"
    return MediaItem(
        index=index,
        kind=kind,
        thumbnail=entry.get("thumbnail"),
        duration_seconds=entry.get("duration"),
        variants=variants,
    )
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest tests/test_extractor.py -v`
Expected: 4 passed

- [ ] **Step 6: Commit**

```bash
ruff check . && cd .. && git add -A && git commit -m "feat: yt-dlp extraction mapped to API schemas (multi-video, gif, hls filtering)" && cd backend
```

---

### Task 6: Best-effort file sizes via HEAD

**Files:**
- Create: `backend/app/sizes.py`, `backend/tests/test_sizes.py`

**Interfaces:**
- Consumes: `ResolveResponse` from `app.schemas`.
- Produces: `fill_sizes(resp: ResolveResponse, timeout: float = 3.0) -> None` in `app.sizes` (mutates `variant.size_bytes` in place; never raises).

- [ ] **Step 1: Write the failing tests** (`backend/tests/test_sizes.py`)

```python
import httpx
import respx

from app.schemas import MediaItem, ResolveResponse, Variant
from app.sizes import fill_sizes


def _resp() -> ResolveResponse:
    return ResolveResponse(
        id="1", author="A", handle="a",
        items=[MediaItem(index=1, kind="video", variants=[
            Variant(label="1080p", url="https://video.twimg.com/v/1080.mp4"),
            Variant(label="360p", url="https://video.twimg.com/v/360.mp4"),
        ])],
    )


@respx.mock
def test_fills_sizes():
    respx.head("https://video.twimg.com/v/1080.mp4").mock(
        return_value=httpx.Response(200, headers={"content-length": "35651584"}))
    respx.head("https://video.twimg.com/v/360.mp4").mock(
        return_value=httpx.Response(200, headers={"content-length": "1048576"}))
    resp = _resp()
    fill_sizes(resp)
    assert resp.items[0].variants[0].size_bytes == 35651584
    assert resp.items[0].variants[1].size_bytes == 1048576


@respx.mock
def test_failure_leaves_none():
    respx.head("https://video.twimg.com/v/1080.mp4").mock(side_effect=httpx.ConnectError("boom"))
    respx.head("https://video.twimg.com/v/360.mp4").mock(return_value=httpx.Response(200))
    resp = _resp()
    fill_sizes(resp)
    assert resp.items[0].variants[0].size_bytes is None
    assert resp.items[0].variants[1].size_bytes is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_sizes.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.sizes'`

- [ ] **Step 3: Write the implementation** (`backend/app/sizes.py`)

```python
import httpx

from .schemas import ResolveResponse


def fill_sizes(resp: ResolveResponse, timeout: float = 3.0) -> None:
    """Best-effort Content-Length for each variant. Failures leave size_bytes as None."""
    with httpx.Client(timeout=timeout, follow_redirects=True) as client:
        for item in resp.items:
            for variant in item.variants:
                try:
                    r = client.head(variant.url)
                    length = r.headers.get("content-length")
                    variant.size_bytes = int(length) if length else None
                except (httpx.HTTPError, ValueError):
                    variant.size_bytes = None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_sizes.py -v`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
ruff check . && cd .. && git add -A && git commit -m "feat: best-effort variant sizes via HEAD" && cd backend
```

---

### Task 7: /api/resolve route with cache and rate limit

**Files:**
- Create: `backend/app/limits.py`, `backend/app/resolve.py`, `backend/tests/conftest.py`, `backend/tests/test_resolve_api.py`
- Modify: `backend/app/main.py`

**Interfaces:**
- Consumes: `parse_tweet_url`/`InvalidTweetURL`, `extract`, `fill_sizes`, `TTLCache`, error catalog.
- Produces: `limiter` (slowapi `Limiter`) in `app.limits`; `router` and module-level `cache` in `app.resolve`; `POST /api/resolve` endpoint. Later tasks monkeypatch `app.resolve.extract` and `app.resolve.fill_sizes` in tests.

- [ ] **Step 1: Write limits.py** (`backend/app/limits.py`)

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
```

- [ ] **Step 2: Write conftest that disables rate limiting by default** (`backend/tests/conftest.py`)

```python
import pytest

from app.limits import limiter


@pytest.fixture(autouse=True)
def _no_rate_limits():
    limiter.enabled = False
    yield
    limiter.enabled = True
```

- [ ] **Step 3: Write the failing tests** (`backend/tests/test_resolve_api.py`)

```python
import pytest
from fastapi.testclient import TestClient

import app.resolve as resolve_module
from app.cache import TTLCache
from app.errors import PRIVATE, app_error
from app.limits import limiter
from app.main import create_app
from app.schemas import MediaItem, ResolveResponse, Variant

FIXTURE = ResolveResponse(
    id="20", author="Jack", handle="jack", text="just setting up",
    items=[MediaItem(index=1, kind="video", variants=[
        Variant(label="720p", url="https://video.twimg.com/v/720.mp4", size_bytes=1000)])],
)


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setattr(resolve_module, "cache", TTLCache(maxsize=8, ttl=60))
    monkeypatch.setattr(resolve_module, "fill_sizes", lambda resp: None)
    return TestClient(create_app(), raise_server_exceptions=False)


def test_resolve_ok(client, monkeypatch):
    monkeypatch.setattr(resolve_module, "extract", lambda tweet_id: FIXTURE)
    res = client.post("/api/resolve", json={"url": "https://x.com/jack/status/20"})
    assert res.status_code == 200
    body = res.json()
    assert body["id"] == "20"
    assert body["items"][0]["variants"][0]["label"] == "720p"


def test_resolve_caches(client, monkeypatch):
    calls = []
    monkeypatch.setattr(resolve_module, "extract", lambda tweet_id: calls.append(1) or FIXTURE)
    client.post("/api/resolve", json={"url": "https://x.com/jack/status/20"})
    client.post("/api/resolve", json={"url": "https://twitter.com/jack/status/20?s=20"})
    assert len(calls) == 1  # second hit served from cache despite different URL shape


def test_invalid_url(client):
    res = client.post("/api/resolve", json={"url": "https://youtube.com/watch?v=1"})
    assert res.status_code == 422
    assert res.json()["error"] == "invalid_url"


def test_extractor_error_passthrough(client, monkeypatch):
    def boom(tweet_id):
        raise app_error(PRIVATE)

    monkeypatch.setattr(resolve_module, "extract", boom)
    res = client.post("/api/resolve", json={"url": "https://x.com/jack/status/20"})
    assert res.status_code == 403
    assert res.json()["error"] == "private_or_restricted"


def test_rate_limit(client, monkeypatch):
    monkeypatch.setattr(resolve_module, "extract", lambda tweet_id: FIXTURE)
    limiter.enabled = True
    limiter.reset()
    for _ in range(10):
        assert client.post(
            "/api/resolve", json={"url": "https://x.com/jack/status/20"}
        ).status_code == 200
    res = client.post("/api/resolve", json={"url": "https://x.com/jack/status/20"})
    assert res.status_code == 429
    assert res.json()["error"] == "rate_limited"
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `python -m pytest tests/test_resolve_api.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.resolve'`

- [ ] **Step 5: Write the route** (`backend/app/resolve.py`)

```python
from fastapi import APIRouter, Request

from .cache import TTLCache
from .errors import INVALID_URL, app_error
from .extractor import extract
from .limits import limiter
from .schemas import ResolveRequest, ResolveResponse
from .sizes import fill_sizes
from .urls import InvalidTweetURL, parse_tweet_url

router = APIRouter()
cache = TTLCache(maxsize=512, ttl=3600.0)


@router.post("/api/resolve", response_model=ResolveResponse)
@limiter.limit("10/minute")
def resolve(request: Request, payload: ResolveRequest) -> ResolveResponse:
    try:
        tweet_id = parse_tweet_url(payload.url)
    except InvalidTweetURL as exc:
        raise app_error(INVALID_URL) from exc
    cached = cache.get(tweet_id)
    if cached is not None:
        return cached
    result = extract(tweet_id)
    fill_sizes(result)
    cache.set(tweet_id, result)
    return result
```

- [ ] **Step 6: Wire router and rate-limit handler into main.py**

In `backend/app/main.py`, add imports and registration so the file becomes:

```python
import os

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded

from . import resolve
from .errors import AppError
from .limits import limiter


def create_app() -> FastAPI:
    app = FastAPI(title="SaveVid AI", docs_url=None, redoc_url=None)
    app.state.limiter = limiter

    @app.exception_handler(AppError)
    async def on_app_error(request: Request, exc: AppError):
        return JSONResponse(status_code=exc.status, content={"error": exc.code, "message": exc.message})

    @app.exception_handler(RateLimitExceeded)
    async def on_rate_limit(request: Request, exc: RateLimitExceeded):
        return JSONResponse(
            status_code=429,
            content={"error": "rate_limited", "message": "Too many requests. Give it a minute."},
        )

    @app.get("/api/health")
    def health():
        return {"ok": True}

    app.include_router(resolve.router)

    # Serves the built frontend in the Docker image; absent in dev, where Vite serves it.
    static_dir = os.environ.get("STATIC_DIR", "")
    if static_dir and os.path.isdir(static_dir):
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
    return app


app = create_app()
```

- [ ] **Step 7: Run the full backend suite**

Run: `python -m pytest -q`
Expected: all tests pass (health, urls, errors, cache, extractor, sizes, resolve API)

- [ ] **Step 8: Commit**

```bash
ruff check . && cd .. && git add -A && git commit -m "feat: /api/resolve with cache and per-IP rate limit" && cd backend
```

---

### Task 8: /api/proxy streaming fallback

**Files:**
- Create: `backend/app/proxy.py`, `backend/tests/test_proxy_api.py`
- Modify: `backend/app/main.py` (one line: `app.include_router(proxy.router)` after the resolve router, plus `from . import proxy` in the import block)

**Interfaces:**
- Consumes: `limiter`, `AppError`, `app_error`, `UPSTREAM`.
- Produces: `GET /api/proxy?url=&filename=` streaming endpoint; `router` in `app.proxy`.

- [ ] **Step 1: Write the failing tests** (`backend/tests/test_proxy_api.py`)

```python
import httpx
import respx
from fastapi.testclient import TestClient

from app.main import create_app


def client() -> TestClient:
    return TestClient(create_app(), raise_server_exceptions=False)


def test_rejects_non_twimg():
    res = client().get("/api/proxy", params={"url": "https://evil.com/v.mp4"})
    assert res.status_code == 403
    assert res.json()["error"] == "forbidden_url"


def test_rejects_lookalike_prefix():
    res = client().get(
        "/api/proxy", params={"url": "https://video.twimg.com.evil.com/v.mp4"})
    assert res.status_code == 403


@respx.mock
def test_streams_and_names_file():
    respx.get("https://video.twimg.com/ext/v.mp4").mock(
        return_value=httpx.Response(200, content=b"vidbytes", headers={"content-length": "8"}))
    res = client().get(
        "/api/proxy",
        params={"url": "https://video.twimg.com/ext/v.mp4", "filename": 'ada 1080p".mp4'},
    )
    assert res.status_code == 200
    assert res.content == b"vidbytes"
    assert res.headers["content-type"] == "video/mp4"
    assert 'filename="ada_1080p_.mp4"' in res.headers["content-disposition"]


@respx.mock
def test_upstream_error():
    respx.get("https://video.twimg.com/ext/missing.mp4").mock(
        return_value=httpx.Response(404))
    res = client().get("/api/proxy", params={"url": "https://video.twimg.com/ext/missing.mp4"})
    assert res.status_code == 502
    assert res.json()["error"] == "upstream_error"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_proxy_api.py -v`
Expected: 404s / failures (route does not exist)

- [ ] **Step 3: Write the proxy** (`backend/app/proxy.py`)

```python
import asyncio
import re
from urllib.parse import unquote

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from .errors import UPSTREAM, AppError, app_error
from .limits import limiter

router = APIRouter()

_ALLOWED_PREFIX = "https://video.twimg.com/"
_SAFE = re.compile(r"[^A-Za-z0-9._-]")
_SEM = asyncio.Semaphore(8)  # fallback path only; protects the small VPS from saturation


@router.get("/api/proxy")
@limiter.limit("20/minute")
async def proxy(request: Request, url: str, filename: str = "video.mp4"):
    if not url.startswith(_ALLOWED_PREFIX):
        raise AppError("forbidden_url", "Only video.twimg.com URLs can be proxied.", 403)
    name = _SAFE.sub("_", unquote(filename))[:120] or "video.mp4"

    await _SEM.acquire()
    client = httpx.AsyncClient(timeout=httpx.Timeout(30.0, read=60.0))
    try:
        # httpx.InvalidURL subclasses Exception, not HTTPError; catch it too or a
        # control-char URL that passes the prefix check leaks the semaphore permit.
        upstream = await client.send(client.build_request("GET", url), stream=True)
    except (httpx.HTTPError, httpx.InvalidURL):
        await client.aclose()
        _SEM.release()
        raise app_error(UPSTREAM) from None
    if upstream.status_code != 200:
        await upstream.aclose()
        await client.aclose()
        _SEM.release()
        raise app_error(UPSTREAM)

    async def stream():
        try:
            async for chunk in upstream.aiter_bytes(1 << 16):
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()
            _SEM.release()

    headers = {"Content-Disposition": f'attachment; filename="{name}"'}
    length = upstream.headers.get("content-length")
    if length:
        headers["Content-Length"] = length
    return StreamingResponse(stream(), media_type="video/mp4", headers=headers)
```

- [ ] **Step 4: Register the router in main.py**

Add `proxy` to the relative import (`from . import proxy, resolve`) and add `app.include_router(proxy.router)` directly under `app.include_router(resolve.router)`.

- [ ] **Step 5: Run the full backend suite**

Run: `python -m pytest -q`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
ruff check . && cd .. && git add -A && git commit -m "feat: locked-down streaming proxy fallback" && cd backend
```

---

### Task 9: Frontend scaffold (Vite + React + Tailwind v4 + fonts + Vitest)

**Files:**
- Create: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/vite.config.ts`, `frontend/index.html` (minimal for now; SEO content lands in Task 10), `frontend/src/main.tsx`, `frontend/src/App.tsx` (shell), `frontend/src/styles/index.css`, `frontend/src/test/setup.ts`, `frontend/src/test/smoke.test.tsx`

**Interfaces:**
- Produces: working `npm run dev` / `build` / `test` / `lint`; CSS design tokens and utility classes (`shimmer`, `badge`, `input-frame`, `quality-btn`, `quality-fill`, `quality-fill-sweep`, `check-draw`, `animate-shake`, `error-glow`, `link-sweep`) used by later tasks; `App` default export.

- [ ] **Step 1: Write package.json** (`frontend/package.json`)

```json
{
  "name": "savevidai-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@fontsource-variable/geist": "^5.1.0",
    "@fontsource-variable/geist-mono": "^5.1.0",
    "motion": "^11.15.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^25.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Write tsconfig.json** (`frontend/tsconfig.json`)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "types": ["vite/client", "vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 3: Write vite.config.ts** (`frontend/vite.config.ts`)

```ts
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { "/api": "http://localhost:8000" } },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    css: false,
  },
});
```

- [ ] **Step 4: Write minimal index.html** (`frontend/index.html`; full SEO head arrives in Task 10)

```html
<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SaveVid AI</title>
    <script>
      try { if (localStorage.theme === "light") document.documentElement.classList.remove("dark"); } catch (e) {}
    </script>
  </head>
  <body class="bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 font-sans antialiased">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Write styles with design tokens** (`frontend/src/styles/index.css`)

```css
@import "tailwindcss";
@import "@fontsource-variable/geist";
@import "@fontsource-variable/geist-mono";

@custom-variant dark (&:where(.dark, .dark *));

@theme {
  --font-sans: "Geist Variable", system-ui, sans-serif;
  --font-mono: "Geist Mono Variable", ui-monospace, monospace;
}

/* Skeleton shimmer */
.shimmer {
  background: linear-gradient(100deg, transparent 30%, rgb(255 255 255 / 0.08) 50%, transparent 70%),
    rgb(127 127 127 / 0.15);
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}
@keyframes shimmer {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}

/* Paste input frame with idle ambient border and focus glow.
   The idle shimmer is the only animation allowed to loop forever (see spec). */
.input-frame {
  display: flex;
  gap: 0.5rem;
  border-radius: 1rem;
  padding: 0.5rem;
  border: 1px solid rgb(127 127 127 / 0.25);
  background: rgb(127 127 127 / 0.06);
  transition: border-color 0.2s ease, box-shadow 0.3s ease;
  animation: idle-border 4s ease-in-out infinite;
}
@keyframes idle-border {
  0%, 100% { border-color: rgb(127 127 127 / 0.25); }
  50% { border-color: rgb(34 211 238 / 0.4); }
}
.input-frame:focus-within {
  animation: none;
  border-color: var(--color-cyan-400);
  box-shadow: 0 0 0 4px rgb(34 211 238 / 0.15), 0 8px 30px rgb(34 211 238 / 0.08);
}

/* Play badge centered on video thumbnails */
.play-badge {
  position: absolute;
  inset: 0;
  margin: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  border-radius: 9999px;
  background: rgb(0 0 0 / 0.55);
  color: white;
  backdrop-filter: blur(4px);
  transition: transform 0.25s ease, background 0.25s ease;
}
.group:hover .play-badge {
  transform: scale(1.1);
  background: rgb(34 211 238 / 0.75);
}

/* Quality/download button */
.quality-btn {
  position: relative;
  overflow: hidden;
  border-radius: 0.75rem;
  border: 1px solid rgb(127 127 127 / 0.3);
  padding: 0.625rem 1rem;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}
.quality-btn:hover {
  border-color: var(--color-cyan-400);
  box-shadow: 0 6px 20px rgb(34 211 238 / 0.15);
}
.quality-btn-primary {
  border-color: var(--color-cyan-400);
  background: rgb(34 211 238 / 0.08);
}
.quality-fill {
  position: absolute;
  inset: 0;
  transform: scaleX(0);
  transform-origin: left;
  background: rgb(34 211 238 / 0.25);
  transition: transform 0.15s linear;
}
.quality-fill-sweep {
  transform: none;
  background: linear-gradient(90deg, transparent, rgb(34 211 238 / 0.3), transparent);
  background-size: 200% 100%;
  animation: sweep 1.1s linear infinite;
}
@keyframes sweep {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}

/* Checkmark stroke draw-in */
.check-draw path {
  stroke-dasharray: 26;
  stroke-dashoffset: 26;
  animation: check 0.3s ease-out forwards;
}
@keyframes check {
  to { stroke-dashoffset: 0; }
}

/* Invalid input shake + error glow */
.animate-shake {
  animation: shake 0.36s ease-in-out;
}
@keyframes shake {
  20% { transform: translateX(-6px); }
  40% { transform: translateX(5px); }
  60% { transform: translateX(-3px); }
  80% { transform: translateX(2px); }
}
.error-glow {
  text-shadow: 0 0 18px rgb(248 113 113 / 0.6);
  animation: error-decay 1s ease-out forwards;
}
@keyframes error-decay {
  to { text-shadow: 0 0 0 transparent; }
}

/* Footer link underline sweep */
.link-sweep {
  background: linear-gradient(currentColor, currentColor) no-repeat 0 100% / 0 1px;
  transition: background-size 0.25s ease;
}
.link-sweep:hover {
  background-size: 100% 1px;
}

/* Badges over thumbnails */
.badge {
  border-radius: 0.375rem;
  background: rgb(0 0 0 / 0.7);
  color: white;
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
}

/* Hero background: single swappable file (/hero.webp) behind the headline.
   The ::after gradient is the theme-aware overlay that keeps text readable. */
.hero-bg {
  position: absolute;
  inset: 0 0 auto 0;
  height: 26rem;
  overflow: hidden;
  z-index: -1;
  pointer-events: none;
}
.hero-bg img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 30%;
}
.hero-bg::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    rgb(255 255 255 / 0.82) 0%,
    rgb(255 255 255 / 0.92) 55%,
    rgb(255 255 255) 100%
  );
}
.dark .hero-bg::after {
  background: linear-gradient(
    to bottom,
    rgb(9 9 11 / 0.8) 0%,
    rgb(9 9 11 / 0.92) 55%,
    rgb(9 9 11) 100%
  );
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 6: Write main.tsx and shell App.tsx**

`frontend/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import App from "./App";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
);
```

`frontend/src/App.tsx` (temporary shell, replaced in Task 14):

```tsx
export default function App() {
  return (
    <main className="mx-auto max-w-2xl px-4 pt-24">
      <h1 className="text-4xl font-bold tracking-tight">SaveVid AI</h1>
      <p className="mt-3 text-zinc-500">Twitter videos. One paste. No garbage.</p>
    </main>
  );
}
```

- [ ] **Step 7: Write test setup and a smoke test**

`frontend/src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";

// jsdom lacks these; components under test call them.
if (!URL.createObjectURL) {
  URL.createObjectURL = () => "blob:mock";
  URL.revokeObjectURL = () => {};
}
```

`frontend/src/test/smoke.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import App from "../App";

test("renders brand", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: /savevid ai/i })).toBeInTheDocument();
});
```

- [ ] **Step 8: Install, test, build**

```bash
cd ../frontend   # from backend/; or cd frontend from repo root
npm install
npm test -- --run
npm run build
```

Expected: 1 test passes; build emits `dist/` with no TS errors. If a pinned version in package.json no longer resolves, take the nearest current version; do not downgrade below the majors listed.

- [ ] **Step 9: Commit**

```bash
cd .. && git add -A && git commit -m "feat: frontend scaffold with design tokens, fonts, vitest"
```

---

### Task 10: SEO head, static landing content, and site files

**Files:**
- Modify: `frontend/index.html`
- Create: `frontend/public/robots.txt`, `frontend/public/sitemap.xml`, `frontend/public/favicon.svg`, `scripts/make_og.py`, `frontend/public/og.png` (generated)

**Interfaces:**
- Produces: crawlable landing content that exists in raw HTML (not JS-rendered); OG/Twitter meta; FAQPage JSON-LD.

- [ ] **Step 1: Replace index.html with the full SEO version**

```html
<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Twitter Video Downloader - Free, Fast, No Ads | SaveVid AI</title>
    <meta name="description" content="Download Twitter/X videos and GIFs in original quality. No popups, no redirects, no fake download buttons. Free, open source, and instant." />
    <link rel="canonical" href="https://savevidai.app/" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />

    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://savevidai.app/" />
    <meta property="og:title" content="Twitter Video Downloader - Free, Fast, No Ads | SaveVid AI" />
    <meta property="og:description" content="Paste a post link, pick a quality, done. No popups, no fake buttons, open source." />
    <meta property="og:image" content="https://savevidai.app/og.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Twitter Video Downloader - Free, Fast, No Ads | SaveVid AI" />
    <meta name="twitter:description" content="Paste a post link, pick a quality, done. No popups, no fake buttons, open source." />
    <meta name="twitter:image" content="https://savevidai.app/og.png" />

    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Is SaveVid AI really free and ad-free?",
          "acceptedAnswer": { "@type": "Answer", "text": "Yes. There are no popups, no redirects, and no fake download buttons, ever. The project is open source, so you can verify that yourself or even run your own copy." }
        },
        {
          "@type": "Question",
          "name": "What quality can I download Twitter videos in?",
          "acceptedAnswer": { "@type": "Answer", "text": "Every quality Twitter serves, up to the original upload resolution (often 720p or 1080p). SaveVid AI lists all available resolutions with file sizes and you pick one." }
        },
        {
          "@type": "Question",
          "name": "Can I download videos from private or age-restricted posts?",
          "acceptedAnswer": { "@type": "Answer", "text": "No. SaveVid AI only works with public posts and is honest about that limitation." }
        },
        {
          "@type": "Question",
          "name": "Is it legal to download Twitter videos?",
          "acceptedAnswer": { "@type": "Answer", "text": "Downloading for personal use, like saving your own content or archiving, is generally fine. Reposting someone else's video without permission can infringe their copyright. You are responsible for how you use downloaded content." }
        }
      ]
    }
    </script>
    <script>
      try { if (localStorage.theme === "light") document.documentElement.classList.remove("dark"); } catch (e) {}
    </script>
  </head>
  <body class="bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 font-sans antialiased">
    <div id="root"></div>

    <!-- Static, crawlable landing content. Lives outside the React root on purpose. -->
    <section class="mx-auto max-w-2xl px-4 py-16 border-t border-zinc-200 dark:border-zinc-800">
      <h2 class="text-2xl font-semibold tracking-tight">How to download a Twitter video</h2>
      <ol class="mt-4 space-y-3 text-zinc-600 dark:text-zinc-400 list-decimal list-inside">
        <li>Copy the link of the post that contains the video (Share, then Copy link).</li>
        <li>Paste it in the box above. The preview appears in about a second.</li>
        <li>Pick a quality and the video saves straight to your device.</li>
      </ol>
    </section>

    <section class="mx-auto max-w-2xl px-4 pb-16">
      <h2 class="text-2xl font-semibold tracking-tight">Frequently asked questions</h2>
      <dl class="mt-4 space-y-6 text-sm">
        <div>
          <dt class="font-medium text-base">Is SaveVid AI really free and ad-free?</dt>
          <dd class="mt-1 text-zinc-600 dark:text-zinc-400">Yes. No popups, no redirects, no fake download buttons, ever. The code is open source, so you can verify that yourself or run your own copy.</dd>
        </div>
        <div>
          <dt class="font-medium text-base">What quality do I get?</dt>
          <dd class="mt-1 text-zinc-600 dark:text-zinc-400">Every quality Twitter serves, up to the original upload resolution. All options are listed with file sizes; you choose.</dd>
        </div>
        <div>
          <dt class="font-medium text-base">Do private or age-restricted posts work?</dt>
          <dd class="mt-1 text-zinc-600 dark:text-zinc-400">No. SaveVid AI only works with public posts, and we would rather say that plainly than pretend otherwise.</dd>
        </div>
        <div>
          <dt class="font-medium text-base">Is downloading Twitter videos legal?</dt>
          <dd class="mt-1 text-zinc-600 dark:text-zinc-400">Personal use, like archiving your own posts, is generally fine. Reposting someone else's work without permission can infringe copyright. Use downloads responsibly.</dd>
        </div>
        <div>
          <dt class="font-medium text-base">Who runs this?</dt>
          <dd class="mt-1 text-zinc-600 dark:text-zinc-400">SaveVid AI is an open source project. Read the code, star it, or self-host it from the <a class="link-sweep text-cyan-500" href="https://github.com/OWNER/savevidai">GitHub repository</a>.</dd>
        </div>
      </dl>
    </section>

    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Write robots.txt, sitemap.xml, favicon.svg**

`frontend/public/robots.txt`:

```text
User-agent: *
Allow: /
Sitemap: https://savevidai.app/sitemap.xml
```

`frontend/public/sitemap.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://savevidai.app/</loc><changefreq>monthly</changefreq></url>
</urlset>
```

`frontend/public/favicon.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="8" fill="#09090b"/>
  <path d="M16 7v12m0 0-5-5m5 5 5-5" stroke="#22d3ee" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M9 24h14" stroke="#22d3ee" stroke-width="3" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 3: Write and run the OG image generator**

`scripts/make_og.py`:

```python
"""One-off generator for frontend/public/og.png (1200x630). Rerun after brand changes.

Usage: pip install pillow && python scripts/make_og.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
BG = (9, 9, 11)
ACCENT = (34, 211, 238)
FG = (237, 237, 240)
MUTED = (154, 154, 165)

CANDIDATE_FONTS = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",  # macOS
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",  # Debian/Ubuntu
]


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in CANDIDATE_FONTS:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)
d.rectangle([0, H - 14, W, H], fill=ACCENT)
d.text((80, 180), "SaveVid AI", font=load_font(96), fill=FG)
d.text((80, 320), "Twitter Video Downloader", font=load_font(48), fill=ACCENT)
d.text((80, 400), "Free. No popups. No fake buttons. Open source.", font=load_font(34), fill=MUTED)
d.text((80, 520), "savevidai.app", font=load_font(30), fill=MUTED)

out = Path(__file__).resolve().parent.parent / "frontend" / "public" / "og.png"
img.save(out)
print(f"wrote {out}")
```

Run from repo root:

```bash
backend/.venv/bin/pip install pillow
backend/.venv/bin/python scripts/make_og.py
```

Expected: `wrote .../frontend/public/og.png`, file exists and is 1200x630.

- [ ] **Step 4: Verify build and landing content presence**

```bash
cd frontend && npm run build
grep -c "Frequently asked questions" dist/index.html
```

Expected: build succeeds; grep prints `1` (content is in the raw HTML, not JS-injected).

- [ ] **Step 5: Commit**

```bash
cd .. && git add -A && git commit -m "feat: SEO head, static landing content, site files, OG image"
```

---

### Task 11: API client and resolve state hook

**Files:**
- Create: `frontend/src/lib/api.ts`, `frontend/src/hooks/useResolve.ts`, `frontend/src/lib/api.test.ts`, `frontend/src/hooks/useResolve.test.tsx`

**Interfaces:**
- Produces in `lib/api.ts`: types `Variant`, `MediaItem`, `ResolveResponse`; `class ApiError extends Error { code: string }`; `resolveTweet(url: string): Promise<ResolveResponse>`.
- Produces in `hooks/useResolve.ts`: `useResolve()` returning `{ state, resolve, reset }` where `state` is the discriminated union `ResolveState` (`idle | resolving | ready | error`).

- [ ] **Step 1: Write the failing tests**

`frontend/src/lib/api.test.ts`:

```ts
import { afterEach, expect, test, vi } from "vitest";
import { ApiError, resolveTweet } from "./api";

afterEach(() => vi.unstubAllGlobals());

test("returns parsed body on 200", async () => {
  const body = { id: "20", author: "Jack", handle: "jack", avatar_url: null, text: "", items: [] };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
  await expect(resolveTweet("https://x.com/jack/status/20")).resolves.toEqual(body);
});

test("throws ApiError with server code on 4xx", async () => {
  const err = { error: "no_video", message: "This post has no video." };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(err), { status: 422 })));
  const p = resolveTweet("https://x.com/jack/status/20");
  await expect(p).rejects.toBeInstanceOf(ApiError);
  await expect(p).rejects.toMatchObject({ code: "no_video" });
});

test("throws generic ApiError on non-JSON failure", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>bad gateway</html>", { status: 502 })));
  await expect(resolveTweet("x")).rejects.toMatchObject({ code: "upstream_error" });
});
```

`frontend/src/hooks/useResolve.test.tsx`:

```tsx
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useResolve } from "./useResolve";

afterEach(() => vi.unstubAllGlobals());

const BODY = { id: "20", author: "Jack", handle: "jack", avatar_url: null, text: "", items: [] };

test("happy path goes idle -> resolving -> ready", async () => {
  let release!: (r: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((res) => (release = res))));
  const { result } = renderHook(() => useResolve());
  expect(result.current.state.status).toBe("idle");

  act(() => void result.current.resolve("https://x.com/jack/status/20"));
  expect(result.current.state.status).toBe("resolving");

  await act(async () => release(new Response(JSON.stringify(BODY), { status: 200 })));
  expect(result.current.state).toMatchObject({ status: "ready", data: BODY });
});

test("api error carries code and message; reset returns to idle", async () => {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ error: "not_found", message: "gone" }), { status: 404 })));
  const { result } = renderHook(() => useResolve());
  await act(() => result.current.resolve("https://x.com/jack/status/20"));
  expect(result.current.state).toMatchObject({ status: "error", code: "not_found", message: "gone" });
  act(() => result.current.reset());
  expect(result.current.state.status).toBe("idle");
});

test("network failure maps to network error state", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
  const { result } = renderHook(() => useResolve());
  await act(() => result.current.resolve("https://x.com/jack/status/20"));
  expect(result.current.state).toMatchObject({ status: "error", code: "network" });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run`
Expected: FAIL, cannot resolve `./api` / `./useResolve`

- [ ] **Step 3: Write the implementations**

`frontend/src/lib/api.ts`:

```ts
export type Variant = {
  label: string;
  width: number | null;
  height: number | null;
  url: string;
  size_bytes: number | null;
};

export type MediaItem = {
  index: number;
  kind: "video" | "gif";
  thumbnail: string | null;
  duration_seconds: number | null;
  variants: Variant[];
};

export type ResolveResponse = {
  id: string;
  author: string;
  handle: string;
  avatar_url: string | null;
  text: string;
  items: MediaItem[];
};

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function resolveTweet(url: string): Promise<ResolveResponse> {
  const res = await fetch("/api/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      body?.error ?? "upstream_error",
      body?.message ?? "Something went wrong. Try again.",
    );
  }
  return body as ResolveResponse;
}
```

`frontend/src/hooks/useResolve.ts`:

```ts
import { useCallback, useState } from "react";
import { ApiError, resolveTweet, type ResolveResponse } from "../lib/api";

export type ResolveState =
  | { status: "idle" }
  | { status: "resolving" }
  | { status: "ready"; data: ResolveResponse }
  | { status: "error"; code: string; message: string };

export function useResolve() {
  const [state, setState] = useState<ResolveState>({ status: "idle" });

  const resolve = useCallback(async (url: string) => {
    setState({ status: "resolving" });
    try {
      const data = await resolveTweet(url);
      setState({ status: "ready", data });
    } catch (err) {
      if (err instanceof ApiError) {
        setState({ status: "error", code: err.code, message: err.message });
      } else {
        setState({
          status: "error",
          code: "network",
          message: "Network error. Check your connection and try again.",
        });
      }
    }
  }, []);

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, resolve, reset };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
cd .. && git add -A && git commit -m "feat: api client and resolve state hook" && cd frontend
```

---

### Task 12: Download library and formatters

**Files:**
- Create: `frontend/src/lib/download.ts`, `frontend/src/lib/format.ts`, `frontend/src/lib/download.test.ts`, `frontend/src/lib/format.test.ts`

**Interfaces:**
- Produces in `lib/download.ts`: `type Progress = { received: number; total: number | null }`; `buildFilename(handle, id, label, index, totalItems): string`; `proxyUrl(url, filename): string`; `downloadVariant(url, filename, onProgress): Promise<void>`.
- Produces in `lib/format.ts`: `formatBytes(n: number | null): string | null`; `formatDuration(seconds: number): string`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/lib/format.test.ts`:

```ts
import { expect, test } from "vitest";
import { formatBytes, formatDuration } from "./format";

test("formatBytes", () => {
  expect(formatBytes(null)).toBeNull();
  expect(formatBytes(0)).toBeNull();
  expect(formatBytes(512)).toBe("512 B");
  expect(formatBytes(1536)).toBe("1.5 KB");
  expect(formatBytes(35651584)).toBe("34 MB");
});

test("formatDuration", () => {
  expect(formatDuration(5)).toBe("0:05");
  expect(formatDuration(75)).toBe("1:15");
  expect(formatDuration(12.5)).toBe("0:13");
});
```

`frontend/src/lib/download.test.ts`:

```ts
import { afterEach, expect, test, vi } from "vitest";
import { buildFilename, downloadVariant, proxyUrl } from "./download";

afterEach(() => vi.unstubAllGlobals());

test("buildFilename single and multi", () => {
  expect(buildFilename("ada", "111", "1080p", 1, 1)).toBe("ada_111_1080p.mp4");
  expect(buildFilename("ada", "222", "720p", 2, 3)).toBe("ada_222_2_720p.mp4");
});

test("proxyUrl encodes url and filename", () => {
  const u = proxyUrl("https://video.twimg.com/v.mp4?tag=1", "a b.mp4");
  expect(u).toBe("/api/proxy?url=https%3A%2F%2Fvideo.twimg.com%2Fv.mp4%3Ftag%3D1&filename=a%20b.mp4");
});

test("falls back to proxy when direct fetch fails", async () => {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith("https://video.twimg.com/")) throw new TypeError("cors");
      return new Response(new Blob([new Uint8Array([1, 2, 3])]), {
        status: 200,
        headers: { "content-length": "3" },
      });
    }),
  );
  const progress: number[] = [];
  await downloadVariant("https://video.twimg.com/v.mp4", "f.mp4", (p) => progress.push(p.received));
  expect(calls[0]).toBe("https://video.twimg.com/v.mp4");
  expect(calls[1]).toContain("/api/proxy?");
  expect(progress.at(-1)).toBe(3);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run`
Expected: FAIL, modules not found

- [ ] **Step 3: Write the implementations**

`frontend/src/lib/format.ts`:

```ts
export function formatBytes(n: number | null): string | null {
  if (n == null || n <= 0) return null;
  const units = ["B", "KB", "MB", "GB"];
  let value = n;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  const text = value >= 10 || i === 0 ? String(Math.round(value)) : value.toFixed(1);
  return `${text} ${units[i]}`;
}

export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
```

`frontend/src/lib/download.ts`:

```ts
export type Progress = { received: number; total: number | null };

export function buildFilename(
  handle: string,
  id: string,
  label: string,
  index: number,
  totalItems: number,
): string {
  const suffix = totalItems > 1 ? `_${index}` : "";
  return `${handle}_${id}${suffix}_${label}.mp4`;
}

export function proxyUrl(url: string, filename: string): string {
  return `/api/proxy?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
}

async function fetchBlob(url: string, onProgress: (p: Progress) => void): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`fetch failed: ${res.status}`);
  const total = Number(res.headers.get("content-length")) || null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress({ received, total });
  }
  return new Blob(chunks as BlobPart[], { type: "video/mp4" });
}

function saveBlob(blob: Blob, filename: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** Direct CDN blob download with progress; transparently falls back to the server proxy. */
export async function downloadVariant(
  url: string,
  filename: string,
  onProgress: (p: Progress) => void,
): Promise<void> {
  let blob: Blob;
  try {
    blob = await fetchBlob(url, onProgress);
  } catch {
    blob = await fetchBlob(proxyUrl(url, filename), onProgress);
  }
  saveBlob(blob, filename);
}
```

Note: `Response` streaming in jsdom supports `res.body.getReader()` for `Response(new Blob(...))` in modern Node/jsdom. If `res.body` is null in the test environment, construct the Response from a `ReadableStream` in the test instead; do not change the implementation.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
cd .. && git add -A && git commit -m "feat: blob download with progress, proxy fallback, formatters" && cd frontend
```

---

### Task 13: Core components (PasteInput, SkeletonCard, PreviewCard, QualityButton)

**Files:**
- Create: `frontend/src/lib/motion.ts`, `frontend/src/components/PasteInput.tsx`, `frontend/src/components/SkeletonCard.tsx`, `frontend/src/components/QualityButton.tsx`, `frontend/src/components/PreviewCard.tsx`, `frontend/src/components/PasteInput.test.tsx`, `frontend/src/components/PreviewCard.test.tsx`

**Interfaces:**
- Consumes: `Variant`, `MediaItem`, `ResolveResponse` from `lib/api`; `downloadVariant`, `buildFilename`, `Progress` from `lib/download`; `formatBytes`, `formatDuration` from `lib/format`; CSS classes from Task 9.
- Produces: `PasteInput({ status, errorMessage, onSubmit })`, `SkeletonCard()`, `PreviewCard({ data })`, `QualityButton({ variant, filename, primary? })`; motion presets `fadeRise(order)`, `cardReveal`, `cascade(order)` in `lib/motion.ts`.

- [ ] **Step 1: Write motion presets** (`frontend/src/lib/motion.ts`)

```ts
export const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const fadeRise = (order: number) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: EASE_OUT, delay: order * 0.06 },
});

export const cardReveal = {
  initial: { opacity: 0, y: 12, scale: 0.99 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.32, ease: EASE_OUT },
};

export const cascade = (order: number) => ({
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease: EASE_OUT, delay: 0.08 + order * 0.05 },
});
```

- [ ] **Step 2: Write the failing component tests**

`frontend/src/components/PasteInput.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { PasteInput } from "./PasteInput";

test("submits trimmed url", async () => {
  const onSubmit = vi.fn();
  render(<PasteInput status="idle" errorMessage={null} onSubmit={onSubmit} />);
  await userEvent.type(screen.getByRole("textbox"), "  https://x.com/jack/status/20  ");
  await userEvent.click(screen.getByRole("button", { name: /fetch/i }));
  expect(onSubmit).toHaveBeenCalledWith("https://x.com/jack/status/20");
});

test("disables while resolving", () => {
  render(<PasteInput status="resolving" errorMessage={null} onSubmit={vi.fn()} />);
  expect(screen.getByRole("button")).toBeDisabled();
});

test("shows error message with alert role", () => {
  render(<PasteInput status="error" errorMessage="This post doesn't exist or was deleted." onSubmit={vi.fn()} />);
  expect(screen.getByRole("alert")).toHaveTextContent("doesn't exist");
});
```

`frontend/src/components/PreviewCard.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import type { ResolveResponse } from "../lib/api";
import { PreviewCard } from "./PreviewCard";

const DATA: ResolveResponse = {
  id: "222",
  author: "Ada Lovelace",
  handle: "ada",
  avatar_url: null,
  text: "two clips",
  items: [
    { index: 1, kind: "video", thumbnail: "https://pbs.twimg.com/t1.jpg", duration_seconds: 5,
      variants: [
        { label: "720p", width: 1280, height: 720, url: "https://video.twimg.com/a.mp4", size_bytes: 2097152 },
        { label: "360p", width: 640, height: 360, url: "https://video.twimg.com/b.mp4", size_bytes: null },
      ] },
    { index: 2, kind: "gif", thumbnail: null, duration_seconds: null,
      variants: [
        { label: "480p", width: 480, height: 480, url: "https://video.twimg.com/tweet_video/c.mp4", size_bytes: 512000 },
      ] },
  ],
};

test("renders author, handle, text, and per-item sections", () => {
  render(<PreviewCard data={DATA} />);
  expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  expect(screen.getByText("@ada")).toBeInTheDocument();
  expect(screen.getByText("two clips")).toBeInTheDocument();
  expect(screen.getByText("Video 1")).toBeInTheDocument();
  expect(screen.getByText("Video 2")).toBeInTheDocument();
  expect(screen.getByText("GIF")).toBeInTheDocument();
});

test("renders one button per variant with label and size", () => {
  render(<PreviewCard data={DATA} />);
  expect(screen.getByRole("button", { name: /720p/ })).toHaveTextContent("2.0 MB");
  expect(screen.getByRole("button", { name: /360p/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /480p/ })).toBeInTheDocument();
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- --run`
Expected: FAIL, components not found

- [ ] **Step 4: Write the components**

`frontend/src/components/PasteInput.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { motion } from "motion/react";

type Props = {
  status: "idle" | "resolving" | "ready" | "error";
  errorMessage: string | null;
  onSubmit: (url: string) => void;
};

export function PasteInput({ status, errorMessage, onSubmit }: Props) {
  const [value, setValue] = useState("");
  const busy = status === "resolving";

  function submit(e: FormEvent) {
    e.preventDefault();
    const url = value.trim();
    if (url && !busy) onSubmit(url);
  }

  async function prefillFromClipboard() {
    if (value) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text.includes("/status/")) setValue(text.trim());
    } catch {
      // clipboard permission denied or unavailable; typing still works
    }
  }

  return (
    <form onSubmit={submit}>
      <div className={`input-frame ${status === "error" ? "animate-shake" : ""}`}>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={prefillFromClipboard}
          placeholder="Paste a Twitter/X post link"
          aria-label="Twitter/X post link"
          spellCheck={false}
          autoComplete="off"
          className="w-full bg-transparent px-3 py-2 text-base outline-none placeholder:text-zinc-500"
        />
        <motion.button
          whileTap={{ scale: 0.97 }}
          type="submit"
          disabled={busy}
          aria-busy={busy}
          className="shrink-0 rounded-xl bg-cyan-400 px-5 py-2 font-semibold text-zinc-950 transition hover:bg-cyan-300 disabled:opacity-60"
        >
          {busy ? <Spinner /> : "Fetch"}
        </motion.button>
      </div>
      {status === "error" && errorMessage && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          role="alert"
          className="error-glow mt-3 text-sm text-red-400"
        >
          {errorMessage}
        </motion.p>
      )}
    </form>
  );
}

function Spinner() {
  return (
    <span
      data-testid="spinner"
      aria-hidden
      className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent align-middle"
    />
  );
}
```

`frontend/src/components/SkeletonCard.tsx`:

```tsx
import { motion } from "motion/react";
import { cardReveal } from "../lib/motion";

export function SkeletonCard() {
  return (
    <motion.div
      {...cardReveal}
      data-testid="skeleton"
      className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-full shimmer" />
        <div className="h-4 w-40 rounded shimmer" />
      </div>
      <div className="mt-4 aspect-video w-full rounded-xl shimmer" />
      <div className="mt-4 flex gap-2">
        <div className="h-10 w-28 rounded-xl shimmer" />
        <div className="h-10 w-28 rounded-xl shimmer" />
      </div>
    </motion.div>
  );
}
```

`frontend/src/components/QualityButton.tsx`:

```tsx
import { useState } from "react";
import { motion } from "motion/react";
import type { Variant } from "../lib/api";
import { downloadVariant, type Progress } from "../lib/download";
import { formatBytes } from "../lib/format";

type Phase =
  | { name: "idle" }
  | { name: "downloading"; progress: Progress }
  | { name: "done" }
  | { name: "failed" };

export function QualityButton({
  variant,
  filename,
  primary = false,
}: {
  variant: Variant;
  filename: string;
  primary?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const size = formatBytes(variant.size_bytes);
  // Show the true stored resolution (e.g. "1280×720"); fall back to the "720p"
  // label only when the API didn't give dimensions (rare, e.g. some GIFs).
  const dims =
    variant.width && variant.height ? `${variant.width}×${variant.height}` : variant.label;
  const isHd = (variant.height ?? 0) >= 720;

  async function start() {
    if (phase.name === "downloading") return;
    setPhase({ name: "downloading", progress: { received: 0, total: variant.size_bytes } });
    try {
      await downloadVariant(variant.url, filename, (progress) =>
        setPhase({ name: "downloading", progress }),
      );
      setPhase({ name: "done" });
    } catch {
      setPhase({ name: "failed" });
    }
  }

  const pct =
    phase.name === "downloading" && phase.progress.total
      ? Math.min(1, phase.progress.received / phase.progress.total)
      : null;
  const indeterminate = phase.name === "downloading" && pct === null;

  return (
    <motion.button
      type="button"
      onClick={start}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.97 }}
      data-phase={phase.name}
      className={`quality-btn ${primary ? "quality-btn-primary" : ""}`}
    >
      <span
        aria-hidden
        className={`quality-fill ${indeterminate ? "quality-fill-sweep" : ""}`}
        style={
          indeterminate
            ? undefined
            : { transform: `scaleX(${phase.name === "done" ? 1 : (pct ?? 0)})` }
        }
      />
      <span className="relative z-10 flex items-center gap-2">
        {phase.name === "done" ? (
          <>
            <CheckIcon />
            <span className="font-semibold">Saved</span>
          </>
        ) : phase.name === "downloading" ? (
          <span className="font-mono text-sm tabular-nums">
            {pct === null ? "downloading" : `${Math.round(pct * 100)}%`}
          </span>
        ) : (
          <>
            {isHd && (
              <span className="rounded bg-cyan-400/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-300">
                HD
              </span>
            )}
            <span className="font-semibold tabular-nums">{dims}</span>
            {size && <span className="font-mono text-xs opacity-70">{size}</span>}
            {phase.name === "failed" && <span className="text-xs text-red-400">retry</span>}
          </>
        )}
      </span>
    </motion.button>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="check-draw size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 12.5 10 18.5 20 6" />
    </svg>
  );
}
```

`frontend/src/components/PreviewCard.tsx`:

```tsx
import { motion } from "motion/react";
import type { MediaItem, ResolveResponse } from "../lib/api";
import { buildFilename } from "../lib/download";
import { formatDuration } from "../lib/format";
import { cardReveal, cascade } from "../lib/motion";
import { QualityButton } from "./QualityButton";

export function PreviewCard({ data }: { data: ResolveResponse }) {
  return (
    <motion.article
      {...cardReveal}
      data-testid="preview-card"
      className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <motion.div {...cascade(0)} className="flex items-center gap-3">
        {data.avatar_url ? (
          <img src={data.avatar_url} alt="" className="size-10 rounded-full" />
        ) : (
          <div
            aria-hidden
            className="flex size-10 items-center justify-center rounded-full bg-cyan-950 font-semibold text-cyan-300"
          >
            {data.handle.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate font-semibold">{data.author}</p>
          <p className="truncate text-sm text-zinc-500">@{data.handle}</p>
        </div>
      </motion.div>

      {data.text && (
        <motion.p {...cascade(1)} className="mt-3 line-clamp-3 text-sm text-zinc-600 dark:text-zinc-400">
          {data.text}
        </motion.p>
      )}

      <div className="mt-4 space-y-6">
        {data.items.map((item) => (
          <MediaSection key={item.index} item={item} data={data} />
        ))}
      </div>
    </motion.article>
  );
}

function MediaSection({ item, data }: { item: MediaItem; data: ResolveResponse }) {
  const many = data.items.length > 1;
  return (
    <section aria-label={many ? `Video ${item.index}` : "Video"}>
      {many && <h3 className="mb-2 text-sm font-medium text-zinc-500">Video {item.index}</h3>}
      <motion.div {...cascade(2)} className="group relative overflow-hidden rounded-xl">
        {item.thumbnail ? (
          <img
            src={item.thumbnail}
            alt=""
            className="aspect-video w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="aspect-video w-full bg-zinc-200 dark:bg-zinc-800" />
        )}
        <div aria-hidden className="play-badge">
          <svg viewBox="0 0 24 24" className="ml-0.5 size-5" fill="currentColor">
            <path d="M8 5.5v13l11-6.5-11-6.5Z" />
          </svg>
        </div>
        <div className="absolute bottom-2 right-2 flex items-center gap-2">
          {item.kind === "gif" && <span className="badge">GIF</span>}
          {item.duration_seconds != null && (
            <span className="badge font-mono">{formatDuration(item.duration_seconds)}</span>
          )}
        </div>
      </motion.div>
      <motion.div {...cascade(3)} className="mt-3 flex flex-wrap gap-2">
        {item.variants.map((variant, i) => (
          <QualityButton
            key={variant.url}
            variant={variant}
            primary={i === 0}
            filename={buildFilename(data.handle, data.id, variant.label, item.index, data.items.length)}
          />
        ))}
      </motion.div>
    </section>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- --run`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
cd .. && git add -A && git commit -m "feat: paste input, skeleton, preview card, download button with progress" && cd frontend
```

---

### Task 14: App assembly (theme, footer, ad slot, global paste, entrance motion)

**Files:**
- Create: `frontend/src/components/ThemeToggle.tsx`, `frontend/src/components/Footer.tsx`, `frontend/src/components/AdSlot.tsx`, `frontend/src/App.test.tsx`
- Modify: `frontend/src/App.tsx` (replace the Task 9 shell entirely)

**Interfaces:**
- Consumes: everything from Tasks 11-13.
- Produces: the complete single-page app; `VITE_ADS_ENABLED` env flag read by `AdSlot`.

- [ ] **Step 1: Write the failing App test** (`frontend/src/App.test.tsx`)

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import App from "./App";

afterEach(() => vi.unstubAllGlobals());

const BODY = {
  id: "20", author: "Jack", handle: "jack", avatar_url: null, text: "hi",
  items: [{ index: 1, kind: "video", thumbnail: null, duration_seconds: 3,
    variants: [{ label: "720p", width: 1280, height: 720, url: "https://video.twimg.com/v.mp4", size_bytes: 100 }] }],
};

test("paste-to-card flow", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(BODY), { status: 200 })));
  render(<App />);
  await userEvent.type(screen.getByRole("textbox"), "https://x.com/jack/status/20");
  await userEvent.click(screen.getByRole("button", { name: /fetch/i }));
  expect(await screen.findByTestId("preview-card")).toBeInTheDocument();
  expect(screen.getByText("Jack")).toBeInTheDocument();
});

test("error flow shows honest message", async () => {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ error: "no_video", message: "This post has no video." }), { status: 422 })));
  render(<App />);
  await userEvent.type(screen.getByRole("textbox"), "https://x.com/jack/status/21");
  await userEvent.click(screen.getByRole("button", { name: /fetch/i }));
  expect(await screen.findByRole("alert")).toHaveTextContent("no video");
});

test("ad slot is absent when flag is off", () => {
  render(<App />);
  expect(screen.queryByLabelText("sponsor")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run`
Expected: App test FAILs (shell has no textbox)

- [ ] **Step 3: Write the small components**

`frontend/src/components/ThemeToggle.tsx`:

```tsx
import { useEffect, useState } from "react";
import { motion } from "motion/react";

export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch {
      // private mode; theme just won't persist
    }
  }, [dark]);

  return (
    <motion.button
      type="button"
      whileHover={{ rotate: 15 }}
      whileTap={{ scale: 0.9 }}
      onClick={() => setDark(!dark)}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="rounded-full border border-zinc-200 p-2 text-zinc-500 transition hover:text-cyan-400 dark:border-zinc-800"
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </motion.button>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}
```

`frontend/src/components/Footer.tsx`:

```tsx
export function Footer() {
  return (
    <footer className="w-full max-w-2xl border-t border-zinc-200 py-8 text-sm text-zinc-500 dark:border-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>
          No popups. No fake buttons. No tracking.{" "}
          <a className="link-sweep text-cyan-500" href="https://github.com/OWNER/savevidai">
            Open source
          </a>
          .
        </p>
        <a className="link-sweep" href="https://ko-fi.com/OWNER">
          Support this project
        </a>
      </div>
    </footer>
  );
}
```

`frontend/src/components/AdSlot.tsx`:

```tsx
/**
 * The single, passive ad slot. Off by default; enable by building with VITE_ADS_ENABLED=true.
 * Never gates or delays a download. See the spec's monetization section.
 */
export function AdSlot() {
  if (import.meta.env.VITE_ADS_ENABLED !== "true") return null;
  return (
    <aside
      aria-label="sponsor"
      className="mt-10 rounded-xl border border-zinc-200 p-4 text-center text-sm text-zinc-500 dark:border-zinc-800"
    >
      <div id="ad-slot" />
    </aside>
  );
}
```

- [ ] **Step 4: Replace App.tsx**

```tsx
import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AdSlot } from "./components/AdSlot";
import { Footer } from "./components/Footer";
import { PasteInput } from "./components/PasteInput";
import { PreviewCard } from "./components/PreviewCard";
import { SkeletonCard } from "./components/SkeletonCard";
import { ThemeToggle } from "./components/ThemeToggle";
import { useResolve } from "./hooks/useResolve";
import { fadeRise } from "./lib/motion";

export default function App() {
  const { state, resolve } = useResolve();

  // Ctrl/Cmd+V anywhere on the page starts a resolve.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if ((e.target as HTMLElement | null)?.tagName === "INPUT") return;
      const text = e.clipboardData?.getData("text") ?? "";
      if (text.includes("/status/")) resolve(text.trim());
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [resolve]);

  // ?url= support for bookmarklets and share targets.
  useEffect(() => {
    const url = new URLSearchParams(window.location.search).get("url");
    if (url) resolve(url);
  }, [resolve]);

  return (
    <div className="relative isolate flex min-h-screen flex-col items-center px-4">
      {/* Hero background: single swappable file at frontend/public/hero.webp, behind the
          headline. aria-hidden (decorative). The .hero-bg::after gradient (in index.css)
          is the theme-aware overlay that keeps the H1/subhead readable in light and dark. */}
      <div aria-hidden className="hero-bg">
        <img src="/hero.webp" alt="" decoding="async" />
      </div>
      <header className="flex w-full max-w-2xl items-center justify-between pt-4">
        <span className="font-semibold tracking-tight text-cyan-400">SaveVid AI</span>
        <ThemeToggle />
      </header>

      <main className="w-full max-w-2xl flex-1 pb-24 pt-16">
        {/* H1 targets the search query per the spec's SEO section; the brand lives in the header */}
        <motion.h1 {...fadeRise(0)} className="text-4xl font-bold tracking-tight">
          Twitter Video Downloader
        </motion.h1>
        <motion.p {...fadeRise(1)} className="mt-3 text-lg text-zinc-500">
          One paste. Every quality. No garbage.
        </motion.p>

        <motion.div {...fadeRise(2)} className="mt-8">
          <PasteInput
            status={state.status}
            errorMessage={state.status === "error" ? state.message : null}
            onSubmit={resolve}
          />
        </motion.div>

        <div aria-live="polite" className="mt-8">
          <AnimatePresence mode="wait">
            {state.status === "resolving" && <SkeletonCard key="skeleton" />}
            {state.status === "ready" && <PreviewCard key="card" data={state.data} />}
          </AnimatePresence>
        </div>

        <AdSlot />
      </main>

      <Footer />
    </div>
  );
}
```

- [ ] **Step 4c: Hero background image** (added 2026-07-16 by user request)

The hero renders `frontend/public/hero.webp` behind the headline. Single swappable file: replacing `hero.webp` (any landscape image) rebrands the hero with no code change. In `App.tsx`, the root div gains `relative isolate` and its first child is:

```tsx
{/* Swap frontend/public/hero.webp to change the hero art; overlay keeps text readable in both themes */}
<div aria-hidden className="hero-bg">
  <img src="/hero.webp" alt="" decoding="async" />
</div>
```

Append to `frontend/src/styles/index.css` (before the reduced-motion block):

```css
/* Hero background: single swappable file (/hero.webp) behind the headline.
   The ::after gradient is the theme-aware overlay that keeps text readable. */
.hero-bg {
  position: absolute;
  inset: 0 0 auto 0;
  height: 26rem;
  overflow: hidden;
  z-index: -1;
  pointer-events: none;
}
.hero-bg img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 30%;
}
.hero-bg::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    rgb(255 255 255 / 0.82) 0%,
    rgb(255 255 255 / 0.92) 55%,
    rgb(255 255 255) 100%
  );
}
.dark .hero-bg::after {
  background: linear-gradient(
    to bottom,
    rgb(9 9 11 / 0.8) 0%,
    rgb(9 9 11 / 0.92) 55%,
    rgb(9 9 11) 100%
  );
}
```

The image is `aria-hidden` decoration with empty alt; the gradient overlay swaps with

Replace the assertion in `frontend/src/test/smoke.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import App from "../App";

test("renders keyword heading and brand", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: /twitter video downloader/i })).toBeInTheDocument();
  expect(screen.getByText("SaveVid AI")).toBeInTheDocument();
});
```

- [ ] **Step 6: Run all frontend tests and build**

```bash
npm test -- --run
npm run build
```

Expected: all tests pass, build succeeds

- [ ] **Step 7: Manual verification in the browser**

Start the backend (`cd ../backend && source .venv/bin/activate && uvicorn app.main:app --port 8000`) and frontend dev server (`cd ../frontend && npm run dev`), open the app, paste a real public tweet URL with video, confirm: skeleton, card cascade, quality buttons with sizes, progress fill, checkmark, saved file with correct name, theme toggle, reduced-motion (toggle in OS settings), and that Twitter's CDN download works without the proxy. Fix anything broken before committing.

- [ ] **Step 8: Commit**

```bash
cd .. && git add -A && git commit -m "feat: assembled app with theme, global paste, ad slot flag, entrance motion"
```

---

### Task 15: Docker image, compose + Caddy, render.yaml

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `compose.yaml`, `Caddyfile`, `render.yaml`

**Interfaces:**
- Consumes: `STATIC_DIR` env var support from `app.main` (Task 1), `/api/health` (Task 1).
- Produces: `docker build -t savevidai .` yields a self-contained image listening on 8000.

- [ ] **Step 1: Write .dockerignore**

```text
**/node_modules
**/dist
**/.venv
**/__pycache__
.git
docs
```

- [ ] **Step 2: Write Dockerfile**

```dockerfile
# Stage 1: build the frontend
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: backend + static files
FROM python:3.12-slim
WORKDIR /srv
COPY backend/ backend/
RUN pip install --no-cache-dir ./backend
COPY --from=web /web/dist static/
ENV STATIC_DIR=/srv/static
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 3: Write compose.yaml (VPS production)**

```yaml
services:
  app:
    build: .
    image: ghcr.io/OWNER/savevidai:latest
    restart: unless-stopped

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config

volumes:
  caddy_data:
  caddy_config:
```

- [ ] **Step 4: Write Caddyfile**

```text
savevidai.app {
	encode zstd gzip
	reverse_proxy app:8000
	log {
		output file /data/access.log
		format json
	}
}
```

(The JSON access log is the privacy-preserving traffic counter: run goaccess against it on the VPS. No client-side tracking.)

- [ ] **Step 5: Write render.yaml (free staging)**

```yaml
services:
  - type: web
    name: savevidai
    runtime: docker
    plan: free
    healthCheckPath: /api/health
    autoDeploy: true
```

- [ ] **Step 6: Verify the image builds and serves**

```bash
docker build -t savevidai .
docker run -d --rm -p 8000:8000 --name savevidai-test savevidai
curl -s http://localhost:8000/api/health
curl -s http://localhost:8000/ | grep -c "Frequently asked questions"
docker stop savevidai-test
```

Expected: `{"ok":true}` and `1`. If Docker is not installed locally, note it and rely on CI's build (Task 16); do not skip writing the files.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: docker image, VPS compose with caddy, render blueprint"
```

---

### Task 16: CI, README, CONTRIBUTING, smoke script

**Files:**
- Create: `.github/workflows/ci.yml`, `README.md`, `CONTRIBUTING.md`, `scripts/smoke.py`

**Interfaces:**
- Consumes: everything; CI runs the suites exactly as written in earlier tasks.

- [ ] **Step 1: Write the CI workflow** (`.github/workflows/ci.yml`)

```yaml
name: CI

on:
  push:
    branches: [main]
    tags: ["v*"]
  pull_request:

jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install -e './backend[dev]'
      - run: ruff check backend
      - run: pytest backend -q

  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npm test -- --run
      - run: npm run build

  docker:
    if: startsWith(github.ref, 'refs/tags/v')
    needs: [backend, frontend]
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: |
            ghcr.io/${{ github.repository }}:latest
            ghcr.io/${{ github.repository }}:${{ github.ref_name }}
```

- [ ] **Step 2: Write the live smoke script** (`scripts/smoke.py`)

```python
"""Live smoke test against a running instance. Not part of CI (depends on Twitter uptime).

Usage:
    BASE_URL=http://localhost:8000 TWEET_URL=https://x.com/.../status/... \
        backend/.venv/bin/python scripts/smoke.py
"""
import os
import sys

import httpx

base = os.environ.get("BASE_URL", "http://localhost:8000")
tweet = os.environ.get("TWEET_URL")
if not tweet:
    sys.exit("Set TWEET_URL to a public tweet that contains a video")

r = httpx.post(f"{base}/api/resolve", json={"url": tweet}, timeout=60)
print("resolve:", r.status_code)
r.raise_for_status()
data = r.json()
assert data["items"] and data["items"][0]["variants"], "no variants returned"
best = data["items"][0]["variants"][0]
print("best variant:", best["label"], best["url"][:60])

head = httpx.head(best["url"], timeout=30, follow_redirects=True)
print("variant HEAD:", head.status_code)
assert head.status_code == 200
print("smoke OK")
```

- [ ] **Step 3: Write README.md**

```markdown
# SaveVid AI

Twitter/X video downloader with none of the garbage. Paste a post link, see a preview,
pick a quality, download. No popups, no redirects, no fake download buttons, no tracking.

**Live site:** https://savevidai.app

## Why another downloader

Every existing Twitter video downloader is buried in popunders and fake buttons.
SaveVid AI is the opposite: open source, one passive ad slot at most (off by default),
and the download is never gated or delayed. The video streams straight from Twitter's
CDN to your browser; this server only resolves links.

## Features

- All available qualities with file sizes, best-first
- Preview card (author, text, thumbnail, duration) before you download
- Multi-video tweets and GIFs supported
- Clean filenames: `handle_tweetid_1080p.mp4`
- Keyboard-first: paste anywhere on the page and it just fetches
- Dark and light themes, fast, accessible, no cookies

## Self-host

```bash
docker run -p 8000:8000 ghcr.io/OWNER/savevidai:latest
```

Open http://localhost:8000. That's the whole setup.

Or deploy your own: use `render.yaml` (free tier) or `compose.yaml` + `Caddyfile`
on any VPS (edit the domain in the Caddyfile).

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

Twitter changes internals regularly. Nine times out of ten the fix is bumping yt-dlp:
update the `yt-dlp` floor in `backend/pyproject.toml`, run the smoke test, release.
See CONTRIBUTING for details.

## Traffic stats without tracking

There is no client-side analytics. On the VPS, Caddy writes a JSON access log;
run `goaccess /data/access.log --log-format=CADDY` for visitor counts.

## License

MIT
```

- [ ] **Step 4: Write CONTRIBUTING.md**

```markdown
# Contributing

## The most common fix: extraction broke

Twitter changed something and `/api/resolve` returns `upstream_error` for everything.

1. `pip install -U yt-dlp` in your venv and rerun the smoke test
   (`scripts/smoke.py`). If it passes, bump the floor in `backend/pyproject.toml`
   and open a PR titled `chore: bump yt-dlp`.
2. If the latest yt-dlp still fails, check the yt-dlp issue tracker for the
   Twitter extractor before debugging here; the fix almost always lands there.
3. If yt-dlp works but our mapping drops something, fix `backend/app/extractor.py`
   (`map_info` is pure and tested with fixture dicts; add a fixture reproducing
   the new shape).

## New error wording from Twitter

`backend/app/errors.py` maps yt-dlp message substrings to user-facing errors.
Add a pattern + test in `backend/tests/test_errors.py`.

## Dev setup and tests

See the Development section of the README. Both suites must pass in CI.
Frontend rule: no third-party requests at runtime; keep animations
transforms/opacity only and respect `prefers-reduced-motion`.

## Hard product rules

- Nothing may ever gate, delay, or interrupt a download (no countdown, no ad-unlock).
- No client-side tracking of any kind.
- Error messages stay specific and honest.
```

- [ ] **Step 5: Verify CI config locally where possible**

```bash
cd backend && source .venv/bin/activate && ruff check . && python -m pytest -q && deactivate && cd ..
cd frontend && npm run lint && npm test -- --run && npm run build && cd ..
```

Expected: everything green (mirrors what CI will run).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "ci: workflow, readme, contributing, live smoke script"
```

---

### Task 17: Full verification pass

**Files:** none created; this is the release gate.

- [ ] **Step 1: Run both suites clean**

```bash
cd backend && source .venv/bin/activate && python -m pytest -q && ruff check . && deactivate && cd ..
cd frontend && npm run lint && npm test -- --run && npm run build && cd ..
```

Expected: all green.

- [ ] **Step 2: End-to-end against real Twitter**

Run backend + frontend dev servers and verify with real URLs, one from each class:
a normal video tweet, a multi-video tweet, a GIF tweet, an x.com URL, an fxtwitter URL,
a deleted tweet (expect the honest 404 message), a text-only tweet (expect the no_video message).
Then run `scripts/smoke.py` against the local backend.

- [ ] **Step 3: Lighthouse gate**

With the production build served (`docker run -p 8000:8000 savevidai` or `npm run preview`),
run Lighthouse (Chrome DevTools) on the page. Expected: 95+ on Performance, Accessibility,
Best Practices, SEO. Fix regressions before calling the project done (common culprits:
missing image dimensions, contrast, unused JS).

- [ ] **Step 4: Commit any fixes and tag**

```bash
git add -A && git commit -m "fix: verification pass fixes" # only if changes were needed
git tag v0.1.0
```

(Do not push anywhere unless the user asks; publishing the repo is the user's call.)
