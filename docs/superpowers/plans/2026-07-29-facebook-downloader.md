# Facebook Downloader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Facebook (videos and reels, no photos) as the fifth platform on `/facebookvideodownloader`, resolved via facebed.com og tags, with real post-title text and first-frame previews.

**Architecture:** The server GETs `https://facebed.com<validated-path>` with the existing hybrid crawler UA and parses `og:video:secure_url` / `og:video` (direct progressive MP4 on `*.fbcdn.net`, CORS-open, verified live 2026-07-29) plus `og:title` out of the HTML. Browser downloads the bytes; `/api/proxy` is fallback. Everything else mirrors the shipped Instagram platform.

**Tech Stack:** FastAPI + httpx, Vite 6 multi-page + React. Spec (rev2, binding): `docs/superpowers/specs/2026-07-29-facebook-platform-design.md` - read it before starting any task.

## Global Constraints

- NO em dashes, NO emoji anywhere (code, comments, copy, commits, docs). Hyphen/comma/colon only.
- Conventional commits; every commit ends with the trailer line: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- Backend commands from `backend/` with venv active (`source .venv/bin/activate`); frontend from `frontend/`.
- Test warning baseline is 7; any NEW warning is a finding. TDD: failing test first, always.
- Branch: `feature/facebook-downloader` (exists). Owner voice for copy; hero title case (established ruling). Never claim "no ads", "open source", "no tracking", watermark removal.
- facebed.com is the single resolver dependency, no fallback in v1 (documented in module docstring with the operational UA-gate note).
- The hybrid UA constant, verbatim everywhere it appears: `SaveVidAI/1.0 (compatible; Discordbot/2.0; +https://savevidai.israfill.dev)`

---

### Task 1: URL parser + platform detection

**Files:**
- Modify: `backend/app/urls.py` (append after instagram section), `backend/app/platforms.py`
- Test: `backend/tests/test_facebook_urls.py` (new), `backend/tests/test_platforms.py` (extend, parametrized like the INSTAGRAM_DETECT block)

**Interfaces:**
- Produces: `FACEBOOK_HOSTS: set[str]`, `parse_facebook_url(raw: str) -> tuple[str, str]` returning `(id, path)`, `detect_platform` -> `"facebook"`.

- [ ] **Step 1: Write the failing tests** - `backend/tests/test_facebook_urls.py`:

```python
import pytest

from app.urls import InvalidTweetURL, parse_facebook_url

VID = "1664876787784263"


@pytest.mark.parametrize("url,expected", [
    (f"https://www.facebook.com/watch?v={VID}", (VID, f"/watch/?v={VID}")),
    (f"https://www.facebook.com/watch/?v={VID}&mibextid=abc&rdid=xyz", (VID, f"/watch/?v={VID}")),
    (f"https://facebook.com/reel/578721235067082", ("578721235067082", "/reel/578721235067082")),
    (f"https://m.facebook.com/reel/578721235067082/", ("578721235067082", "/reel/578721235067082")),
    (f"https://web.facebook.com/watch?v={VID}", (VID, f"/watch/?v={VID}")),
    (f"https://fb.com/video.php?v={VID}", (VID, f"/watch/?v={VID}")),
    (f"https://m.facebook.com/story.php?story_fbid={VID}&id=100044", (VID, f"/watch/?v={VID}")),
    (f"https://www.facebook.com/nasa/videos/{VID}", (VID, f"/watch/?v={VID}")),
    (f"https://www.facebook.com/nasa/videos/some-slug-here/{VID}/", (VID, f"/watch/?v={VID}")),
    ("https://www.facebook.com/share/r/18WMhEx3aR/", ("18WMhEx3aR", "/share/r/18WMhEx3aR")),
    ("https://www.facebook.com/share/v/1abcDEF234/", ("1abcDEF234", "/share/v/1abcDEF234")),
    ("https://www.facebook.com/share/p/1abcDEF234/", ("1abcDEF234", "/share/p/1abcDEF234")),
    (f"www.facebook.com/watch?v={VID}", (VID, f"/watch/?v={VID}")),
])
def test_accepts(url, expected):
    assert parse_facebook_url(url) == expected


@pytest.mark.parametrize("url", [
    "",
    "https://fb.watch/abc123XY/",
    "https://www.facebook.com/nasa",
    "https://www.facebook.com/photo/?fbid=123456789",
    "https://www.facebook.com/photo.php?fbid=123456789",
    "https://www.facebook.com/watch?v=12ab34",
    "https://www.facebook.com/watch",
    f"https://www.facebook.com/12345678/videos/",
    "https://www.facebook.com/share/x/1abcDEF234/",
    "https://www.facebook.com/share/r/" + "a" * 33,
    f"https://facebook.com.evil.com/watch?v={VID}",
    f"https://example.com/watch?v={VID}",
    f"ftp://www.facebook.com/watch?v={VID}",
])
def test_rejects(url):
    with pytest.raises(InvalidTweetURL):
        parse_facebook_url(url)
```

`test_platforms.py`: extend the detect list with `("https://www.facebook.com/watch?v=1", "facebook")`-style cases for facebook.com, fb.com, fb.watch hosts (fb.watch DETECTS as facebook; its rejection happens in the parser).

- [ ] **Step 2: Run to verify failure** - `pytest tests/test_facebook_urls.py tests/test_platforms.py -v` -> ImportError.
- [ ] **Step 3: Implement** - append to `backend/app/urls.py`:

```python
FACEBOOK_HOSTS = {
    "facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com",
    "fb.com", "www.fb.com", "fb.watch",
}

_FB_ID = re.compile(r"[0-9]{5,20}")
_FB_TOKEN = re.compile(r"[A-Za-z0-9]{1,32}")
_FB_PAGE = re.compile(r"[A-Za-z0-9.]{1,60}")


def parse_facebook_url(raw: str) -> tuple[str, str]:
    """Return (id, path) for a supported Facebook video URL, else raise.

    The path is what the resolver appends to facebed.com and is built ONLY from
    validated pieces (mirrors parse_reddit_url). Page/videos and the legacy
    video.php/story.php shapes normalize to /watch/?v=<id>. fb.watch hosts are
    detected (so analytics attribute them to facebook) but rejected here: v1
    does not follow the facebook.com redirect they require. We host-allowlist
    first, same rule as every platform.
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
    if host not in FACEBOOK_HOSTS:
        raise InvalidTweetURL(raw)
    if host == "fb.watch":
        raise InvalidTweetURL(raw)
    parts = [p for p in parsed.path.split("/") if p]
    query = parse_qs(parsed.query)

    def _qs_id(key: str) -> str | None:
        vals = query.get(key)
        vid = vals[0] if vals else ""
        return vid if _FB_ID.fullmatch(vid) else None

    if parts and parts[0] in ("watch", "video.php"):
        vid = _qs_id("v")
        if vid:
            return (vid, f"/watch/?v={vid}")
    elif parts and parts[0] == "story.php":
        vid = _qs_id("story_fbid")
        if vid:
            return (vid, f"/watch/?v={vid}")
    elif len(parts) == 2 and parts[0] == "reel" and _FB_ID.fullmatch(parts[1]):
        return (parts[1], f"/reel/{parts[1]}")
    elif len(parts) == 3 and parts[0] == "share" and parts[1] in ("r", "v", "p") \
            and _FB_TOKEN.fullmatch(parts[2]):
        return (parts[2], f"/share/{parts[1]}/{parts[2]}")
    elif len(parts) >= 3 and parts[1] == "videos" and _FB_PAGE.fullmatch(parts[0]):
        # id = last all-digit segment AFTER "videos", so a numeric page id in
        # position 0 can never be picked.
        for seg in reversed(parts[2:]):
            if _FB_ID.fullmatch(seg):
                return (seg, f"/watch/?v={seg}")
    raise InvalidTweetURL(raw)
```

Add `parse_qs` to the `urllib.parse` import at the top of urls.py. In `platforms.py`: import FACEBOOK_HOSTS, docstring gains `'facebook'`, branch before `return None`.

- [ ] **Step 4: Run to verify pass**, then `ruff check .`.
- [ ] **Step 5: Commit** - `feat(facebook): url parser and platform detection`

---

### Task 2: efg.py shared helper lift

**Files:**
- Create: `backend/app/efg.py`
- Modify: `backend/app/instagram.py` (drop `_duration`, import the helper)
- Test: `backend/tests/test_efg.py` (new); `backend/tests/test_instagram.py` must stay green UNCHANGED (it pins duration via map_instagram, which now goes through the helper).

**Interfaces:**
- Produces: `duration_from_efg(url: str) -> float | None`.

- [ ] **Step 1: Failing test** - `backend/tests/test_efg.py`:

```python
import base64
import json

from app.efg import duration_from_efg

EFG = base64.b64encode(json.dumps({"duration_s": 37}).encode()).decode()


def test_reads_duration():
    assert duration_from_efg(f"https://x.example/v.mp4?efg={EFG}") == 37.0


def test_missing_param_and_garbage_are_none():
    assert duration_from_efg("https://x.example/v.mp4") is None
    assert duration_from_efg("https://x.example/v.mp4?efg=%%%bad") is None
    assert duration_from_efg("https://x.example/v.mp4?efg=" + base64.b64encode(b'{"other":1}').decode()) is None
```

- [ ] **Step 2: Verify fail** (ModuleNotFoundError).
- [ ] **Step 3: Implement** - `backend/app/efg.py` is instagram.py's `_duration` moved verbatim (docstring: Meta CDN URLs carry a base64-JSON `efg` query param with `duration_s`; best-effort, never raises), renamed `duration_from_efg`. instagram.py: delete `_duration`, `from .efg import duration_from_efg`, call site updated, drop now-unused base64/json imports if nothing else uses them.
- [ ] **Step 4: Verify** - `pytest tests/test_efg.py tests/test_instagram.py -v` (instagram file untouched and green), full suite, ruff.
- [ ] **Step 5: Commit** - `refactor(instagram): lift efg duration parse into shared helper`

---

### Task 3: facebook.py resolver

**Files:**
- Create: `backend/app/facebook.py`
- Test: `backend/tests/test_facebook.py` (new)

**Interfaces:**
- Consumes: `duration_from_efg` (Task 2), errors/schemas as instagram does.
- Produces: `extract_facebook(parsed: tuple[str, str]) -> ResolveResponse`, `map_facebook(id_: str, status: int, body: str) -> ResolveResponse`, `FACEBOOK_MEDIA_HOSTS = ("fbcdn.net",)`.

- [ ] **Step 1: Failing tests** - `backend/tests/test_facebook.py`. Build HTML fixtures as python strings; the happy-path fixture mirrors facebed's live serialization including the og:video:type trap and `&amp;` entities:

```python
import base64
import json

import pytest

from app.errors import AppError
from app.facebook import _map_guarded, map_facebook

VID = "1664876787784263"
EFG = base64.b64encode(json.dumps({"duration_s": 14}).encode()).decode()
CDN = f"https://video.fhan5-6.fna.fbcdn.net/o1/v/t2/AQM.mp4?strext=1&amp;efg={EFG}&amp;oe=6A6B7209"
CDN_UNESCAPED = CDN.replace("&amp;", "&")

OK = f'''<html><head>
<meta property="og:title" content="NASA &amp; friends"/>
<meta property="og:video:type" content="video/mp4"/>
<meta property="og:video" content="{CDN}"/>
<meta property="og:video:secure_url" content="{CDN}"/>
</head><body></body></html>'''

NO_SECURE = OK.replace('property="og:video:secure_url"', 'property="og:video:ignored"')
REVERSED_ATTRS = f'<meta content="{CDN}" property="og:video:secure_url"/>'
SINGLE_QUOTES = f"<meta property='og:video:secure_url' content='{CDN}'/>"
NO_VIDEO = '<html><head><meta property="og:title" content="t"/></head></html>'
EVIL = OK.replace("video.fhan5-6.fna.fbcdn.net", "fbcdn.net.evil.com")


def test_happy_path_prefers_secure_url_and_unescapes():
    res = map_facebook(VID, 200, OK)
    assert res.id == VID and res.handle == VID and res.author == "Facebook"
    assert res.text == "NASA & friends"
    [item] = res.items
    assert item.kind == "video" and item.thumbnail is None
    assert item.duration_seconds == 14.0
    [v] = item.variants
    assert v.label == "hd" and v.url == CDN_UNESCAPED


def test_og_video_type_never_matches_and_og_video_fallback_works():
    res = map_facebook(VID, 200, NO_SECURE)
    assert res.items[0].variants[0].url == CDN_UNESCAPED


@pytest.mark.parametrize("html", [REVERSED_ATTRS, SINGLE_QUOTES])
def test_attribute_order_and_quote_tolerance(html):
    assert map_facebook(VID, 200, html).items[0].variants[0].url == CDN_UNESCAPED


def test_200_without_og_video_is_not_found():
    with pytest.raises(AppError) as e:
        map_facebook(VID, 200, NO_VIDEO)
    assert e.value.code == "not_found"


def test_404_is_not_found():
    with pytest.raises(AppError) as e:
        map_facebook(VID, 404, "")
    assert e.value.code == "not_found"


@pytest.mark.parametrize("status", [301, 302, 403, 500])
def test_redirect_and_error_statuses_are_upstream(status):
    with pytest.raises(AppError) as e:
        map_facebook(VID, status, "")
    assert e.value.code == "upstream_error"


def test_off_allowlist_og_video_is_upstream():
    with pytest.raises(AppError) as e:
        map_facebook(VID, 200, EVIL)
    assert e.value.code == "upstream_error"


def test_guarded_mapper_never_500s(monkeypatch):
    import app.facebook as fb
    monkeypatch.setattr(fb, "map_facebook", lambda *a: (_ for _ in ()).throw(TypeError("boom")))
    with pytest.raises(AppError) as e:
        _map_guarded(VID, 200, OK)
    assert e.value.code == "upstream_error"
```

Plus a UA pin test mirroring `test_request_pins_crawler_ua_and_no_redirect_follow` in test_instagram.py: monkeypatch httpx.get, call `extract_facebook((VID, f"/watch/?v={VID}"))`, assert URL `https://facebed.com/watch/?v={VID}`, the exact hybrid UA header, `follow_redirects is False`, `timeout == 12.0`.

- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** `backend/app/facebook.py`:

```python
"""Resolve Facebook videos/reels to direct CDN media via facebed.com og tags.

facebed mirrors Facebook paths and serves HTML whose og:video points at a
progressive mp4 on *.fbcdn.net. Its UA gate is inverted vs kkinstagram: bots
and bare clients get the tags, real browser UAs get redirected, so the request
uses the same hybrid crawler UA as instagram. If resolves start failing with
upstream_error, check this gate first. Nonexistent ids 404; a 200 without
og:video is the private/login-walled class and maps to not_found. Single
volunteer-run dependency, like tikwm and kkinstagram; a fallback can slot in
here later.
"""
import html as htmllib
import logging
import re
from urllib.parse import urlparse

import httpx

from .efg import duration_from_efg
from .errors import NOT_FOUND, UPSTREAM, AppError, app_error
from .schemas import MediaItem, ResolveResponse, Variant

logger = logging.getLogger("savevidai.facebook")

_FIXER = "https://facebed.com"
_UA = "SaveVidAI/1.0 (compatible; Discordbot/2.0; +https://savevidai.israfill.dev)"
# NOTE: feeds the /api/proxy SSRF allowlist (suffix match), widening it widens
# what the proxy will fetch on the server's behalf - change with care.
FACEBOOK_MEDIA_HOSTS = ("fbcdn.net",)


def _meta(prop: str, body: str) -> str | None:
    """First <meta> whose property EXACTLY equals prop, either attribute order,
    either quote style. Exact match so og:video never grabs og:video:type."""
    for pat in (
        rf'<meta[^>]*\bproperty=["\']{re.escape(prop)}["\'][^>]*\bcontent=["\']([^"\']*)["\']',
        rf'<meta[^>]*\bcontent=["\']([^"\']*)["\'][^>]*\bproperty=["\']{re.escape(prop)}["\']',
    ):
        m = re.search(pat, body)
        if m:
            return htmllib.unescape(m.group(1))
    return None


def extract_facebook(parsed: tuple[str, str]) -> ResolveResponse:
    id_, path = parsed
    try:
        resp = httpx.get(f"{_FIXER}{path}", headers={"User-Agent": _UA},
                         timeout=12.0, follow_redirects=False)
    except httpx.HTTPError as exc:
        logger.warning("facebook fetch failed for %s: %r", id_, exc)
        raise app_error(UPSTREAM) from exc
    return _map_guarded(id_, resp.status_code, resp.text)


def _map_guarded(id_: str, status: int, body: str) -> ResolveResponse:
    try:
        return map_facebook(id_, status, body)
    except AppError:
        raise
    except Exception as exc:
        logger.warning("facebook mapping failed for %s: %r", id_, exc)
        raise app_error(UPSTREAM) from exc


def _allowed_media_url(url: str) -> bool:
    if not url.startswith("https://"):
        return False
    host = (urlparse(url).hostname or "").lower()
    return any(host == d or host.endswith("." + d) for d in FACEBOOK_MEDIA_HOSTS)


def map_facebook(id_: str, status: int, body: str) -> ResolveResponse:
    if status == 404:
        raise app_error(NOT_FOUND)
    if status != 200:
        raise app_error(UPSTREAM)
    video = _meta("og:video:secure_url", body) or _meta("og:video", body)
    if not video:
        # Nonexistent ids 404 upstream (verified), so this is the private or
        # login-walled class: not_found reads truer than a retry-inducing
        # upstream_error and keeps the error rate meaningful.
        logger.info("facebook 200 without og:video for %s (private?)", id_)
        raise app_error(NOT_FOUND)
    if not _allowed_media_url(video):
        logger.warning("facebook og:video on disallowed host for %s", id_)
        raise app_error(UPSTREAM)
    return ResolveResponse(
        id=id_,
        author="Facebook",
        handle=id_,
        avatar_url=None,
        text=(_meta("og:title", body) or "").strip(),
        items=[MediaItem(index=1, kind="video", thumbnail=None,
                         duration_seconds=duration_from_efg(video),
                         variants=[Variant(label="hd", url=video)])],
    )
```

- [ ] **Step 4: Verify pass**, full suite, ruff.
- [ ] **Step 5: Commit** - `feat(facebook): facebed og-tag resolver`

---

### Task 4: proxy splice, resolve routing, TTL dict, analytics

**Files:**
- Modify: `backend/app/proxy.py` (import + splice `*FACEBOOK_MEDIA_HOSTS`), `backend/app/resolve.py`, `backend/app/analytics/router.py` (validator tuple + "facebook")
- Test: extend `backend/tests/test_proxy_api.py` (pin `video.fhan5-6.fna.fbcdn.net` allowed, `fbcdn.net.evil.com` rejected - endpoint-level idiom), `backend/tests/test_resolve_api.py` (facebook branch routes with mocked extract_facebook; cache key pinned to the PATH `facebook:/watch/?v=<id>`; TTL 600 pinned; existing tiktok 900 / instagram 600 pins MUST stay green), `backend/tests/test_analytics_api.py` (accepts "facebook", unknown still 422).

**Interfaces:**
- Consumes: `parse_facebook_url`, `extract_facebook`, `FACEBOOK_MEDIA_HOSTS`.
- resolve.py branch (before the reddit else):

```python
        elif platform == "facebook":
            fb = parse_facebook_url(payload.url)
            key = f"facebook:{fb[1]}"

            def resolver() -> ResolveResponse:
                return extract_facebook(fb)
```

- TTL refactor: replace the ternary with module-level `_TTL = {"tiktok": 900.0, "instagram": 600.0, "facebook": 600.0}` and `cache.set(key, result, ttl=_TTL.get(platform))`; the signed-URL comment above it survives; correctness rests on TTLCache.set treating ttl=None as the default (already true).

- [ ] Steps: failing tests -> verify fail -> implement -> FULL suite + ruff -> commit `feat(facebook): resolve routing, ttl map, proxy pin, analytics platform`.

---

### Task 5: backend page routes

**Files:** `backend/app/main.py` (instagram_page pattern, after it), `backend/tests/test_pages_routes.py` (add to PUBLIC_PATHS table).

- [ ] Failing tests (404 on both paths) -> implement `/facebookvideodownloader` + `.html` via `renderer.render("facebookvideodownloader.html")` before the static mount -> full suite -> commit `feat(facebook): serve facebook page through ad-aware renderer`.

---

### Task 6: frontend shell, vite entry, og image

**Files:** create `frontend/facebookvideodownloader.html` (copy the INSTAGRAM shell), modify `frontend/vite.config.ts` (+ `facebook: entry("./facebookvideodownloader.html")`), `scripts/make_og.py` (+ variant), generate `frontend/public/og-facebook.png`.

Exact replacements on the instagram shell copy (everything else byte-identical, single `<!--ADS-->` marker preserved):
- Titles: `Facebook Video Downloader - Fast, Free, HD | SaveVid AI`
- Meta description: `Download Facebook videos and reels in HD. No fake download buttons, no forced redirects. Free and instant.`
- og/twitter description: `Paste a Facebook link, get the video in seconds. No fake buttons, one real click.`
- Canonical/og:url: `https://savevidai.israfill.dev/facebookvideodownloader`; images: `https://savevidai.israfill.dev/og-facebook.png`; module script: `/src/facebook/main.tsx`
- JSON-LD FAQ, exactly these four (visible FAQ identical; the shared fifth "Who runs this?" visible-only entry stays):
  1. `Can I download Facebook videos and reels?` / `Yes. Paste the video or reel link and you get the file in HD, straight from Facebook's servers. Public posts only.`
  2. `Is the Facebook downloader free?` / `Yes. No fake download buttons and no forced redirects: your download is always one real click. A small ad keeps the site free.`
  3. `Can I download photos or private videos?` / `Not yet. Photo posts and private or friends-only videos are not supported: public videos and reels only.`
  4. `Is it safe to use SaveVid AI for Facebook?` / `Yes. There is no login and no account. We keep only anonymous, aggregate usage counts.`
- Static landing steps reworded for Facebook (sentence case per sibling shells). No watermark/no-ads/open-source/tracking claims (grep must return 0; ADS marker count 1).
- make_og VARIANTS: `"facebook": {"filename": "og-facebook.png", "title": "Facebook Video Downloader", "subtitle": "Free. No fake buttons. One real click."}` + docstring line. Generate; verify 1200x630.
- `npm run build` may fail ONLY on missing `/src/facebook/main.tsx` (Task 7).
- [ ] Commit `feat(facebook): seo shell, vite entry, og image`.

---

### Task 7: frontend app, platform unions, sitemap

**Files:** create `frontend/src/facebook/{main.tsx,FacebookApp.tsx,FacebookApp.test.tsx}` (mirror `src/instagram/` including its HowToVisual reuse decision: copy InstagramHowToVisual to FacebookHowToVisual with facebook wording, or reuse if it generalizes - implementer reads both first); modify the platform union in `frontend/src/components/PreviewCard.tsx` (prop + MediaSection), `QualityButton.tsx`, `PhotoGrid.tsx`, `PlatformLinks.tsx` (+ entry `{ key: "facebook", label: "Facebook", href: "/facebookvideodownloader" }` + test), `frontend/public/sitemap.xml`.

Requirements:
- Visit beacon and PreviewCard get `platform="facebook"`. Hero title case: `Facebook Video` / `Downloader` split like siblings; sub in owner voice; the "public videos and reels only" honesty phrase appears on the page (hero note slot, same as instagram's carousel note).
- Card shows og:title text (backend `text` field): add a test asserting the resolved text renders (mock resolve response with `text: "NASA & friends"`).
- Tests mirror InstagramApp.test.tsx: visit beacon `{ type: "visit", platform: "facebook" }`, resolve flow renders card with hd variant, active PlatformLinks state, honesty phrase present.
- [ ] Failing tests -> implement -> `npx vitest run` full + `npm run build` green -> commit `feat(facebook): facebook page app, platform links, sitemap`.

---

### Task 8: full gate + live verification + ledger

- [ ] Backend: `pytest tests/ -q` (warnings <= 7) + `ruff check .` + `ruff check ../scripts`. Frontend: `npx vitest run`, `npm run build`, dist marker grep = 1.
- [ ] Live resolver (real network): `python -c` extract_facebook for BOTH probe shapes: `("578721235067082", "/reel/578721235067082")` and `("1664876787784263", "/watch/?v=1664876787784263")`; expect fbcdn URLs, duration floats, real og:title text. Report honestly if facebed is down.
- [ ] Live end-to-end on the running dev server (backend :8000, Vite :5173, browser tools): paste `https://www.facebook.com/watch/?v=1664876787784263`, confirm card (title text + first-frame preview + duration badge), click HD, confirm the network request succeeds and bytes land. Desktop + mobile widths, screenshots to the plan workspace.
- [ ] Append the Facebook section to the LEGACY ledger `.superpowers/sdd/progress.md` (dense style, mirror prior sections).
- [ ] Commit any gate fixes: `chore(facebook): final gate fixes and ledger`.

## Post-merge (owner runbook)

Deploy per CLAUDE.md. Prod verify: page 200 + marker consumed + sitemap, resolve both probe URLs, click-equivalent proxy download delivers full bytes, beacon 204 with platform facebook, /admin platforms row when traffic arrives.
