# TikTok Slideshow + How-To Visual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add TikTok photo-slideshow downloads (photo grid + Save all + soundtrack), a TikTok-specific annotated how-to graphic, and four small pre-merge improvements (HD chip, example chip, 15-min TikTok cache TTL, TikTok OG image) to the `feature/tiktok` branch.

**Architecture:** The tikwm mapper grows a slideshow branch (photos as `kind="image"` items, sound as `kind="audio"`; play/hdplay are never video on photo posts). The proxy forwards upstream Content-Type and its rate limit rises to 60/min so Save all survives large albums. The frontend adds a PhotoGrid with per-photo save state and single-beacon-per-action analytics. Everything else is small, surgical edits.

**Tech Stack:** Python 3.12, FastAPI, httpx, pytest, respx. TypeScript, Vite 6, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-22-tiktok-slideshow-howto-design.md` (read before starting).

## Global Constraints

- Response shape unchanged: `ResolveResponse(id, author, handle, avatar_url, text, items[MediaItem(index, kind, thumbnail, duration_seconds, variants[Variant(label, width, height, url, size_bytes)])])`.
- Video labels stay exactly `hd`/`sd`; the watermarked URL is never offered. New labels: `photo` (single image), `sound` (m4a soundtrack). Beacon-only label: `album` (Save all, one event per action).
- `/api/event` quality regex becomes exactly `^(\d{2,4}p|video|hd|sd|photo|album|sound)$`.
- Item indexes are unique per post: photos 1..N, audio N+1. There is NO rendered-video item on photo posts (verified live: play/hdplay/wmplay all equal the music URL on photo posts; mapping them as video would mislabel the soundtrack).
- Proxy host matching stays exact-host or dot-suffix, never substring; no redirect-follow; `TIKTOK_MEDIA_HOSTS` changes only with live-verified evidence (it feeds the SSRF allowlist).
- `fill_sizes` never HEADs `image`/`audio` variants.
- Zero-cost model: no server-side media processing, no zip, no new backend dependencies.
- No em dashes and no emoji anywhere, including page copy and JSON-LD.
- Backend commands from `backend/` with venv active (`source .venv/bin/activate`); frontend from `frontend/`. Warning baseline: 5 pre-existing third-party warnings; anything new is a finding.
- Conventional commit prefixes.

## Verified third-party contract

VERIFIED 2026-07-22 against `@velocitydrawing/photo/7266832970353233185` (response saved at `.superpowers/sdd/tikwm-slideshow-real-response.json`):
- `data.images` = list of https image URLs (host `p16-common-sign.tiktokcdn-us.com`, suffix-matches the existing allowlist; image bytes fetch with a plain UA, content-type image/jpeg).
- `data.music` = string https URL (host `sf16-sign.tiktokcdn-us.com`, also allowlisted); the file is AAC in an MP4 container (content-type `audio/mp4`), so the sound filename extension is `.m4a`, NOT `.mp3`.
- On photo posts `play`, `hdplay`, and `wmplay` are ALL byte-identical to `music` (the soundtrack). They are never mapped as video for slideshow posts.
- `size`/`hd_size` are 0 on photo posts. `music_info.play` duplicates `music`.
- `TIKTOK_MEDIA_HOSTS` needs NO changes. Tests use fixtures only, no network.

## File structure

Backend:
- Modify `backend/app/tiktok.py` - slideshow branch in `map_tiktok` (+ `_map_slideshow` helper).
- Modify `backend/app/sizes.py` - kind guard.
- Modify `backend/app/proxy.py` - Content-Type forwarding, 60/min.
- Modify `backend/app/analytics/router.py` - regex widen.
- Modify `backend/app/cache.py` - per-set TTL override.
- Modify `backend/app/resolve.py` - 900s TTL for tiktok entries.

Frontend:
- Modify `frontend/src/lib/api.ts` - kind union widens.
- Modify `frontend/src/lib/download.ts` - `buildMediaFilename`, blob type from response.
- Create `frontend/src/components/PhotoGrid.tsx` - grid + Save all + Sound.
- Modify `frontend/src/components/PreviewCard.tsx` - route image/audio items to PhotoGrid.
- Modify `frontend/src/components/QualityButton.tsx` - HD chip label rule.
- Create `frontend/src/tiktok/TikTokHowToVisual.tsx` - forked graphic.
- Modify `frontend/src/tiktok/TikTokApp.tsx` - graphic placement + example chip.
- Modify `frontend/tiktokvideodownloader.html` - FAQ flip, OG image meta.
- Create `frontend/public/og-tiktok.png` - rendered via `scripts/make_og.py` pattern.
- Modify `frontend/src/styles/index.css` - `.photo-grid` styles.

---

### Task 1: Slideshow mapping in the tikwm resolver

**Files:**
- Modify: `backend/app/tiktok.py`
- Modify: `backend/app/sizes.py`
- Test: `backend/tests/test_tiktok.py`, `backend/tests/test_sizes.py`

**Interfaces:**
- Consumes: existing `map_tiktok`, `_map_guarded`, `_size`, `MediaItem`, `Variant`, `app_error(NO_VIDEO)`.
- Produces: slideshow posts resolve to `items = [image x N, audio?]` with indexes 1..N, N+1; `fill_sizes` skips `image`/`audio` kinds.

The fixture below already mirrors the verified real response (see "Verified third-party contract" above); the saved real response is at `.superpowers/sdd/tikwm-slideshow-real-response.json`.

- [ ] **Step 1: Write the failing tests** (append to `backend/tests/test_tiktok.py`)

```python
SLIDESHOW = {
    "code": 0,
    "data": {
        "id": "7300000000000000000",
        "title": "a slideshow",
        "duration": 0,
        "images": [
            "https://p16-sign.tiktokcdn-us.com/img1.jpeg",
            "https://p16-sign.tiktokcdn-us.com/img2.jpeg",
            "https://p16-sign.tiktokcdn-us.com/img3.jpeg",
        ],
        "music": "https://sf16-sign.tiktokcdn-us.com/obj/tos-alisg-ve-2774/sound",
        "play": "https://sf16-sign.tiktokcdn-us.com/obj/tos-alisg-ve-2774/sound",
        "hdplay": "https://sf16-sign.tiktokcdn-us.com/obj/tos-alisg-ve-2774/sound",
        "wmplay": "https://sf16-sign.tiktokcdn-us.com/obj/tos-alisg-ve-2774/sound",
        "author": {"unique_id": "user", "nickname": "User Name", "avatar": "https://p19.tiktokcdn-us.com/a.jpg"},
    },
}


def test_map_slideshow_photos_and_sound_never_video():
    res = map_tiktok("7300000000000000000", SLIDESHOW)
    kinds = [(i.index, i.kind) for i in res.items]
    assert kinds == [(1, "image"), (2, "image"), (3, "image"), (4, "audio")]
    photo = res.items[0]
    assert photo.variants[0].label == "photo"
    assert photo.variants[0].url == "https://p16-sign.tiktokcdn-us.com/img1.jpeg"
    assert photo.thumbnail == photo.variants[0].url
    audio = res.items[3]
    assert audio.variants[0].label == "sound"
    # play/hdplay/wmplay duplicate the soundtrack on photo posts; never offered as video
    assert all(i.kind != "video" for i in res.items)


def test_map_slideshow_without_music():
    body = {"code": 0, "data": {**SLIDESHOW["data"]}}
    for k in ("music", "play", "hdplay", "wmplay"):
        body["data"].pop(k, None)
    res = map_tiktok("1", body)
    assert [i.kind for i in res.items] == ["image", "image", "image"]


def test_map_slideshow_empty_images_no_video_raises():
    body = {"code": 0, "data": {"id": "1", "title": "", "images": [],
            "author": {"unique_id": "u", "nickname": "U"}}}
    with pytest.raises(AppError) as exc:
        map_tiktok("1", body)
    assert exc.value.code == "no_video"


def test_map_slideshow_skips_non_https_images():
    body = {"code": 0, "data": {**SLIDESHOW["data"],
            "images": ["http://evil/img.jpg", "https://p16-sign.tiktokcdn-us.com/ok.jpeg"]}}
    res = map_tiktok("1", body)
    images = [i for i in res.items if i.kind == "image"]
    assert len(images) == 1
```

And append to `backend/tests/test_sizes.py`:

```python
def test_fill_sizes_skips_image_and_audio_kinds(respx_mock=None):
    import respx
    from app.schemas import MediaItem, ResolveResponse, Variant
    from app.sizes import fill_sizes
    resp = ResolveResponse(id="1", author="a", handle="h", avatar_url=None, text="", items=[
        MediaItem(index=1, kind="image", thumbnail=None, duration_seconds=None,
                  variants=[Variant(label="photo", url="https://p16-sign.tiktokcdn-us.com/i.jpeg")]),
        MediaItem(index=2, kind="audio", thumbnail=None, duration_seconds=None,
                  variants=[Variant(label="sound", url="https://www.tikwm.com/m.mp3")]),
    ])
    with respx.mock:  # no routes registered: any HEAD would raise
        fill_sizes(resp)
    assert resp.items[0].variants[0].size_bytes is None
    assert resp.items[1].variants[0].size_bytes is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_tiktok.py -k slideshow tests/test_sizes.py -k kinds -v`
Expected: FAIL (slideshow body currently raises `no_video` because it has no `hdplay` and its `play` maps as sd video, and image items are missing; sizes test fails because respx raises on the unmocked HEAD).

- [ ] **Step 3: Implement**

In `backend/app/tiktok.py`, inside `map_tiktok` after `data` is validated as a dict and BEFORE the video-variant loop, add the branch:

```python
    images = data.get("images")
    if isinstance(images, list):
        photo_urls = [u for u in images if isinstance(u, str) and u.startswith("https://")]
        if photo_urls:
            return _map_slideshow(url_id, data, photo_urls)
```

Add the helper (module level, near `map_tiktok`):

```python
def _map_slideshow(url_id: str, data: dict, photo_urls: list[str]) -> ResolveResponse:
    """Map a tikwm photo post: photos 1..N, soundtrack N+1. Never video."""
    author = data.get("author") or {}
    handle = author.get("unique_id") or "unknown"
    items: list[MediaItem] = [
        MediaItem(index=n, kind="image", thumbnail=u, duration_seconds=None,
                  variants=[Variant(label="photo", url=u)])
        for n, u in enumerate(photo_urls, start=1)
    ]
    music = data.get("music")
    if isinstance(music, str) and music.startswith("https://"):
        items.append(MediaItem(index=len(photo_urls) + 1, kind="audio", thumbnail=None,
                               duration_seconds=None,
                               variants=[Variant(label="sound", url=music)]))
    # play/hdplay/wmplay on photo posts duplicate the music URL (verified live
    # 2026-07-22); intentionally never mapped as video here.
    return ResolveResponse(
        id=str(data.get("id") or url_id),
        author=author.get("nickname") or handle,
        handle=handle,
        avatar_url=author.get("avatar"),
        text=(data.get("title") or "").strip(),
        items=items,
    )
```

Adjust the music key name to the controller-verified fact if it differs. Update the `MediaItem.kind` comment in `backend/app/schemas.py` to `# "video" | "gif" | "image" | "audio"`.

In `backend/app/sizes.py`, add the kind guard to the item loop:

```python
        for item in resp.items:
            if item.kind in ("image", "audio"):
                continue  # photos/sound show no size label; never HEAD them
            for variant in item.variants:
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_tiktok.py tests/test_sizes.py -v`
Expected: all pass (existing video tests untouched).

- [ ] **Step 5: Commit**

```bash
ruff check . && cd .. && git add backend/app/tiktok.py backend/app/sizes.py backend/app/schemas.py backend/tests/test_tiktok.py backend/tests/test_sizes.py && git commit -m "feat: tiktok slideshow mapping (photos, sound, rendered video)" && cd backend
```

---

### Task 2: Proxy Content-Type forwarding + 60/min limit

**Files:**
- Modify: `backend/app/proxy.py`
- Test: `backend/tests/test_proxy_api.py`

**Interfaces:**
- Produces: `/api/proxy` responds with the upstream Content-Type (parameters stripped) when present, `video/mp4` otherwise; rate limit `60/minute`. Everything else (allowlist, semaphore, filename sanitize, no redirect-follow, streaming) unchanged.

- [ ] **Step 1: Write the failing tests** (append to `backend/tests/test_proxy_api.py`)

```python
def test_proxy_forwards_upstream_content_type():
    import httpx
    import respx
    with respx.mock:
        respx.get("https://p16-sign.tiktokcdn-us.com/img1.jpeg").mock(
            return_value=httpx.Response(200, content=b"jpg", headers={
                "content-length": "3", "content-type": "image/jpeg; charset=binary"}))
        res = client().get("/api/proxy", params={
            "url": "https://p16-sign.tiktokcdn-us.com/img1.jpeg", "filename": "photo_1.jpg"})
        assert res.status_code == 200
        assert res.headers["content-type"] == "image/jpeg"
        assert 'filename="photo_1.jpg"' in res.headers["content-disposition"]


def test_proxy_defaults_to_mp4_without_upstream_type():
    import httpx
    import respx
    with respx.mock:
        respx.get("https://video.twimg.com/x.mp4").mock(
            return_value=httpx.Response(200, content=b"vid", headers={"content-length": "3"}))
        res = client().get("/api/proxy", params={"url": "https://video.twimg.com/x.mp4"})
        assert res.headers["content-type"].startswith("video/mp4")
```

(Match this file's existing `client()` helper usage exactly.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_proxy_api.py -k content_type -v`
Expected: FAIL (content-type is `video/mp4` for the jpeg).

- [ ] **Step 3: Implement** (edit `backend/app/proxy.py`)

Change the limit decorator from `@limiter.limit("20/minute")` to `@limiter.limit("60/minute")`.

Where the `StreamingResponse` is built, derive the media type from the upstream response (`resp` is the upstream `httpx.Response` in the existing code):

```python
    upstream_type = (resp.headers.get("content-type") or "").split(";")[0].strip() or "video/mp4"
```

and use `media_type=upstream_type` in the `StreamingResponse`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_proxy_api.py -v`
Expected: all pass (existing twimg/lookalike/control-char tests unchanged).

- [ ] **Step 5: Commit**

```bash
ruff check . && cd .. && git add backend/app/proxy.py backend/tests/test_proxy_api.py && git commit -m "feat: proxy forwards upstream content-type; 60/min for albums" && cd backend
```

---

### Task 3: Widen the event quality regex

**Files:**
- Modify: `backend/app/analytics/router.py`
- Test: `backend/tests/test_analytics_api.py`

**Interfaces:**
- Produces: `_QUALITY_OK = re.compile(r"^(\d{2,4}p|video|hd|sd|photo|album|sound)$")`.

- [ ] **Step 1: Write the failing test** (append to `backend/tests/test_analytics_api.py`, using this file's existing `enabled_client` fixture pattern)

```python
def test_event_accepts_slideshow_labels(enabled_client):
    client, store = enabled_client
    for q in ("photo", "album", "sound"):
        r = client.post("/api/event", json={"type": "download", "quality": q, "platform": "tiktok"})
        assert r.status_code == 204, q
    assert client.post("/api/event", json={"type": "download", "quality": "photos"}).status_code == 422
```

(Adapt the fixture unpacking to the file's actual shape; keep the assertions.)

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_analytics_api.py -k slideshow -v`
Expected: FAIL (`photo` rejected 422).

- [ ] **Step 3: Implement**

In `backend/app/analytics/router.py`:

```python
_QUALITY_OK = re.compile(r"^(\d{2,4}p|video|hd|sd|photo|album|sound)$")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_analytics_api.py -v && python -m pytest -q`
Expected: green.

- [ ] **Step 5: Commit**

```bash
ruff check . && cd .. && git add backend/app/analytics/router.py backend/tests/test_analytics_api.py && git commit -m "feat: accept photo, album, sound quality labels" && cd backend
```

---

### Task 4: TikTok cache TTL 900s

**Files:**
- Modify: `backend/app/cache.py`, `backend/app/resolve.py`
- Test: `backend/tests/test_cache.py`, `backend/tests/test_resolve_api.py`

**Interfaces:**
- Produces: `TTLCache.set(key, value, ttl: float | None = None)` (None = instance default); resolve caches tiktok entries with `ttl=900.0`, twitter with the default.

- [ ] **Step 1: Write the failing tests** (append to `backend/tests/test_cache.py`)

```python
def test_set_with_ttl_override_expires_earlier(monkeypatch):
    import time as time_mod
    from app.cache import TTLCache
    now = [1000.0]
    monkeypatch.setattr(time_mod, "monotonic", lambda: now[0])
    c = TTLCache(maxsize=4, ttl=3600.0)
    c.set("short", 1, ttl=900.0)
    c.set("long", 2)
    now[0] += 901.0
    assert c.get("short") is None
    assert c.get("long") == 2
```

And append to `backend/tests/test_resolve_api.py` (reuse this file's `client` fixture and `TT` fixture):

```python
def test_tiktok_resolve_cached_with_short_ttl(monkeypatch, client):
    calls = {}
    real_set = resolve_mod.cache.set
    monkeypatch.setattr(resolve_mod, "extract_tiktok", lambda url: TT)
    monkeypatch.setattr(resolve_mod.cache, "set",
                        lambda key, value, ttl=None: calls.update(ttl=ttl) or real_set(key, value, ttl=ttl))
    r = client.post("/api/resolve", json={"url": "https://www.tiktok.com/@user/video/7280000000000000000"})
    assert r.status_code == 200
    assert calls["ttl"] == 900.0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_cache.py -k override tests/test_resolve_api.py -k short_ttl -v`
Expected: FAIL (`set() got an unexpected keyword argument 'ttl'`).

- [ ] **Step 3: Implement**

`backend/app/cache.py` - `set` gains the override:

```python
    def set(self, key: str, value: Any, ttl: float | None = None) -> None:
        with self._lock:
            self._data[key] = (time.monotonic() + (ttl if ttl is not None else self.ttl), value)
            self._data.move_to_end(key)
            while len(self._data) > self.maxsize:
                self._data.popitem(last=False)
```

`backend/app/resolve.py` - where the result is cached, tiktok entries get the short TTL (tikwm URLs are time-signed; see spec):

```python
        cache.set(key, result, ttl=900.0 if platform == "tiktok" else None)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_cache.py tests/test_resolve_api.py -v`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
ruff check . && cd .. && git add backend/app/cache.py backend/app/resolve.py backend/tests/test_cache.py backend/tests/test_resolve_api.py && git commit -m "feat: 15 minute cache ttl for tiktok resolves" && cd backend
```

---

### Task 5: Frontend types + download helpers

**Files:**
- Modify: `frontend/src/lib/api.ts`, `frontend/src/lib/download.ts`
- Test: `frontend/src/lib/download.test.ts` (extend or create following the existing lib test layout)

**Interfaces:**
- Produces: `MediaItem.kind: "video" | "gif" | "image" | "audio"`; `buildMediaFilename(handle: string, id: string, kind: "photo" | "sound", n?: number): string` (sound extension is `.m4a`; the verified soundtrack is AAC/MP4, not mp3); `fetchBlob` types the Blob from the response Content-Type (fallback `video/mp4`). `downloadVariant(url, filename, onProgress)` signature unchanged.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "vitest";
import { buildMediaFilename } from "./download";

describe("buildMediaFilename", () => {
  test("photo filenames carry the 1-based position", () => {
    expect(buildMediaFilename("user", "730", "photo", 2)).toBe("user_730_photo_2.jpg");
  });
  test("sound filename", () => {
    expect(buildMediaFilename("user", "730", "sound")).toBe("user_730_sound.m4a");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- --run src/lib/download.test.ts`
Expected: FAIL (`buildMediaFilename` not exported).

- [ ] **Step 3: Implement**

`frontend/src/lib/api.ts`:

```ts
export type MediaItem = {
  index: number;
  kind: "video" | "gif" | "image" | "audio";
  thumbnail: string | null;
  duration_seconds: number | null;
  variants: Variant[];
};
```

`frontend/src/lib/download.ts` - add below `buildFilename`:

```ts
export function buildMediaFilename(
  handle: string,
  id: string,
  kind: "photo" | "sound",
  n?: number,
): string {
  return kind === "photo" ? `${handle}_${id}_photo_${n}.jpg` : `${handle}_${id}_sound.m4a`;
}
```

In `fetchBlob`, replace the hardcoded Blob type:

```ts
  const type = res.headers.get("content-type")?.split(";")[0] || "video/mp4";
```

and construct `new Blob(chunks as BlobPart[], { type })`.

- [ ] **Step 4: Run tests + build**

Run: `npm test -- --run && npm run build`
Expected: green.

- [ ] **Step 5: Commit**

```bash
cd .. && git add frontend/src/lib/api.ts frontend/src/lib/download.ts frontend/src/lib/download.test.ts && git commit -m "feat: media filename helper, content-type aware blobs, wider kind union"
```

---

### Task 6: PhotoGrid component + PreviewCard routing

**Files:**
- Create: `frontend/src/components/PhotoGrid.tsx`
- Modify: `frontend/src/components/PreviewCard.tsx`, `frontend/src/styles/index.css`
- Test: `frontend/src/components/PhotoGrid.test.tsx`

**Interfaces:**
- Consumes: `buildMediaFilename`, `downloadVariant`, `sendEvent(type, {quality, platform})`, `MediaItem` with `kind` union from Task 5.
- Produces: `PhotoGrid({ photos, audio, handle, id, platform }: { photos: MediaItem[]; audio: MediaItem | null; handle: string; id: string; platform: "twitter" | "tiktok" })`. PreviewCard splits items: `image` items and the `audio` item route to one PhotoGrid; `video`/`gif` items keep the existing MediaSection path.

**Behavior contract:**
- Grid of photo thumbnails using existing card/panel tokens; per-photo save state: idle, saving, saved, failed (state visible on the tile, e.g. overlay icon).
- Tap photo n: `sendEvent("download", { quality: "photo", platform })` once, then `downloadVariant(variant.url, buildMediaFilename(handle, id, "photo", n), ...)`; tile shows saved or failed from the promise result.
- Save all: exactly ONE `sendEvent("download", { quality: "album", platform })`, then photos download sequentially with a ~600ms stagger, updating each tile; a failure marks that tile failed and continues.
- Sound pill (rendered only when `audio` is non-null): one `sendEvent("download", { quality: "sound", platform })`, saves `{handle}_{id}_sound.m4a`.
- No emoji in labels: buttons read "Save all", "Sound", tile states use the existing check/cross iconography.

- [ ] **Step 1: Write the failing tests** (`frontend/src/components/PhotoGrid.test.tsx`, real DOM, mock `fetch` the way `QualityButton.test.tsx` mocks downloads - read that file first and mirror its stubbing approach)

Required assertions:
1. Renders one `img` per photo (fixture: 3 photos) and a "Save all" button; "Sound" appears only when `audio` is passed.
2. Clicking one photo fires exactly one `/api/event` beacon with body `{type:"download", quality:"photo", platform:"tiktok"}` and one proxy fetch whose URL contains `photo_2.jpg` for the second photo.
3. Clicking "Save all" fires exactly one beacon with `quality:"album"` (not one per photo) and one proxy fetch per photo.
4. Clicking "Sound" fires one beacon `quality:"sound"` and fetches a URL containing `sound.m4a`.

Write these as concrete tests against the mocked `fetch` call log; use `vi.useFakeTimers()` to fast-forward the stagger in the Save all test.

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- --run src/components/PhotoGrid.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `PhotoGrid.tsx` per the behavior contract, add `.photo-grid` styles to `frontend/src/styles/index.css` using existing tokens (responsive: 3 columns desktop, 2 at small sizes; tiles rounded like `.panel`). Wire into `PreviewCard.tsx`:

```tsx
const photos = data.items.filter((i) => i.kind === "image");
const audio = data.items.find((i) => i.kind === "audio") ?? null;
const media = data.items.filter((i) => i.kind === "video" || i.kind === "gif");
```

Render `<PhotoGrid photos={photos} audio={audio} handle={data.handle} id={data.id} platform={platform} />` when `photos.length > 0`, above the existing `media`-items map (which keeps rendering the rendered-slideshow video when present).

- [ ] **Step 4: Run tests + build**

Run: `npm test -- --run && npm run build`
Expected: green; all existing PreviewCard/QualityButton tests untouched and passing.

- [ ] **Step 5: Commit**

```bash
cd .. && git add frontend/src/components/PhotoGrid.tsx frontend/src/components/PhotoGrid.test.tsx frontend/src/components/PreviewCard.tsx frontend/src/styles/index.css && git commit -m "feat: slideshow photo grid with save all and soundtrack"
```

---

### Task 7: HD chip label rule

**Files:**
- Modify: `frontend/src/components/QualityButton.tsx`
- Test: `frontend/src/components/QualityButton.test.tsx`

**Interfaces:**
- Produces: HD chip shows when `variant.label === "hd"` OR `(variant.height ?? 0) >= 720`.

- [ ] **Step 1: Write the failing test** (append to `QualityButton.test.tsx`, mirroring its existing render helpers)

```tsx
test("hd label without dimensions still gets the HD chip", () => {
  render(
    <QualityButton
      variant={{ label: "hd", width: null, height: null, url: "https://v16m.tiktokcdn-us.com/x.mp4", size_bytes: 1000 }}
      filename="user_1_hd.mp4"
      platform="tiktok"
    />,
  );
  expect(screen.getByText("HD")).toBeInTheDocument();
  expect(screen.getByText("hd")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- --run src/components/QualityButton.test.tsx`
Expected: FAIL (no "HD" chip rendered).

- [ ] **Step 3: Implement**

```ts
  const isHd = (variant.height ?? 0) >= 720 || variant.label === "hd";
```

- [ ] **Step 4: Run tests + build**

Run: `npm test -- --run && npm run build`
Expected: green.

- [ ] **Step 5: Commit**

```bash
cd .. && git add frontend/src/components/QualityButton.tsx frontend/src/components/QualityButton.test.tsx && git commit -m "feat: hd chip for label-only hd variants"
```

---

### Task 8: TikTok how-to visual

**Files:**
- Create: `frontend/src/tiktok/TikTokHowToVisual.tsx`
- Modify: `frontend/src/tiktok/TikTokApp.tsx`
- Test: `frontend/src/tiktok/TikTokHowToVisual.test.tsx`

**Interfaces:**
- Consumes: nothing external; pure SVG component like `HowToVisual`.
- Produces: `TikTokHowToVisual()` rendered in `TikTokApp` above the step cards ("Three steps, no accounts" section), same slot the home page uses.

- [ ] **Step 1: Fork the art.** Copy `frontend/src/components/HowToVisual.tsx` to `frontend/src/tiktok/TikTokHowToVisual.tsx`, rename the exported components (`TikTokHowToVisual`, stacked variant included), keep the landscape-on-sm+/stacked-on-phone structure, theme-aware tokens, and red marker annotation style IDENTICAL. Change only the panel content:
  - Panel 1: post mock keeps the play button; the circled affordance reads "Copy link" with the share arrow (TikTok's Share then Copy link flow).
  - Panel 2: input text becomes `tiktok.com/@user/vid…`, Fetch button unchanged, circle unchanged.
  - Panel 3: two pills - primary `hd` with a small `HD` chip inside (circled), secondary `sd`; below them the saved-file line `user_123_hd.mp4` with the check icon and caption `saved to your device`; footnote text `No watermark. Straight from the source.`
  - All text uses the same font/token classes as the original. No em dashes, no emoji.

- [ ] **Step 2: Write the render test** (`frontend/src/tiktok/TikTokHowToVisual.test.tsx`)

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { TikTokHowToVisual } from "./TikTokHowToVisual";

test("renders the tiktok how-to art", () => {
  render(<TikTokHowToVisual />);
  expect(screen.getAllByText(/tiktok\.com\/@user/i).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/no watermark/i).length).toBeGreaterThan(0);
});
```

- [ ] **Step 3: Place it.** In `TikTokApp.tsx`, render `<TikTokHowToVisual />` directly above the "how it works" step-cards section, wrapped in the same figure/spacing classes `App.tsx` uses for `HowToVisual` (read `App.tsx` for the exact wrapper).

- [ ] **Step 4: Run tests + build, then verify visually**

Run: `npm test -- --run && npm run build`. Then load `/tiktokvideodownloader` in the dev server and confirm both themes render the graphic correctly at desktop and phone widths (the stacked variant swaps in).

- [ ] **Step 5: Commit**

```bash
cd .. && git add frontend/src/tiktok/TikTokHowToVisual.tsx frontend/src/tiktok/TikTokHowToVisual.test.tsx frontend/src/tiktok/TikTokApp.tsx && git commit -m "feat: tiktok how-to visual with annotated steps"
```

---

### Task 9: TikTok page updates (example chip + FAQ flip)

**Files:**
- Modify: `frontend/src/tiktok/TikTokApp.tsx`, `frontend/tiktokvideodownloader.html`
- Test: `frontend/src/tiktok/TikTokApp.test.tsx`

**Interfaces:**
- Consumes: the `useResolve` hook and chip pattern from `App.tsx` (`EXAMPLE_URL` const, `runExample` sets prefill + resolves).
- Produces: a "try an example" chip on the TikTok page; slideshow FAQ answered yes.

- [ ] **Step 1: Example chip.** Mirror `App.tsx`'s pattern exactly (read `App.tsx:15,168-180`):

```tsx
const EXAMPLE_URL = "https://www.tiktok.com/@scout2015/video/6718335390845095173";
```

Chip button labeled `▶ try an example` in the chip row, `runExample` mirrors home (prefill + resolve). The URL above was live-verified resolving on 2026-07-22; re-verify manually during implementation and swap for another stable public video if it died.

- [ ] **Step 2: Test.** Append to `TikTokApp.test.tsx`: clicking the example chip puts the example URL in the textbox (mirror how `App.test.tsx` covers the home chip if it does; otherwise assert the input value after click with a mocked fetch).

- [ ] **Step 3: FAQ flip.** In `frontend/tiktokvideodownloader.html`, update BOTH the visible `<details>` slideshow answer and the matching JSON-LD `acceptedAnswer` text to:

> Yes. Photo slideshows resolve to a photo grid: save any photo, save them all in one tap, or grab the soundtrack as an audio file. Your browser may ask once to allow multiple downloads.

Keep phrasing identical in both places apart from JSON-LD escaping. No em dashes, no emoji.

- [ ] **Step 4: Run tests + build**

Run: `npm test -- --run && npm run build`
Expected: green.

- [ ] **Step 5: Commit**

```bash
cd .. && git add frontend/src/tiktok/TikTokApp.tsx frontend/src/tiktok/TikTokApp.test.tsx frontend/tiktokvideodownloader.html && git commit -m "feat: tiktok example chip; slideshow faq now yes"
```

---

### Task 10: TikTok OG image

**Files:**
- Create: `frontend/public/og-tiktok.png`
- Modify: `scripts/make_og.py` (parameterize or copy the pattern), `frontend/tiktokvideodownloader.html`

**Interfaces:**
- Produces: `og-tiktok.png` (1200x630, same visual system as `og.png`, TikTok wording: "TikTok Video Downloader" / "No watermark. Free."); the TikTok page's `og:image` and `twitter:image` meta point to `https://savevidai.israfill.dev/og-tiktok.png`.

- [ ] **Step 1:** Read `scripts/make_og.py` and `frontend/public/og.png` (visually). Extend the script to emit the TikTok variant (a `--variant tiktok` flag or a small second function) with the TikTok title/subtitle. Run it; confirm the PNG is 1200x630 and visually consistent (open it).
- [ ] **Step 2:** Point `og:image`/`twitter:image` in `frontend/tiktokvideodownloader.html` at `https://savevidai.israfill.dev/og-tiktok.png`.
- [ ] **Step 3:** `npm run build` and confirm `dist/og-tiktok.png` is emitted.
- [ ] **Step 4: Commit**

```bash
git add scripts/make_og.py frontend/public/og-tiktok.png frontend/tiktokvideodownloader.html && git commit -m "feat: tiktok-specific og image"
```

---

### Task 11: Full verification

**Files:** none; release gate.

- [ ] **Step 1:** Backend: `cd backend && source .venv/bin/activate && python -m pytest -q && ruff check . && deactivate && cd ..` - green, 5 baseline warnings.
- [ ] **Step 2:** Frontend: `cd frontend && npm test -- --run && npm run build && cd ..` - green, all entries emitted.
- [ ] **Step 3:** Live slideshow e2e (combined dev server, `sh scripts/dev.sh` or the launch config): resolve a real public slideshow URL via `POST /api/resolve`; confirm image items with photo labels, audio item, indexes per contract; confirm every returned host passes the proxy allowlist.
- [ ] **Step 4:** Browser: on `/tiktokvideodownloader`, resolve the slideshow; grid renders; save one photo (jpg arrives, correct name); Save all saves every photo with visible per-tile state; Sound saves the mp3; exactly one beacon per action (network tab); zero console errors.
- [ ] **Step 5:** Regression: resolve a TikTok video (hd pill shows HD chip) and run the home example chip (twitter flow unchanged). How-to visual renders both themes, desktop + phone widths.
- [ ] **Step 6:** Commit any verification fixes: `git add <files> && git commit -m "fix: slideshow verification-pass fixes"` (only if needed). Merge readiness is judged by the whole-branch review. Do not push or deploy without the owner.
