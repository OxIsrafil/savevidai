# TikTok Video Downloader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add TikTok (no-watermark) video download to SaveVid AI as a dedicated `/tiktokvideodownloader` page, behind a platform-routing layer, keeping the resolve-then-proxy model and per-platform analytics.

**Architecture:** A thin platform layer (`platforms.py`) detects the platform from the pasted URL and routes to the right resolver (existing `extractor.py` for Twitter, new `tiktok.py` for TikTok), both returning the same `ResolveResponse`. The proxy's SSRF lock widens from a single prefix to a per-platform host allowlist. The frontend gains a dedicated TikTok page (Vite entry, same pattern as `/admin`) and a `PlatformLinks` component for discoverability. Analytics gains a `platform` dimension.

**Tech Stack:** Python 3.12, FastAPI, httpx, pytest, respx. TypeScript, Vite 6, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-20-tiktok-downloader-design.md` (read before starting).

## Global Constraints

- Response shape is unchanged: every resolver returns `ResolveResponse(id, author, handle, avatar_url, text, items[MediaItem(index, kind, thumbnail, duration_seconds, variants[Variant(label, width, height, url, size_bytes)])])`.
- TikTok labels are exactly `hd` (no-watermark HD) and `sd` (no-watermark SD). The watermarked URL is never offered.
- Home (`/`) stays Twitter/X only in presentation; H1 "Twitter/X Video Downloader" is not changed.
- TikTok page slug is exactly `/tiktokvideodownloader`.
- Proxy host matching is exact-host or safe registrable-suffix (`host == d or host.endswith("." + d)`), NEVER substring. No redirect-follow. Preserve the existing semaphore/rate-limit/filename behavior.
- Cache keys are namespaced by platform: `f"{platform}:{id}"`.
- Analytics stays off unless configured; the platform-column migration must be idempotent and must never crash boot (the enablement block in `main.py` is already wrapped in try/except).
- `/api/event` quality validation must be exactly `^(\d{2,4}p|video|hd|sd)$`.
- No em dashes and no emoji in any user-facing copy (project rule).
- Backend commands run from `backend/` with the venv active (`source .venv/bin/activate`); frontend from `frontend/`. 3 pre-existing test warnings are expected; anything new is a finding.
- Conventional commit prefixes.

## File structure

Backend:
- Create `backend/app/tiktok.py` - TikTok resolver (`map_tiktok` pure + `extract_tiktok` network).
- Create `backend/app/platforms.py` - `detect_platform(url)` + `resolve_platform(url) -> (platform, ResolveResponse)`.
- Modify `backend/app/urls.py` - add `parse_tiktok_url`, TikTok host set.
- Modify `backend/app/resolve.py` - route via platform layer, namespaced cache, record platform.
- Modify `backend/app/proxy.py` - per-platform host allowlist.
- Modify `backend/app/analytics/store.py` - `platform` column + idempotent migration.
- Modify `backend/app/analytics/recorder.py` - `platform` in record/INSERT.
- Modify `backend/app/analytics/service.py` - thread `platform` through.
- Modify `backend/app/analytics/router.py` - widen quality regex, `platform` on events.
- Modify `backend/app/analytics/stats.py` - `platforms` breakdown.
- Modify `backend/app/main.py` - serve `GET /tiktokvideodownloader`.

Frontend:
- Create `frontend/tiktokvideodownloader.html` - TikTok page entry + crawlable SEO content.
- Create `frontend/src/tiktok/main.tsx`, `frontend/src/tiktok/TikTokApp.tsx` - TikTok page app (reuses existing components).
- Create `frontend/src/components/PlatformLinks.tsx` - platform cards row.
- Modify `frontend/vite.config.ts` - add the `tiktok` entry.
- Modify `frontend/src/App.tsx` - render `PlatformLinks`, pass `platform` to the visit beacon.
- Modify `frontend/src/lib/analytics.ts` - `sendEvent(type, opts)` with platform.
- Modify `frontend/src/admin/Admin.tsx` - render the platforms breakdown.
- Modify `frontend/public/sitemap.xml` - add the TikTok page.
- Modify `frontend/src/styles/index.css` - `.platform-links` styles.

---

### Task 1: TikTok URL parsing

**Files:**
- Modify: `backend/app/urls.py`
- Test: `backend/tests/test_urls.py`

**Interfaces:**
- Produces: `TIKTOK_HOSTS: set[str]`; `parse_tiktok_url(raw: str) -> str` returns a normalized `https://` TikTok URL when the host is allowed, else raises `InvalidTweetURL`. (Reuse the existing `InvalidTweetURL` exception name; it is the generic "bad URL" signal.)

- [ ] **Step 1: Write the failing tests** (append to `backend/tests/test_urls.py`)

```python
import pytest
from app.urls import InvalidTweetURL, parse_tiktok_url

TIKTOK_VALID = [
    "https://www.tiktok.com/@user/video/7280000000000000000",
    "https://tiktok.com/@user/video/7280000000000000000?is_from_webapp=1",
    "https://m.tiktok.com/v/7280000000000000000.html",
    "https://vm.tiktok.com/ZMabcдef/",  # short link, host-validated, resolver follows it
    "https://vt.tiktok.com/ZSabc123/",
    "tiktok.com/@user/video/7280000000000000000",  # scheme added
    "  https://www.tiktok.com/@user/video/7280000000000000000  ",
]
TIKTOK_INVALID = [
    "",
    "https://youtube.com/watch?v=abc",
    "https://tiktok.com.evil.com/@user/video/1",
    "https://eviltiktok.com/@user/video/1",
    "ftp://tiktok.com/@user/video/1",
    "https://x.com/jack/status/20",  # a tweet is not a TikTok
]


@pytest.mark.parametrize("url", TIKTOK_VALID)
def test_parse_tiktok_valid(url):
    out = parse_tiktok_url(url)
    assert out.startswith("https://")
    assert "tiktok.com" in out


@pytest.mark.parametrize("url", TIKTOK_INVALID)
def test_parse_tiktok_invalid(url):
    with pytest.raises(InvalidTweetURL):
        parse_tiktok_url(url)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_urls.py -k tiktok -v`
Expected: FAIL with `ImportError: cannot import name 'parse_tiktok_url'`

- [ ] **Step 3: Implement** (append to `backend/app/urls.py`)

```python
TIKTOK_HOSTS = {
    "tiktok.com", "www.tiktok.com", "m.tiktok.com",
    "vm.tiktok.com", "vt.tiktok.com",
}


def parse_tiktok_url(raw: str) -> str:
    """Validate the host is TikTok and return a normalized https URL.

    Unlike Twitter (which extracts a numeric ID), TikTok's resolver takes the
    URL directly and follows short links (vm./vt.). We host-allowlist first so
    an arbitrary user URL is never forwarded to the third-party resolver.
    """
    raw = raw.strip()
    if not raw:
        raise InvalidTweetURL("empty input")
    if "://" not in raw:
        raw = "https://" + raw
    parsed = urlparse(raw)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise InvalidTweetURL(raw)
    if parsed.hostname.lower() not in TIKTOK_HOSTS:
        raise InvalidTweetURL(raw)
    return raw if raw.startswith("https://") else raw.replace("http://", "https://", 1)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_urls.py -v`
Expected: all pass (existing tweet tests + new TikTok tests)

- [ ] **Step 5: Commit**

```bash
ruff check . && cd .. && git add backend/app/urls.py backend/tests/test_urls.py && git commit -m "feat: tiktok url host-allowlist parsing" && cd backend
```

---

### Task 2: Platform detection

**Files:**
- Create: `backend/app/platforms.py`
- Test: `backend/tests/test_platforms.py`

**Interfaces:**
- Consumes: `parse_tweet_url`, `parse_tiktok_url`, `TIKTOK_HOSTS`, `_HOSTS` (twitter) from `app.urls`.
- Produces: `detect_platform(url: str) -> str | None` returning `"twitter"`, `"tiktok"`, or `None`.

- [ ] **Step 1: Write the failing tests** (`backend/tests/test_platforms.py`)

```python
import pytest
from app.platforms import detect_platform

CASES = [
    ("https://x.com/jack/status/20", "twitter"),
    ("https://twitter.com/jack/status/20", "twitter"),
    ("https://fxtwitter.com/jack/status/20", "twitter"),
    ("https://www.tiktok.com/@u/video/7280000000000000000", "tiktok"),
    ("https://vm.tiktok.com/ZMabc/", "tiktok"),
    ("tiktok.com/@u/video/7280000000000000000", "tiktok"),
    ("https://youtube.com/watch?v=x", None),
    ("not a url", None),
    ("", None),
]


@pytest.mark.parametrize("url,expected", CASES)
def test_detect_platform(url, expected):
    assert detect_platform(url) == expected
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_platforms.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.platforms'`

- [ ] **Step 3: Implement** (`backend/app/platforms.py`)

```python
from urllib.parse import urlparse

from .urls import TIKTOK_HOSTS, _HOSTS


def detect_platform(url: str) -> str | None:
    """Return 'twitter' | 'tiktok' | None based purely on the URL host."""
    raw = (url or "").strip()
    if not raw:
        return None
    if "://" not in raw:
        raw = "https://" + raw
    parsed = urlparse(raw)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return None
    host = parsed.hostname.lower()
    if host in _HOSTS:
        return "twitter"
    if host in TIKTOK_HOSTS:
        return "tiktok"
    return None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_platforms.py -v`
Expected: 9 passed

- [ ] **Step 5: Commit**

```bash
ruff check . && cd .. && git add backend/app/platforms.py backend/tests/test_platforms.py && git commit -m "feat: platform detection from url host" && cd backend
```

---

### Task 3: TikTok resolver

**Files:**
- Create: `backend/app/tiktok.py`
- Test: `backend/tests/test_tiktok.py`

**Interfaces:**
- Consumes: `NOT_FOUND, NO_VIDEO, PRIVATE, UPSTREAM, AppError, app_error` from `app.errors`; `MediaItem, ResolveResponse, Variant` from `app.schemas`.
- Produces: `map_tiktok(url_id: str, body: dict) -> ResolveResponse` (pure); `extract_tiktok(url: str) -> ResolveResponse` (network); `TIKTOK_MEDIA_HOSTS: tuple[str, ...]` (the byte hosts the proxy must allow).

**Implementation note (verify the third-party contract):** the resolver targets the tikwm-style endpoint `https://www.tikwm.com/api/?url=<url>` which returns `{"code":0,"data":{"id","title","cover","duration","play","hdplay","wmplay","author":{"unique_id","nickname","avatar"}}}`. Before finalizing, the implementer must hit the real endpoint once with a public TikTok URL to confirm these keys and, critically, the HOST of `hdplay`/`play` (expected `www.tikwm.com`), then set `TIKTOK_MEDIA_HOSTS` and the fixture to match reality. Tests use fixtures only (no network).

- [ ] **Step 1: Write the failing tests** (`backend/tests/test_tiktok.py`)

```python
import pytest
from app.errors import AppError
from app.tiktok import map_tiktok

OK = {
    "code": 0,
    "data": {
        "id": "7280000000000000000",
        "title": "a caption",
        "cover": "https://www.tikwm.com/cover/x.jpg",
        "duration": 15,
        "play": "https://www.tikwm.com/video/media/play/x.mp4",
        "hdplay": "https://www.tikwm.com/video/media/hdplay/x.mp4",
        "wmplay": "https://www.tikwm.com/video/media/wmplay/x.mp4",
        "author": {"unique_id": "user", "nickname": "User Name", "avatar": "https://www.tikwm.com/a.jpg"},
    },
}
NO_VID = {"code": 0, "data": {"id": "1", "title": "", "author": {"unique_id": "u", "nickname": "U"}}}
ERR = {"code": -1, "msg": "url parse err"}


def test_map_ok_prefers_no_watermark_hd_then_sd():
    res = map_tiktok("7280000000000000000", OK)
    assert res.handle == "user"
    assert res.author == "User Name"
    assert res.text == "a caption"
    assert res.items[0].kind == "video"
    assert res.items[0].duration_seconds == 15
    labels = [v.label for v in res.items[0].variants]
    assert labels == ["hd", "sd"]
    # watermarked url is never present
    assert all("wmplay" not in v.url for v in res.items[0].variants)
    assert res.items[0].variants[0].url.endswith("/hdplay/x.mp4")


def test_map_no_video_raises():
    with pytest.raises(AppError) as exc:
        map_tiktok("1", NO_VID)
    assert exc.value.code == "no_video"


def test_map_error_code_raises_upstream():
    with pytest.raises(AppError) as exc:
        map_tiktok("1", ERR)
    assert exc.value.code in ("upstream_error", "not_found")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_tiktok.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.tiktok'`

- [ ] **Step 3: Implement** (`backend/app/tiktok.py`)

```python
"""Resolve TikTok posts to no-watermark video variants via a tikwm-style API.

The API takes the full TikTok URL (it follows vm./vt. short links itself) and
returns direct mp4 URLs on its own media host. Bytes therefore flow through
that host, so a resolver outage can break downloads, not just resolving; a
fallback resolver can be added here later (mirrors fxtwitter -> vxtwitter).
"""
import logging

import httpx

from .errors import NO_VIDEO, NOT_FOUND, UPSTREAM, AppError, app_error
from .schemas import MediaItem, ResolveResponse, Variant

logger = logging.getLogger("savevidai.tiktok")

_API = "https://www.tikwm.com/api/"
_UA = "SaveVidAI/1.0 (+https://savevidai.israfill.dev)"
# Byte hosts the /api/proxy allowlist must accept for TikTok. VERIFY against a
# real response before shipping and lock to exactly what is observed.
TIKTOK_MEDIA_HOSTS = ("tikwm.com",)


def extract_tiktok(url: str) -> ResolveResponse:
    try:
        resp = httpx.get(_API, params={"url": url, "hd": 1},
                         headers={"User-Agent": _UA}, timeout=12.0, follow_redirects=True)
    except httpx.HTTPError as exc:
        logger.warning("tiktok fetch failed for %s: %r", url, exc)
        raise app_error(UPSTREAM) from exc
    try:
        body = resp.json()
    except ValueError as exc:
        logger.warning("tiktok non-json for %s", url)
        raise app_error(UPSTREAM) from exc
    if not isinstance(body, dict):
        raise app_error(UPSTREAM)
    return map_tiktok(url, body)


def map_tiktok(url_id: str, body: dict) -> ResolveResponse:
    if body.get("code") != 0:
        msg = str(body.get("msg", "")).lower()
        if "not" in msg and ("found" in msg or "exist" in msg):
            raise app_error(NOT_FOUND)
        raise app_error(UPSTREAM)
    data = body.get("data")
    if not isinstance(data, dict):
        raise app_error(UPSTREAM)
    author = data.get("author") or {}
    variants: list[Variant] = []
    for key, label in (("hdplay", "hd"), ("play", "sd")):
        u = data.get(key)
        if isinstance(u, str) and u.startswith("https://"):
            variants.append(Variant(label=label, url=u))
    if not variants:
        raise app_error(NO_VIDEO)
    handle = author.get("unique_id") or "unknown"
    dur = data.get("duration")
    return ResolveResponse(
        id=str(data.get("id") or url_id),
        author=author.get("nickname") or handle,
        handle=handle,
        avatar_url=author.get("avatar"),
        text=(data.get("title") or "").strip(),
        items=[MediaItem(
            index=1, kind="video",
            thumbnail=data.get("cover"),
            duration_seconds=float(dur) if isinstance(dur, (int, float)) else None,
            variants=variants,
        )],
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_tiktok.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
ruff check . && cd .. && git add backend/app/tiktok.py backend/tests/test_tiktok.py && git commit -m "feat: tiktok no-watermark resolver (tikwm-style)" && cd backend
```

---

### Task 4: Analytics platform column + idempotent migration

**Files:**
- Modify: `backend/app/analytics/store.py`, `backend/app/analytics/recorder.py`
- Test: `backend/tests/test_store.py`, `backend/tests/test_recorder.py`

**Interfaces:**
- Produces: `events` table gains nullable `platform TEXT`; `SqliteStore`/`TursoStore` gain idempotent `_migrate()` called from `init_schema`; `Recorder.record(type, visitor, outcome=None, country=None, platform=None)`; `_INSERT` includes `platform`.

- [ ] **Step 1: Write the failing tests** (append to `backend/tests/test_store.py`)

```python
def test_platform_column_present_and_idempotent():
    from app.analytics.store import SqliteStore
    s = SqliteStore(":memory:")
    s.init_schema()
    s.init_schema()  # second call must not raise (migration idempotent)
    s.execute_many([(
        "INSERT INTO events (ts, type, outcome, country, visitor, platform) VALUES (?,?,?,?,?,?)",
        ["2026-07-20 10:00:00", "fetch", "ok", None, "vh", "tiktok"],
    )])
    rows = s.query("SELECT platform FROM events", [])
    assert rows[0]["platform"] == "tiktok"
```

And append to `backend/tests/test_recorder.py`:

```python
def test_record_writes_platform():
    from app.analytics.recorder import Recorder
    from app.analytics.store import SqliteStore
    s = SqliteStore(":memory:"); s.init_schema()
    r = Recorder(s)
    r.record("fetch", visitor="vh", outcome="ok", platform="tiktok")
    r.flush()
    assert s.query("SELECT platform FROM events", [])[0]["platform"] == "tiktok"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_store.py::test_platform_column_present_and_idempotent tests/test_recorder.py::test_record_writes_platform -v`
Expected: FAIL (no `platform` column / `record()` rejects `platform`)

- [ ] **Step 3: Implement**

In `backend/app/analytics/store.py`, add `platform TEXT` to the `CREATE TABLE` in `SCHEMA` and add an idempotent migration. Add this module-level helper and call it from both stores' `init_schema` after creating the schema:

```python
def _ensure_platform_column(existing_cols: set[str]) -> list[str]:
    """Return the ALTER statements needed to add the platform column, or []."""
    return [] if "platform" in existing_cols else ["ALTER TABLE events ADD COLUMN platform TEXT"]
```

`SqliteStore.init_schema` becomes:

```python
    def init_schema(self) -> None:
        with self._lock:
            for stmt in SCHEMA:
                self._conn.execute(stmt)
            cols = {r[1] for r in self._conn.execute("PRAGMA table_info(events)")}
            for stmt in _ensure_platform_column(cols):
                self._conn.execute(stmt)
            self._conn.commit()
```

For `TursoStore.init_schema`, run the `SCHEMA` statements, then read columns via `PRAGMA table_info(events)` through its query path and apply `_ensure_platform_column`. (Add `platform TEXT` to the base `CREATE TABLE` too, so fresh DBs never need the ALTER; the migration only fires on a pre-existing table.)

In `backend/app/analytics/recorder.py`:

```python
_INSERT = "INSERT INTO events (ts, type, outcome, country, visitor, platform) VALUES (?,?,?,?,?,?)"
```

```python
    def record(self, type: str, visitor: str, outcome: str | None = None,
               country: str | None = None, platform: str | None = None) -> None:
        ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        dropped = False
        with self._lock:
            if len(self._q) >= self._max:
                self._q.popleft()
                self.dropped += 1
                dropped = True
            self._q.append((ts, type, outcome, country, visitor, platform))
        if dropped:
            logger.warning("analytics queue full, dropped oldest event")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_store.py tests/test_recorder.py -v`
Expected: all pass (existing + 2 new)

- [ ] **Step 5: Commit**

```bash
ruff check . && cd .. && git add backend/app/analytics/store.py backend/app/analytics/recorder.py backend/tests/test_store.py backend/tests/test_recorder.py && git commit -m "feat: analytics platform column with idempotent migration" && cd backend
```

---

### Task 5: Thread platform through service + widen event validation

**Files:**
- Modify: `backend/app/analytics/service.py`, `backend/app/analytics/router.py`
- Test: `backend/tests/test_resolve_api.py` (analytics event tests) or `backend/tests/test_event_api.py`

**Interfaces:**
- Consumes: `Recorder.record(..., platform=...)`.
- Produces: `AnalyticsService.record_from_request(request, type, outcome, platform=None)`; `EventIn` gains optional `platform`; `_QUALITY_OK = re.compile(r"^(\d{2,4}p|video|hd|sd)$")`.

- [ ] **Step 1: Write the failing tests** (`backend/tests/test_event_api.py`)

```python
from fastapi.testclient import TestClient
import app.analytics.service as svc_mod
from app.analytics.config import AnalyticsConfig
from app.analytics.store import SqliteStore
from app.analytics.recorder import Recorder
from app.main import create_app


def _enable(monkeypatch):
    store = SqliteStore(":memory:"); store.init_schema()
    rec = Recorder(store)
    cfg = AnalyticsConfig(turso_url="x", turso_token="x", admin_password="pw", salt="s")
    svc_mod.service.init(cfg, store, rec)
    return store


def test_download_event_accepts_tiktok_labels(monkeypatch):
    store = _enable(monkeypatch)
    c = TestClient(create_app(), raise_server_exceptions=False)
    for q in ("hd", "sd", "1080p", "video"):
        assert c.post("/api/event", json={"type": "download", "quality": q, "platform": "tiktok"}).status_code == 204
    assert c.post("/api/event", json={"type": "download", "quality": "junk"}).status_code == 422
    svc_mod.service.recorder().flush()
    rows = store.query("SELECT platform, outcome FROM events WHERE type='download'", [])
    assert any(r["platform"] == "tiktok" and r["outcome"] == "hd" for r in rows)
    svc_mod.service.enabled = False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_event_api.py -v`
Expected: FAIL (quality `hd` rejected as 422, or `platform` not recorded)

- [ ] **Step 3: Implement**

In `service.py`, add `platform` param and pass it through:

```python
    def record_from_request(self, request: Request, type: str, outcome: str | None,
                            platform: str | None = None) -> None:
        if not self.enabled:
            return
        try:
            country = request.headers.get("cf-ipcountry") or None
            if country in ("XX", "T1"):
                country = None
            self._recorder.record(type, visitor=self._visitor(request),
                                  outcome=outcome, country=country, platform=platform)
        except Exception:
            logger.warning("analytics record_from_request failed", exc_info=True)
```

In `router.py`: widen the regex and thread platform on the event:

```python
_QUALITY_OK = re.compile(r"^(\d{2,4}p|video|hd|sd)$")
```

```python
class EventIn(BaseModel):
    type: str
    quality: str | None = None
    platform: str | None = None

    @field_validator("type")
    @classmethod
    def _type(cls, v: str) -> str:
        if v not in ("visit", "download"):
            raise ValueError("bad type")
        return v

    @field_validator("quality")
    @classmethod
    def _quality(cls, v):
        if v is not None and not _QUALITY_OK.match(v):
            raise ValueError("bad quality")
        return v

    @field_validator("platform")
    @classmethod
    def _platform(cls, v):
        if v is not None and v not in ("twitter", "tiktok"):
            raise ValueError("bad platform")
        return v
```

```python
@router.post("/api/event", status_code=204)
@limiter.limit("30/minute")
def event(request: Request, payload: EventIn) -> Response:
    _require_enabled()
    outcome = payload.quality if payload.type == "download" else None
    service.record_from_request(request, payload.type, outcome, platform=payload.platform)
    return Response(status_code=204)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_event_api.py -v && python -m pytest -q`
Expected: new test passes; full suite green

- [ ] **Step 5: Commit**

```bash
ruff check . && cd .. && git add backend/app/analytics/service.py backend/app/analytics/router.py backend/tests/test_event_api.py && git commit -m "feat: analytics events carry platform; accept tiktok quality labels" && cd backend
```

---

### Task 6: Route resolve through the platform layer

**Files:**
- Modify: `backend/app/resolve.py`
- Test: `backend/tests/test_resolve_api.py`

**Interfaces:**
- Consumes: `detect_platform`, `parse_tweet_url`, `parse_tiktok_url`, `extract` (twitter), `extract_tiktok`, `record_from_request(..., platform=...)`.
- Produces: `/api/resolve` handling both platforms, cache keyed `f"{platform}:{id}"`, fetch events tagged with platform.

- [ ] **Step 1: Write the failing tests** (append to `backend/tests/test_resolve_api.py`)

```python
import app.resolve as resolve_mod
from app.schemas import MediaItem, ResolveResponse, Variant

TT = ResolveResponse(id="7280000000000000000", author="User", handle="user", avatar_url=None,
    text="cap", items=[MediaItem(index=1, kind="video", thumbnail=None, duration_seconds=15,
        variants=[Variant(label="hd", url="https://www.tikwm.com/v/hd.mp4")])])


def test_resolve_routes_tiktok(monkeypatch, client):
    monkeypatch.setattr(resolve_mod, "extract_tiktok", lambda url: TT)
    r = client.post("/api/resolve", json={"url": "https://www.tiktok.com/@user/video/7280000000000000000"})
    assert r.status_code == 200
    assert r.json()["items"][0]["variants"][0]["label"] == "hd"


def test_resolve_rejects_unknown_platform(client):
    r = client.post("/api/resolve", json={"url": "https://youtube.com/watch?v=x"})
    assert r.status_code == 422
    assert r.json()["error"] == "invalid_url"
```

(The `client` fixture in this file monkeypatches `resolve_mod.cache`, `fill_sizes`, and `extract`. Reuse it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_resolve_api.py -k tiktok -v`
Expected: FAIL (TikTok URL currently hits `parse_tweet_url` and 422s as invalid, or `extract_tiktok` not imported)

- [ ] **Step 3: Implement** (rewrite `backend/app/resolve.py`)

```python
from fastapi import APIRouter, Request

from .analytics.service import service as analytics
from .cache import TTLCache
from .errors import INVALID_URL, AppError, app_error
from .extractor import extract
from .limits import limiter
from .platforms import detect_platform
from .schemas import ResolveRequest, ResolveResponse
from .sizes import fill_sizes
from .tiktok import extract_tiktok
from .urls import InvalidTweetURL, parse_tiktok_url, parse_tweet_url

router = APIRouter()
cache = TTLCache(maxsize=512, ttl=3600.0)


@router.post("/api/resolve", response_model=ResolveResponse)
@limiter.limit("10/minute")
def resolve(request: Request, payload: ResolveRequest) -> ResolveResponse:
    platform = detect_platform(payload.url)
    if platform is None:
        analytics.record_from_request(request, "fetch", "invalid_url")
        raise app_error(INVALID_URL)
    try:
        if platform == "twitter":
            key = f"twitter:{parse_tweet_url(payload.url)}"
            resolver = lambda: extract(key.split(':', 1)[1])
        else:
            tiktok_url = parse_tiktok_url(payload.url)
            key = f"tiktok:{tiktok_url}"
            resolver = lambda: extract_tiktok(tiktok_url)
    except InvalidTweetURL as exc:
        analytics.record_from_request(request, "fetch", "invalid_url", platform=platform)
        raise app_error(INVALID_URL) from exc
    try:
        cached = cache.get(key)
        if cached is not None:
            analytics.record_from_request(request, "fetch", "ok", platform=platform)
            return cached
        result = resolver()
        fill_sizes(result)
        cache.set(key, result)
    except AppError as exc:
        analytics.record_from_request(request, "fetch", exc.code, platform=platform)
        raise
    analytics.record_from_request(request, "fetch", "ok", platform=platform)
    return result
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_resolve_api.py -v`
Expected: all pass (existing twitter tests + new tiktok routing)

- [ ] **Step 5: Commit**

```bash
ruff check . && cd .. && git add backend/app/resolve.py backend/tests/test_resolve_api.py && git commit -m "feat: resolve routes by platform, namespaced cache, platform-tagged fetch events" && cd backend
```

---

### Task 7: Widen the proxy host allowlist

**Files:**
- Modify: `backend/app/proxy.py`
- Test: `backend/tests/test_proxy_api.py`

**Interfaces:**
- Consumes: `TIKTOK_MEDIA_HOSTS` from `app.tiktok`.
- Produces: `_allowed_host(url) -> bool` using exact-or-suffix matching over a per-platform host set; proxy accepts twimg + TikTok hosts, rejects everything else.

- [ ] **Step 1: Write the failing tests** (append to `backend/tests/test_proxy_api.py`)

```python
def test_proxy_allows_tiktok_host():
    import respx, httpx
    with respx.mock:
        respx.get("https://www.tikwm.com/video/media/hdplay/x.mp4").mock(
            return_value=httpx.Response(200, content=b"vid", headers={"content-length": "3"}))
        res = client().get("/api/proxy", params={"url": "https://www.tikwm.com/video/media/hdplay/x.mp4"})
        assert res.status_code == 200
        assert res.content == b"vid"


def test_proxy_rejects_tiktok_lookalike():
    res = client().get("/api/proxy", params={"url": "https://tikwm.com.evil.com/x.mp4"})
    assert res.status_code == 403
    res2 = client().get("/api/proxy", params={"url": "https://evil.com/x.mp4"})
    assert res2.status_code == 403
```

(Keep the existing tests: `video.twimg.com` still allowed, `video.twimg.com.evil.com` still 403, control-char URL still 502 with no semaphore leak.)

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_proxy_api.py -k tiktok -v`
Expected: FAIL (tikwm host currently 403)

- [ ] **Step 3: Implement** (edit `backend/app/proxy.py`)

Replace the prefix check with host allowlisting. Add near the top:

```python
from urllib.parse import urlparse

from .tiktok import TIKTOK_MEDIA_HOSTS

# Exact hosts or registrable suffixes allowed as download sources. Suffix match
# is boundary-safe (host == d or host endswith "." + d), never substring, so
# "video.twimg.com.evil.com" and "tikwm.com.evil.com" are rejected.
_ALLOWED_HOSTS = ("video.twimg.com", *TIKTOK_MEDIA_HOSTS)


def _allowed_host(url: str) -> bool:
    if not url.startswith("https://"):
        return False
    try:
        host = (urlparse(url).hostname or "").lower()
    except ValueError:
        return False
    return any(host == d or host.endswith("." + d) for d in _ALLOWED_HOSTS)
```

Replace the guard in `proxy()`:

```python
    if not _allowed_host(url):
        raise AppError("forbidden_url", "This URL host is not allowed.", 403)
```

Remove the now-unused `_ALLOWED_PREFIX`. Everything else (semaphore, rate limit, filename sanitize, no redirect-follow, streaming) is unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_proxy_api.py -v`
Expected: all pass (existing twimg + lookalike + control-char, plus new TikTok)

- [ ] **Step 5: Commit**

```bash
ruff check . && cd .. && git add backend/app/proxy.py backend/tests/test_proxy_api.py && git commit -m "feat: proxy per-platform host allowlist (twimg + tiktok), suffix-safe" && cd backend
```

---

### Task 8: Stats platforms breakdown

**Files:**
- Modify: `backend/app/analytics/stats.py`
- Test: `backend/tests/test_stats.py`

**Interfaces:**
- Produces: `compute_stats(...)` output gains a `platforms` key: `[{"platform": str, "fetches": int, "downloads": int}]` over the window.

- [ ] **Step 1: Write the failing test** (append to `backend/tests/test_stats.py`)

```python
def test_stats_platforms_breakdown():
    from app.analytics.store import SqliteStore
    from app.analytics.stats import compute_stats
    s = SqliteStore(":memory:"); s.init_schema()
    rows = [
        ("2026-07-20 10:00:00", "fetch", "ok", None, "v1", "twitter"),
        ("2026-07-20 10:01:00", "fetch", "ok", None, "v2", "tiktok"),
        ("2026-07-20 10:02:00", "download", "hd", None, "v2", "tiktok"),
    ]
    s.execute_many([("INSERT INTO events (ts,type,outcome,country,visitor,platform) VALUES (?,?,?,?,?,?)", list(r)) for r in rows])
    out = compute_stats(s, days=30, tz=0)
    by = {p["platform"]: p for p in out["platforms"]}
    assert by["twitter"]["fetches"] == 1
    assert by["tiktok"]["fetches"] == 1
    assert by["tiktok"]["downloads"] == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_stats.py::test_stats_platforms_breakdown -v`
Expected: FAIL with `KeyError: 'platforms'`

- [ ] **Step 3: Implement**

In `compute_stats` (`backend/app/analytics/stats.py`), add a query grouping fetch/download counts by platform within the window, and include it in the returned dict as `platforms`. Use the same `window` local-time filter already used by the other queries:

```python
    platform_rows = store.query(
        f"SELECT platform, "
        f"SUM(CASE WHEN type='fetch' THEN 1 ELSE 0 END) AS fetches, "
        f"SUM(CASE WHEN type='download' THEN 1 ELSE 0 END) AS downloads "
        f"FROM events WHERE {window} AND platform IS NOT NULL "
        f"GROUP BY platform ORDER BY fetches DESC", [])
    platforms = [{"platform": r["platform"], "fetches": r["fetches"] or 0,
                  "downloads": r["downloads"] or 0} for r in platform_rows]
```

Add `"platforms": platforms,` to the returned dict.

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_stats.py -v`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
ruff check . && cd .. && git add backend/app/analytics/stats.py backend/tests/test_stats.py && git commit -m "feat: stats per-platform fetch/download breakdown" && cd backend
```

---

### Task 9: PlatformLinks component + analytics platform arg (home integration)

Build the shared frontend primitives first (the TikTok page in Task 10 consumes both).

**Files:**
- Create: `frontend/src/components/PlatformLinks.tsx`
- Modify: `frontend/src/lib/analytics.ts`, `frontend/src/App.tsx`, `frontend/src/components/QualityButton.tsx`, `frontend/src/components/PreviewCard.tsx`, `frontend/src/styles/index.css`
- Test: `frontend/src/components/PlatformLinks.test.tsx`, update `frontend/src/App.test.tsx`

**Interfaces:**
- Produces: `PlatformLinks({ active }: { active: "twitter" | "tiktok" })`; `sendEvent(type, opts?: { quality?: string; platform?: string })`; a `platform` prop threaded through `PreviewCard` -> `QualityButton` (default `"twitter"`).

- [ ] **Step 1: Update the beacon** (`frontend/src/lib/analytics.ts`)

```ts
export function sendEvent(type: "visit" | "download", opts: { quality?: string; platform?: string } = {}): void {
  try {
    const body = JSON.stringify({ type, ...opts });
    void fetch("/api/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // never throw into UX
  }
}
```

Update callers: `App.tsx` visit -> `sendEvent("visit", { platform: "twitter" })`. Thread a `platform?: "twitter" | "tiktok"` prop (default `"twitter"`) through `PreviewCard` into `QualityButton`, and change the download beacon in `QualityButton` to `sendEvent("download", { quality: variant.label, platform })`.

- [ ] **Step 2: Write the failing test** (`frontend/src/components/PlatformLinks.test.tsx`)

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { PlatformLinks } from "./PlatformLinks";

test("shows the active platform and links to the others", () => {
  render(<PlatformLinks active="twitter" />);
  const tiktok = screen.getByRole("link", { name: /tiktok/i });
  expect(tiktok).toHaveAttribute("href", "/tiktokvideodownloader");
  // active one is not a link
  expect(screen.queryByRole("link", { name: /twitter|x video/i })).toBeNull();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- --run src/components/PlatformLinks.test.tsx`
Expected: FAIL (module `./PlatformLinks` not found)

- [ ] **Step 4: Implement** (`frontend/src/components/PlatformLinks.tsx`)

```tsx
type Platform = "twitter" | "tiktok";
const PLATFORMS: { key: Platform; label: string; href: string }[] = [
  { key: "twitter", label: "Twitter / X", href: "/" },
  { key: "tiktok", label: "TikTok", href: "/tiktokvideodownloader" },
];

export function PlatformLinks({ active }: { active: Platform }) {
  return (
    <nav className="platform-links" aria-label="Choose a platform">
      {PLATFORMS.map((p) =>
        p.key === active ? (
          <span key={p.key} className="platform-card active" aria-current="page">
            {p.label}
          </span>
        ) : (
          <a key={p.key} className="platform-card" href={p.href}>
            {p.label} downloader
          </a>
        ),
      )}
    </nav>
  );
}
```

Add `.platform-links` / `.platform-card` styles to `styles/index.css` using the existing tokens (pill/card look, accent border/fill on the active one, hover lift on the links). In `App.tsx`, render `<PlatformLinks active="twitter" />` in the area directly under the hero caption and above `<HowToVisual />` (the marked spot), and add a compact TikTok link to the top nav (e.g. next to the existing `Download` button, an `<a href="/tiktokvideodownloader">TikTok</a>` styled like the nav meta). Update `App.test.tsx` so the visit-beacon assertion expects the `{platform:"twitter"}` body and add an assertion that a link to `/tiktokvideodownloader` is present.

- [ ] **Step 5: Run tests + build**

Run: `npm test -- --run` (PlatformLinks + updated App tests pass) and `npm run build`.
Expected: green; all entries build.

- [ ] **Step 6: Commit**

```bash
cd .. && git add frontend/src/components/PlatformLinks.tsx frontend/src/components/PlatformLinks.test.tsx frontend/src/lib/analytics.ts frontend/src/App.tsx frontend/src/App.test.tsx frontend/src/styles/index.css frontend/src/components/QualityButton.tsx frontend/src/components/PreviewCard.tsx && git commit -m "feat: platform-links component, top-nav link, per-platform download beacons"
```

---

### Task 10: TikTok page (Vite entry + FastAPI route)

**Files:**
- Create: `frontend/tiktokvideodownloader.html`, `frontend/src/tiktok/main.tsx`, `frontend/src/tiktok/TikTokApp.tsx`
- Modify: `frontend/vite.config.ts`, `backend/app/main.py`, `frontend/public/sitemap.xml`
- Test: `frontend/src/tiktok/TikTokApp.test.tsx`

**Interfaces:**
- Consumes: existing `PasteInput`, `SkeletonCard`, `PreviewCard`, `ThemeToggle` components; `useResolve` hook; `PlatformLinks` and the `sendEvent(type, opts)` signature (both from Task 9).
- Produces: a page served at `GET /tiktokvideodownloader`.

- [ ] **Step 1: Add the Vite entry** (`frontend/vite.config.ts`, inside `rollupOptions.input`)

```ts
      input: {
        main: entry("./index.html"),
        admin: entry("./admin.html"),
        tiktok: entry("./tiktokvideodownloader.html"),
      },
```

- [ ] **Step 2: Write the page HTML** (`frontend/tiktokvideodownloader.html`)

Copy `index.html`'s exact head skeleton and body scaffold, changing only: `<title>TikTok Video Downloader - No Watermark, Free | SaveVid AI</title>`, the meta description (TikTok, no watermark, free), canonical + OG url `https://savevidai.israfill.dev/tiktokvideodownloader`, and the crawlable static sections to TikTok-specific copy (how-to: open the TikTok post, tap Share then Copy link, paste, download; FAQ: no watermark yes, free yes, slideshows "not yet", is it safe). Mount `<div id="root"></div>` and `<script type="module" src="/src/tiktok/main.tsx"></script>`. No emoji, no em dashes.

- [ ] **Step 3: Write the TikTok app** (`frontend/src/tiktok/TikTokApp.tsx` + `main.tsx`)

A page scoped to TikTok, structured like `App.tsx` but trimmed: nav (brand + ThemeToggle + a link back to `/`), hero H1 "TikTok Video Downloader", subhead "Paste a TikTok link, get it without the watermark, in seconds.", `<PlatformLinks active="tiktok" />` under the caption, `PasteInput` (placeholder "Paste a TikTok video link"), results area rendering `<SkeletonCard />` while resolving and `<PreviewCard data={state.data} platform="tiktok" />` when ready. Fire `sendEvent("visit", { platform: "tiktok" })` once on mount (module-level `visitSent` guard, same pattern as `App.tsx`). Reuse `useResolve` unchanged (backend auto-detects). `frontend/src/tiktok/main.tsx` mirrors `src/admin/main.tsx` exactly (createRoot + MotionConfig + `./TikTokApp` + `../styles/index.css`).

- [ ] **Step 4: Serve it from FastAPI** (`backend/app/main.py`, add inside `create_app` before the static mount)

```python
    @app.get("/tiktokvideodownloader")
    def tiktok_page():
        from fastapi import HTTPException
        from fastapi.responses import FileResponse
        sd = os.environ.get("STATIC_DIR", "")
        path = os.path.join(sd, "tiktokvideodownloader.html")
        if sd and os.path.isfile(path):
            return FileResponse(path)
        raise HTTPException(status_code=404)
```

Add a `<url><loc>https://savevidai.israfill.dev/tiktokvideodownloader</loc></url>` entry to `frontend/public/sitemap.xml`.

- [ ] **Step 5: Write and run the test** (`frontend/src/tiktok/TikTokApp.test.tsx`)

```tsx
import { render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import TikTokApp from "./TikTokApp";

afterEach(() => vi.unstubAllGlobals());

test("renders the TikTok downloader page", () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
  render(<TikTokApp />);
  expect(screen.getByRole("heading", { name: /tiktok video downloader/i })).toBeInTheDocument();
  expect(screen.getByRole("textbox")).toHaveAttribute("placeholder", expect.stringMatching(/tiktok/i));
});
```

Run: `npm test -- --run` (passes) and `npm run build` (emits `dist/tiktokvideodownloader.html`; the home `main-*.js` chunk is byte-identical, verify no tiktok code leaked into it).

- [ ] **Step 6: Commit**

```bash
cd .. && git add frontend/tiktokvideodownloader.html frontend/src/tiktok frontend/vite.config.ts frontend/public/sitemap.xml backend/app/main.py && git commit -m "feat: dedicated /tiktokvideodownloader page"
```

---

### Task 11: Dashboard platforms breakdown

**Files:**
- Modify: `frontend/src/admin/Admin.tsx`, `frontend/src/admin/api.ts` (types)
- Test: `frontend/src/admin/Admin.test.tsx`

**Interfaces:**
- Consumes: `stats.platforms: {platform, fetches, downloads}[]`.

- [ ] **Step 1: Add the type** (`frontend/src/admin/api.ts`)

Add `platforms: { platform: string; fetches: number; downloads: number }[]` to the `Stats` type.

- [ ] **Step 2: Write the failing test** (add to `frontend/src/admin/Admin.test.tsx`)

Extend the stats fixture with `platforms: [{platform:"twitter",fetches:10,downloads:8},{platform:"tiktok",fetches:4,downloads:3}]`, log in, and assert a "By platform" panel renders both `twitter` and `tiktok` with their counts.

- [ ] **Step 3: Implement**

Add a "By platform" panel to `Admin.tsx` (reuse the existing `BarList`/panel style) rendering `stats.platforms` (label = platform, value = fetches, with downloads shown alongside). Empty array renders "No data yet."

- [ ] **Step 4: Run tests + build**

Run: `npm test -- --run` and `npm run build`. Expected: green.

- [ ] **Step 5: Commit**

```bash
cd .. && git add frontend/src/admin/Admin.tsx frontend/src/admin/api.ts frontend/src/admin/Admin.test.tsx && git commit -m "feat: dashboard per-platform breakdown panel"
```

---

### Task 12: Full verification

**Files:** none created; release gate.

- [ ] **Step 1: Backend suite + lint**

```bash
cd backend && source .venv/bin/activate && python -m pytest -q && ruff check . && deactivate && cd ..
```
Expected: all green (only the 3 pre-existing warnings).

- [ ] **Step 2: Frontend suite + build (all entries)**

```bash
cd frontend && npm test -- --run && npm run build && ls dist/*.html && cd ..
```
Expected: tests pass; `dist/` has `index.html`, `admin.html`, `tiktokvideodownloader.html`; home JS chunk unchanged (no admin/tiktok code in it).

- [ ] **Step 3: Live TikTok resolve (real third party)**

Run the combined dev server (`sh scripts/dev.sh`), then:
```bash
curl -s -m 30 -X POST http://localhost:8000/api/resolve -H 'Content-Type: application/json' \
  -d '{"url":"<a real public TikTok video URL>"}' | head -c 300
```
Expected: JSON with `handle`, `items[0].variants` containing `hd`/`sd` no-watermark URLs. Confirm the variant host matches `TIKTOK_MEDIA_HOSTS`; if the resolver returns a different byte host than `tikwm.com`, update `TIKTOK_MEDIA_HOSTS` in `tiktok.py` and the proxy test, then re-run Task 7.

- [ ] **Step 4: Live download through the proxy**

```bash
curl -s -m 60 -o /tmp/tt.mp4 -w "%{http_code} %{size_download}\n" \
  "http://localhost:8000/api/proxy?url=<the hd url from step 3>&filename=test.mp4"
file /tmp/tt.mp4 && rm -f /tmp/tt.mp4
```
Expected: 200, non-trivial size, `file` reports an MP4/ISO media container.

- [ ] **Step 5: Page + discoverability check**

Open the dev site, confirm `/tiktokvideodownloader` renders with the TikTok hero and FAQ, the platform-links row appears under the hero on both `/` and `/tiktokvideodownloader` with the correct active state and working cross-links, and a real TikTok URL resolves + downloads end to end in the browser.

- [ ] **Step 6: Commit any verification fixes and finish**

```bash
git add -A && git commit -m "fix: tiktok verification-pass fixes"  # only if changes were needed
```
Then merge readiness is judged by the whole-branch review (subagent-driven-development's final step). Do not push or deploy without the owner; deploying Reddit's ffmpeg is a separate build.
