# Ads Monetization + Closed-Source Copy Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Server-injected ad slots (banner + popunder, Adsterra-first, network-agnostic) that ship dark by default, plus a sweep removing every now-false "open source / no popups / no ads / no tracking" claim from the site.

**Architecture:** A new `backend/app/pages.py` renders the three public HTML shells, replacing a `<!--ADS-->` marker line with configured snippets (or removing it entirely when ads are off), cached per (path, mtime_ns). Ad config loads once per `create_app()` from three env vars via a shared `env_truthy` helper. Explicit FastAPI routes (registered before the static mount, so they win) cover the clean URLs AND the raw `.html` paths so the marker can never leak. `/admin` stays on its existing explicit route in `analytics/router.py` and never touches the renderer.

**Tech Stack:** Python 3.12 / FastAPI / pytest (backend), static HTML + React/Vite (frontend), Pillow for OG image regeneration.

**Spec:** `docs/superpowers/specs/2026-07-24-ads-monetization-design.md` (rev 2, approved; do not re-litigate).

## Global Constraints

- NO em dashes, NO emoji anywhere (code, comments, UI copy, commits, docs). Use hyphen/comma/colon.
- Conventional commit prefixes; end every commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Backend warning baseline is 7; any NEW warning is a finding. `ruff check app tests` must be clean (run from repo root: `ruff check backend`).
- Branch is `feature/ads-monetization` (already checked out). Never commit to `main`.
- Backend commands run from `backend/` with the venv active (`source .venv/bin/activate`). Frontend commands run from `frontend/`.
- Pinned by spec: ads ship dark (no env vars set = rendered HTML identical to the on-disk file minus the marker line); `/admin`, `/admin.html`, and `/api/*` never contain ad code; banner-only mode = `ADS_ENABLED=1` with `AD_POPUNDER_SNIPPET` empty; our code never delays or gates the download flow (do not touch resolve/proxy/mux or any download UI logic).
- Owner voice for user-facing copy: lowercase-leaning, human, direct.

---

### Task 1: Ad config, `env_truthy`, and the page renderer (`pages.py`)

**Files:**
- Create: `backend/app/envutil.py`
- Create: `backend/app/pages.py`
- Modify: `backend/app/main.py` (only the `_maintenance_on` helper, lines ~23-29)
- Modify: `compose.prod.yaml` (env_file block, lines 13-14)
- Modify: `deploy/app.env.example` (append ads section)
- Test: `backend/tests/test_pages.py` (new), `backend/tests/test_maintenance.py` (must keep passing unchanged)

**Interfaces:**
- Consumes: nothing new; `os.environ` for `ADS_ENABLED`, `AD_BANNER_SNIPPET`, `AD_POPUNDER_SNIPPET`, `STATIC_DIR`.
- Produces (Task 2 relies on these exact names):
  - `envutil.env_truthy(name: str) -> bool`
  - `pages.AdConfig` (frozen dataclass: `enabled: bool, banner: str, popunder: str`, property `active: bool`)
  - `pages.load_ad_config() -> AdConfig`
  - `pages.PageRenderer(ads: AdConfig)` with method `render(filename: str) -> HTMLResponse` (raises `HTTPException(404)` when STATIC_DIR unset or file missing)
  - `pages.MARKER == "<!--ADS-->"`

- [ ] **Step 1: Write the failing unit tests**

Create `backend/tests/test_pages.py`:

```python
import os

import pytest
from fastapi import HTTPException

from app.envutil import env_truthy
from app.pages import AdConfig, PageRenderer, load_ad_config

BANNER = '<script src="https://example-ads.test/banner.js"></script>'
POP = '<script src="https://example-ads.test/pop.js"></script>'

PAGE = "<!doctype html>\n<html><body>\n<p>hello</p>\n<!--ADS-->\n</body></html>\n"
PAGE_NO_MARKER = "<!doctype html>\n<html><body>\n<p>hello</p>\n</body></html>\n"


def _write(tmp_path, name, content=PAGE):
    p = tmp_path / name
    p.write_text(content)
    return p


def test_env_truthy_accepts_the_truthy_set(monkeypatch):
    for v in ("1", "true", "YES", " on "):
        monkeypatch.setenv("X_FLAG", v)
        assert env_truthy("X_FLAG") is True
    for v in ("", "0", "false", "off", "nope"):
        monkeypatch.setenv("X_FLAG", v)
        assert env_truthy("X_FLAG") is False
    monkeypatch.delenv("X_FLAG")
    assert env_truthy("X_FLAG") is False


def test_load_ad_config_reads_env(monkeypatch):
    monkeypatch.setenv("ADS_ENABLED", "1")
    monkeypatch.setenv("AD_BANNER_SNIPPET", BANNER)
    monkeypatch.setenv("AD_POPUNDER_SNIPPET", POP)
    cfg = load_ad_config()
    assert cfg == AdConfig(enabled=True, banner=BANNER, popunder=POP)
    assert cfg.active is True


def test_ad_config_enabled_but_empty_is_inactive():
    assert AdConfig(enabled=True, banner="", popunder="").active is False
    assert AdConfig(enabled=False, banner=BANNER, popunder=POP).active is False


def test_render_off_strips_the_whole_marker_line(tmp_path, monkeypatch):
    _write(tmp_path, "index.html")
    monkeypatch.setenv("STATIC_DIR", str(tmp_path))
    r = PageRenderer(AdConfig(enabled=False, banner="", popunder=""))
    body = r.render("index.html").body.decode()
    assert "<!--ADS-->" not in body
    assert "ad-slot" not in body
    # The rendered output equals the file with the marker LINE removed.
    assert body == PAGE.replace("<!--ADS-->\n", "")


def test_render_on_injects_banner_and_popunder(tmp_path, monkeypatch):
    _write(tmp_path, "index.html")
    monkeypatch.setenv("STATIC_DIR", str(tmp_path))
    r = PageRenderer(AdConfig(enabled=True, banner=BANNER, popunder=POP))
    body = r.render("index.html").body.decode()
    assert f'<div class="ad-slot">{BANNER}</div>' in body
    assert POP in body
    assert "<!--ADS-->" not in body


def test_render_banner_only(tmp_path, monkeypatch):
    _write(tmp_path, "index.html")
    monkeypatch.setenv("STATIC_DIR", str(tmp_path))
    r = PageRenderer(AdConfig(enabled=True, banner=BANNER, popunder=""))
    body = r.render("index.html").body.decode()
    assert "ad-slot" in body
    assert POP not in body


def test_render_enabled_but_both_empty_matches_off(tmp_path, monkeypatch):
    _write(tmp_path, "index.html")
    monkeypatch.setenv("STATIC_DIR", str(tmp_path))
    on = PageRenderer(AdConfig(enabled=True, banner="", popunder=""))
    off = PageRenderer(AdConfig(enabled=False, banner="", popunder=""))
    assert on.render("index.html").body == off.render("index.html").body


def test_render_markerless_file_served_unchanged(tmp_path, monkeypatch):
    _write(tmp_path, "index.html", PAGE_NO_MARKER)
    monkeypatch.setenv("STATIC_DIR", str(tmp_path))
    r = PageRenderer(AdConfig(enabled=True, banner=BANNER, popunder=POP))
    assert r.render("index.html").body.decode() == PAGE_NO_MARKER


def test_render_404_without_static_dir(monkeypatch):
    monkeypatch.delenv("STATIC_DIR", raising=False)
    r = PageRenderer(AdConfig(enabled=False, banner="", popunder=""))
    with pytest.raises(HTTPException) as e:
        r.render("index.html")
    assert e.value.status_code == 404


def test_render_404_missing_file(tmp_path, monkeypatch):
    monkeypatch.setenv("STATIC_DIR", str(tmp_path))
    r = PageRenderer(AdConfig(enabled=False, banner="", popunder=""))
    with pytest.raises(HTTPException):
        r.render("nope.html")


def test_render_cache_refreshes_on_mtime_bump(tmp_path, monkeypatch):
    p = _write(tmp_path, "index.html")
    monkeypatch.setenv("STATIC_DIR", str(tmp_path))
    r = PageRenderer(AdConfig(enabled=False, banner="", popunder=""))
    first = r.render("index.html").body.decode()
    assert "hello" in first
    p.write_text(PAGE.replace("hello", "changed"))
    st = os.stat(p)
    os.utime(p, ns=(st.st_atime_ns, st.st_mtime_ns + 1_000_000))
    second = r.render("index.html").body.decode()
    assert "changed" in second


def test_render_cache_serves_cached_at_same_mtime(tmp_path, monkeypatch):
    p = _write(tmp_path, "index.html")
    monkeypatch.setenv("STATIC_DIR", str(tmp_path))
    r = PageRenderer(AdConfig(enabled=False, banner="", popunder=""))
    r.render("index.html")
    st = os.stat(p)
    # Rewrite content but force the mtime back to the cached value: the
    # renderer must serve the cached body (proves it is not re-reading disk).
    p.write_text(PAGE.replace("hello", "sneaky"))
    os.utime(p, ns=(st.st_atime_ns, st.st_mtime_ns))
    assert "hello" in r.render("index.html").body.decode()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_pages.py -q`
Expected: FAIL at import (`ModuleNotFoundError: No module named 'app.envutil'`).

- [ ] **Step 3: Implement `envutil.py` and `pages.py`**

Create `backend/app/envutil.py`:

```python
import os

_TRUTHY = ("1", "true", "yes", "on")


def env_truthy(name: str) -> bool:
    """Shared truthy parsing for feature-flag env vars (MAINTENANCE_MODE,
    ADS_ENABLED). One definition so the flags cannot drift apart."""
    return os.environ.get(name, "").strip().lower() in _TRUTHY
```

Create `backend/app/pages.py`:

```python
import os
from dataclasses import dataclass

from fastapi import HTTPException
from fastapi.responses import HTMLResponse

from .envutil import env_truthy

MARKER = "<!--ADS-->"


@dataclass(frozen=True)
class AdConfig:
    enabled: bool
    banner: str
    popunder: str

    @property
    def active(self) -> bool:
        return self.enabled and bool(self.banner or self.popunder)


def load_ad_config() -> AdConfig:
    """Read once per create_app(); a config change requires a restart, which
    matches how the rest of app.env is applied on the VPS."""
    return AdConfig(
        enabled=env_truthy("ADS_ENABLED"),
        banner=os.environ.get("AD_BANNER_SNIPPET", "").strip(),
        popunder=os.environ.get("AD_POPUNDER_SNIPPET", "").strip(),
    )


class PageRenderer:
    """Serves public HTML shells, replacing the <!--ADS--> marker line.

    Ads active: the marker line becomes the banner slot and/or popunder
    snippet. Ads off (or enabled with no snippets): the ENTIRE marker line is
    removed, so visitors never see the comment and the output is identical to
    the pre-ads page. Files without a marker pass through unchanged.

    Rendered output is cached per (absolute path, st_mtime_ns). The ad config
    is fixed for the renderer's lifetime, so the cache never mixes states; a
    redeploy changes mtimes and refreshes naturally. Trade-off (accepted in
    the spec): unlike FileResponse there are no ETag/Last-Modified 304s, which
    is negligible for three small no-cache HTML pages.
    """

    def __init__(self, ads: AdConfig):
        self._ads = ads
        self._cache: dict[str, tuple[int, bytes]] = {}

    def _inject(self, html: str) -> str:
        out: list[str] = []
        replaced = False
        for line in html.splitlines(keepends=True):
            if not replaced and line.strip() == MARKER:
                replaced = True
                if self._ads.active:
                    if self._ads.banner:
                        out.append(f'<div class="ad-slot">{self._ads.banner}</div>\n')
                    if self._ads.popunder:
                        out.append(self._ads.popunder + "\n")
                continue
            out.append(line)
        return "".join(out)

    def render(self, filename: str) -> HTMLResponse:
        static_dir = os.environ.get("STATIC_DIR", "")
        path = os.path.join(static_dir, filename)
        if not static_dir or not os.path.isfile(path):
            raise HTTPException(status_code=404)
        key = os.path.abspath(path)
        mtime = os.stat(path).st_mtime_ns
        cached = self._cache.get(key)
        if cached is not None and cached[0] == mtime:
            return HTMLResponse(cached[1])
        with open(path, encoding="utf-8") as f:
            body = self._inject(f.read()).encode("utf-8")
        self._cache[key] = (mtime, body)
        return HTMLResponse(body)
```

- [ ] **Step 4: Switch `_maintenance_on` to the shared helper**

In `backend/app/main.py`, replace the existing helper (lines ~23-29):

```python
def _maintenance_on() -> bool:
    return maintenance.is_on() or os.environ.get("MAINTENANCE_MODE", "").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )
```

with:

```python
def _maintenance_on() -> bool:
    return maintenance.is_on() or env_truthy("MAINTENANCE_MODE")
```

and add `from .envutil import env_truthy` to the imports.

- [ ] **Step 5: Run tests to verify they pass (plus maintenance regression)**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_pages.py tests/test_maintenance.py tests/test_maintenance_api.py tests/test_maintenance_flag.py -q`
Expected: all PASS (maintenance behavior unchanged by the refactor).

- [ ] **Step 6: Deployment config for raw snippets**

In `compose.prod.yaml`, replace:

```yaml
    env_file:
      - ./deploy/app.env
```

with:

```yaml
    env_file:
      # format: raw disables compose's $-interpolation so minified ad
      # snippets containing $ are passed through byte-for-byte.
      - path: ./deploy/app.env
        format: raw
```

Append to `deploy/app.env.example`:

```
# --- Ads (optional, OFF unless ADS_ENABLED is truthy) ---
# ADS_ENABLED=1 turns the ad slot on (accepted: 1/true/yes/on).
# Paste each snippet from the ad network dashboard as ONE line, exactly as
# given. env_file is loaded with format: raw, so dollar signs need no
# escaping. Clearing AD_POPUNDER_SNIPPET while keeping ADS_ENABLED=1 gives
# banner-only mode. Restart the stack to apply changes:
#   docker compose -f compose.prod.yaml up -d --build
ADS_ENABLED=
AD_BANNER_SNIPPET=
AD_POPUNDER_SNIPPET=
```

Validate: `python3 -c "import yaml; yaml.safe_load(open('compose.prod.yaml')); print('ok')"` (run from repo root).
Expected: `ok`.

- [ ] **Step 7: Full backend suite + lint**

Run: `cd backend && source .venv/bin/activate && python -m pytest -q && cd .. && ruff check backend`
Expected: all pass, warnings baseline 7, ruff clean.

- [ ] **Step 8: Commit**

```bash
git add backend/app/envutil.py backend/app/pages.py backend/app/main.py backend/tests/test_pages.py compose.prod.yaml deploy/app.env.example
git commit -m "feat: ad-slot page renderer with env-gated config, dark by default

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Route the public pages through the renderer

**Files:**
- Modify: `backend/app/main.py` (the `/tiktokvideodownloader` and `/redditvideodownloader` route functions, ~lines 150-170; add `/` and `.html` routes in the same place, before the static mount)
- Test: `backend/tests/test_pages_routes.py` (new); `backend/tests/test_tiktok_page.py` and `backend/tests/test_reddit_page.py` must keep passing unchanged

**Interfaces:**
- Consumes (from Task 1): `pages.PageRenderer`, `pages.load_ad_config`, `pages.MARKER`; `PageRenderer.render(filename)` raising 404 as specified.
- Produces: routes `GET /`, `GET /index.html`, `GET /tiktokvideodownloader`, `GET /tiktokvideodownloader.html`, `GET /redditvideodownloader`, `GET /redditvideodownloader.html`, all serving renderer output. `/admin` (analytics router) and `/admin.html` (static mount) untouched.

- [ ] **Step 1: Write the failing integration tests**

Create `backend/tests/test_pages_routes.py`:

```python
from fastapi.testclient import TestClient

from app.main import create_app

BANNER = '<script src="https://example-ads.test/banner.js"></script>'
POP = '<script src="https://example-ads.test/pop.js"></script>'

PAGE = "<!doctype html>\n<html><body>\n<p>{name}</p>\n<!--ADS-->\n</body></html>\n"

PUBLIC_PATHS = [
    ("/", "index.html"),
    ("/index.html", "index.html"),
    ("/tiktokvideodownloader", "tiktokvideodownloader.html"),
    ("/tiktokvideodownloader.html", "tiktokvideodownloader.html"),
    ("/redditvideodownloader", "redditvideodownloader.html"),
    ("/redditvideodownloader.html", "redditvideodownloader.html"),
]


def _static(tmp_path, monkeypatch):
    for _, fname in PUBLIC_PATHS:
        (tmp_path / fname).write_text(PAGE.format(name=fname))
    (tmp_path / "admin.html").write_text("<!doctype html><title>admin</title>")
    monkeypatch.setenv("STATIC_DIR", str(tmp_path))


def _ads_on(monkeypatch):
    monkeypatch.setenv("ADS_ENABLED", "1")
    monkeypatch.setenv("AD_BANNER_SNIPPET", BANNER)
    monkeypatch.setenv("AD_POPUNDER_SNIPPET", POP)


def test_ads_off_no_marker_or_slot_on_any_public_path(tmp_path, monkeypatch):
    _static(tmp_path, monkeypatch)
    monkeypatch.delenv("ADS_ENABLED", raising=False)
    client = TestClient(create_app())
    for path, fname in PUBLIC_PATHS:
        res = client.get(path)
        assert res.status_code == 200, path
        assert "<!--ADS-->" not in res.text, path
        assert "ad-slot" not in res.text, path
        assert fname in res.text, path
        # Body equals the on-disk file minus the marker line.
        assert res.text == PAGE.format(name=fname).replace("<!--ADS-->\n", ""), path


def test_ads_on_all_public_paths_carry_banner_and_popunder(tmp_path, monkeypatch):
    _static(tmp_path, monkeypatch)
    _ads_on(monkeypatch)
    client = TestClient(create_app())
    for path, _ in PUBLIC_PATHS:
        res = client.get(path)
        assert f'<div class="ad-slot">{BANNER}</div>' in res.text, path
        assert POP in res.text, path
        assert "<!--ADS-->" not in res.text, path


def test_ads_on_admin_and_api_stay_clean(tmp_path, monkeypatch):
    _static(tmp_path, monkeypatch)
    _ads_on(monkeypatch)
    client = TestClient(create_app())
    for path in ("/admin", "/admin.html"):
        res = client.get(path)
        assert res.status_code == 200, path
        assert "ad-slot" not in res.text and BANNER not in res.text, path
        assert POP not in res.text, path
    health = client.get("/api/health")
    assert health.status_code == 200
    assert "ad-slot" not in health.text


def test_banner_only_mode_via_empty_popunder(tmp_path, monkeypatch):
    _static(tmp_path, monkeypatch)
    monkeypatch.setenv("ADS_ENABLED", "1")
    monkeypatch.setenv("AD_BANNER_SNIPPET", BANNER)
    monkeypatch.setenv("AD_POPUNDER_SNIPPET", "")
    client = TestClient(create_app())
    res = client.get("/")
    assert "ad-slot" in res.text
    assert POP not in res.text


def test_maintenance_on_serves_maintenance_page_without_ads(tmp_path, monkeypatch):
    _static(tmp_path, monkeypatch)
    (tmp_path / "maintenance.html").write_text("<!doctype html><title>brb</title>")
    _ads_on(monkeypatch)
    monkeypatch.setenv("MAINTENANCE_MODE", "1")
    client = TestClient(create_app())
    res = client.get("/")
    assert res.status_code == 503
    assert "brb" in res.text
    assert "ad-slot" not in res.text and POP not in res.text


def test_root_404_without_static_dir(monkeypatch):
    monkeypatch.delenv("STATIC_DIR", raising=False)
    client = TestClient(create_app(), raise_server_exceptions=False)
    assert client.get("/").status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_pages_routes.py -q`
Expected: FAIL (routes for `/` and `.html` paths do not exist yet; tiktok/reddit paths still serve the raw file containing `<!--ADS-->`).

- [ ] **Step 3: Wire the routes**

In `backend/app/main.py`, add `from .pages import PageRenderer, load_ad_config` to the imports, and inside `create_app()` replace the two existing page routes:

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

    @app.get("/redditvideodownloader")
    def reddit_page():
        from fastapi import HTTPException
        from fastapi.responses import FileResponse

        sd = os.environ.get("STATIC_DIR", "")
        path = os.path.join(sd, "redditvideodownloader.html")
        if sd and os.path.isfile(path):
            return FileResponse(path)
        raise HTTPException(status_code=404)
```

with:

```python
    # Public pages go through the ad-aware renderer. The raw .html paths are
    # routed too; otherwise the static mount would serve the file as-is and
    # leak the literal <!--ADS--> marker (or dodge ads entirely). /admin is
    # deliberately NOT here: it is served by the explicit route in
    # analytics/router.py and must never pass through the renderer.
    renderer = PageRenderer(load_ad_config())

    @app.get("/")
    @app.get("/index.html")
    def home_page():
        return renderer.render("index.html")

    @app.get("/tiktokvideodownloader")
    @app.get("/tiktokvideodownloader.html")
    def tiktok_page():
        return renderer.render("tiktokvideodownloader.html")

    @app.get("/redditvideodownloader")
    @app.get("/redditvideodownloader.html")
    def reddit_page():
        return renderer.render("redditvideodownloader.html")
```

(These are declared before `app.mount("/", ...)` at the end of `create_app`, so they take precedence over the static mount; route registration order decides.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_pages_routes.py tests/test_tiktok_page.py tests/test_reddit_page.py -q`
Expected: all PASS, including the pre-existing page tests (fixtures have no marker; renderer serves markerless files unchanged).

- [ ] **Step 5: Full backend suite + lint**

Run: `cd backend && source .venv/bin/activate && python -m pytest -q && cd .. && ruff check backend`
Expected: all pass, warnings baseline 7, ruff clean.

- [ ] **Step 6: Commit**

```bash
git add backend/app/main.py backend/tests/test_pages_routes.py
git commit -m "feat: serve public pages through the ad renderer, cover raw .html paths

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Frontend markers, ad-slot CSS, and the on-page copy sweep

**Files:**
- Modify: `frontend/index.html`, `frontend/tiktokvideodownloader.html`, `frontend/redditvideodownloader.html`
- Modify: `frontend/src/App.tsx` (~line 185), `frontend/src/tiktok/TikTokApp.tsx` (~line 185), `frontend/src/reddit/RedditApp.tsx` (~line 187)
- Modify: `frontend/src/styles/index.css` (append)

**Interfaces:**
- Consumes: the marker contract from Task 1 (`<!--ADS-->` on its own line immediately before `</body>`) and the `.ad-slot` class name injected by the renderer.
- Produces: three HTML shells carrying the marker; no built output contains "open source", "No Ads", "no popups", "no tracking", "MIT", or github.com/OxIsrafil.

- [ ] **Step 1: Add the marker to the three shells**

In each of `frontend/index.html`, `frontend/tiktokvideodownloader.html`, `frontend/redditvideodownloader.html`, add a line containing exactly `<!--ADS-->` immediately before the closing `</body>` tag, at the same indentation as its siblings.

- [ ] **Step 2: Append the ad-slot style**

Append to `frontend/src/styles/index.css` (before the reduced-motion block):

```css
.ad-slot {
  margin: 20px auto 8px;
  max-width: 728px;
  display: flex;
  justify-content: center;
  overflow: hidden;
}
```

(Accepted per spec: under adblock the slot may render as a small blank gap; margins are kept modest and no adblock detection is attempted.)

- [ ] **Step 3: Copy sweep, exact replacements**

`frontend/index.html`:
- Line 6 title AND lines 14/18 og:title/twitter:title:
  old `Twitter/X Video Downloader - Free, Fast, No Ads | SaveVid AI`
  new `Twitter/X Video Downloader - Free, Fast, Instant | SaveVid AI`
- Line 7 description:
  old `Download Twitter/X videos and GIFs in original quality. No popups, no redirects, no fake download buttons. Free, open source, and instant.`
  new `Download Twitter/X videos and GIFs in original quality. No fake download buttons, no forced redirects. Free and instant.`
- Lines 15/19 og/twitter description:
  old `Paste a post link, pick a quality, done. No popups, no fake buttons, open source.`
  new `Paste a post link, pick a quality, done. No fake buttons, one real click.`

`frontend/tiktokvideodownloader.html` (titles are already claim-free; keep them):
- Line 7 description:
  old `Download TikTok videos without the watermark, in original quality. No popups, no redirects, no fake download buttons. Free, open source, and instant.`
  new `Download TikTok videos without the watermark, in original quality. No fake download buttons, no forced redirects. Free and instant.`
- Lines 15/19 og/twitter description:
  old `Paste a TikTok link, get it without the watermark, in seconds. No popups, no fake buttons, open source.`
  new `Paste a TikTok link, get it without the watermark, in seconds. No fake buttons, one real click.`

`frontend/redditvideodownloader.html` (titles claim-free; keep):
- Line 7 description:
  old `Download Reddit videos with the audio merged in, in original quality. No popups, no redirects, no fake download buttons. Free, open source, and instant.`
  new `Download Reddit videos with the audio merged in, in original quality. No fake download buttons, no forced redirects. Free and instant.`
- Lines 15/19 og/twitter description:
  old `Paste a Reddit post link, get the video with audio, in seconds. No popups, no fake buttons, open source.`
  new `Paste a Reddit post link, get the video with audio, in seconds. No fake buttons, one real click.`

FAQ sweep, in BOTH the JSON-LD block and the visible FAQ section of each file (questions and answers must match between the two):
- Any question containing `ad-free` (e.g. `Is SaveVid AI really free and ad-free?`): replace the question text with the same question ending `free and safe?`.
- Safety answers:
  old (index variant) `Yes. There are no popups, no redirects, and no fake download buttons, ever. The project is open source, so you can verify that yourself or even run your own copy.`
  old (visible variant) `Yes. No popups, no redirects, no fake download buttons, ever. The code is open source, so you can verify that yourself or run your own copy.`
  new (all variants) `Yes. No fake download buttons and no forced redirects: your download is always one real click. A small ad keeps the site free.`
- Privacy answers (tiktok/reddit):
  old `Yes. There is no login, no account, and no tracking. Nothing is installed on your device, and the code is open source so you can read exactly what it does.` (and the `No.`-prefixed JSON-LD variant)
  new `Yes. There is no login and no account. Nothing is installed on your device, and we only keep anonymous, aggregate usage counts.`
- About section (all three, ~line 102):
  old `SaveVid AI is an open source project by <a ...>@israfill</a>. Read the code, star it, or self-host it from the <a href="https://github.com/OxIsrafil/savevidai" ...>GitHub repository</a>.`
  new `SaveVid AI is built by <a href="https://x.com/israfill" target="_blank" rel="noopener">@israfill</a>.`
- Footer (all three, ~lines 111-120):
  - footer-desc: drop the leading `Open source ` and the claims sentence:
    index: new `Twitter/X video downloader. No fake buttons. One paste, every quality.`
    tiktok: new `TikTok video downloader. No fake buttons. One paste, no watermark.`
    reddit: new `Reddit video downloader. No fake buttons. One paste, audio merged in.`
  - Delete the `GitHub` and `Self-host` anchor lines (~115-116); keep the X link.
  - Credit line: old `built by <a ...>@israfill</a> · MIT licensed` new `built by <a ...>@israfill</a>` (keep the anchor, drop the ` · MIT licensed` suffix).

React heroes:
- `frontend/src/App.tsx` line ~185:
  old `Straight from Twitter's CDN. No popups, no fake buttons, ever.`
  new `Straight from Twitter's CDN. No fake buttons, one real click.`
- `frontend/src/tiktok/TikTokApp.tsx` line ~185:
  old `Clean file, no watermark. No popups, no fake buttons, ever.`
  new `Clean file, no watermark. No fake buttons, one real click.`
- `frontend/src/reddit/RedditApp.tsx` line ~187:
  old `Video and audio merged into one file. No popups, no fake buttons, ever.`
  new `Video and audio merged into one file. No fake buttons, one real click.`

- [ ] **Step 4: Frontend tests and build**

Run: `cd frontend && npx vitest run`
Expected: all pass. If any test asserts a removed string (search first: `grep -rn "No popups\|open source\|ad-free\|MIT" src/**/*.test.*`), update the assertion to the new copy, never the component.

Run: `cd frontend && npm run build`
Expected: clean build.

- [ ] **Step 5: Verify the built output is claim-free and marker-correct**

Run from `frontend/`:

```bash
grep -riE "open source|no popups|No Ads|no tracking|MIT licensed|github.com/OxIsrafil" dist/*.html dist/assets/*.js && echo "FOUND STALE COPY" || echo "clean"
grep -c "<!--ADS-->" dist/index.html dist/tiktokvideodownloader.html dist/redditvideodownloader.html
grep -c "<!--ADS-->" dist/admin.html || echo "admin clean"
```

Expected: `clean`; count `1` for each of the three public shells; `admin clean` (admin.html has no marker).

- [ ] **Step 6: Commit**

```bash
git add frontend/index.html frontend/tiktokvideodownloader.html frontend/redditvideodownloader.html frontend/src/App.tsx frontend/src/tiktok/TikTokApp.tsx frontend/src/reddit/RedditApp.tsx frontend/src/styles/index.css
git commit -m "feat: ad markers and honest copy sweep across public pages

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: OG image, maintenance page, and repo docs sweep

**Files:**
- Modify: `scripts/make_og.py` (the `default` variant subtitle, line ~29)
- Regenerate: `frontend/public/og.png`
- Modify: `frontend/public/maintenance.html` (lines ~240-241)
- Modify: `README.md`
- Delete: `CONTRIBUTING.md`

**Interfaces:**
- Consumes: nothing from other tasks (independent; can run in any order after Task 3's copy anchors are agreed).
- Produces: no shipped asset or doc claims open source / no popups; og-tiktok.png and og-reddit.png confirmed already clean (`No watermark. Free.` / `With audio. Free.`).

- [ ] **Step 1: Update the OG generator text**

In `scripts/make_og.py`, the `default` variant:

```python
    "default": {
        "filename": "og.png",
        "title": "Twitter Video Downloader",
        "subtitle": "Free. No popups. No fake buttons. Open source.",
    },
```

becomes:

```python
    "default": {
        "filename": "og.png",
        "title": "Twitter Video Downloader",
        "subtitle": "Free. No fake buttons. One real click.",
    },
```

- [ ] **Step 2: Regenerate og.png**

Run from repo root:

```bash
source backend/.venv/bin/activate && pip install -q pillow && python scripts/make_og.py
```

Expected: `wrote .../frontend/public/og.png`. Do NOT regenerate the tiktok/reddit variants (their text is already clean and regenerating could shift font rendering for no reason).

- [ ] **Step 3: Maintenance page copy**

In `frontend/public/maintenance.html` (~lines 240-241), replace:

```html
      thanks for using it. it's open source, always.<br />
      <a href="https://github.com/OxIsrafil/savevidai" rel="noopener">github.com/OxIsrafil/savevidai</a>
```

with:

```html
      thanks for using it. back in a few minutes.
```

(Preserve the surrounding element structure; only this text block and the link change.)

- [ ] **Step 4: README and CONTRIBUTING**

- `README.md`: delete the shields.io GitHub-stars badge line (line ~5), and rewrite any sentence pitching the project as open source / MIT / "star the repo" / self-host-as-a-feature into neutral owner-facing wording (the README now documents a private codebase; operational sections stay). Do not touch `deploy/README.md`.
- Delete `CONTRIBUTING.md` (`git rm CONTRIBUTING.md`).
- Verify: `grep -riE "open source|star|shields.io|contribut" README.md` returns nothing objectionable (operational uses of these words are fine; judgment call, note them in the report).

- [ ] **Step 5: Commit**

```bash
git add scripts/make_og.py frontend/public/og.png frontend/public/maintenance.html README.md
git rm -q CONTRIBUTING.md 2>/dev/null || true
git commit -m "chore: og image, maintenance page, and repo docs drop open-source claims

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Post-merge runbook (owner steps, not part of the tasks)

1. Merge `feature/ads-monetization` to main (ff after review), push.
2. On the VPS: `cd /opt/savevidai && git pull && docker compose -f compose.prod.yaml up -d --build`. Site behavior is unchanged (ads dark).
3. Sign up at Adsterra, add the site, complete domain verification (their meta tag can be added to the three shells if required), create one banner (728x90 or responsive) and one popunder zone, set popunder frequency to 1 per session in their dashboard.
4. Paste the two snippets + `ADS_ENABLED=1` into `deploy/app.env` on the VPS (each snippet on one line), then `docker compose -f compose.prod.yaml up -d --build`.
5. Banner-only anytime: blank `AD_POPUNDER_SNIPPET=` and restart. Off entirely: blank `ADS_ENABLED=` and restart.

## Self-Review

- Spec coverage: env vars + truthy helper (T1), env_file raw + example docs (T1), renderer semantics incl. marker-line removal, markerless passthrough, mtime cache, 404s (T1), all six public routes + admin/api exclusion + maintenance interplay + STATIC_DIR-unset (T2), markers + CSS + full copy inventory incl. titles, JSON-LD questions, heroes, footers (T3), og.png + maintenance.html + README/CONTRIBUTING (T4). Revenue section is informational, no task needed. LICENSE untouched per spec.
- Placeholders: none; every step carries code, exact strings, or a concrete verification command.
- Type consistency: `AdConfig`/`load_ad_config`/`PageRenderer.render`/`MARKER` names match across T1 code, T1 tests, and T2 routes; `.ad-slot` class matches T1 injection and T3 CSS.
