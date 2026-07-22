"""Resolve TikTok posts to no-watermark video variants via a tikwm-style API.

The API takes the full TikTok URL (it follows vm./vt. short links itself) and
returns direct mp4 URLs on TikTok's own CDN. Bytes therefore flow through those
hosts, so a resolver outage can break downloads, not just resolving; a fallback
resolver can be added here later (mirrors fxtwitter -> vxtwitter).
"""
import logging

import httpx

from .errors import NO_VIDEO, NOT_FOUND, UPSTREAM, AppError, app_error
from .schemas import MediaItem, ResolveResponse, Variant

logger = logging.getLogger("savevidai.tiktok")

_API = "https://www.tikwm.com/api/"
_UA = "SaveVidAI/1.0 (+https://savevidai.israfill.dev)"
# Byte hosts the /api/proxy allowlist must accept for TikTok. Registrable
# suffixes verified against a real response on 2026-07-22; the proxy suffix
# matches (host == d or host.endswith("." + d)). Bytes are served from regional
# TikTok CDNs (v16m*.tiktokcdn-us.com here; plain tiktokcdn.com and
# tiktokcdn-eu.com exist for other regions), and tikwm sometimes serves bytes
# itself.
# NOTE: this tuple feeds the /api/proxy SSRF allowlist, so widening it widens
# what the proxy will fetch on the server's behalf - change with care.
TIKTOK_MEDIA_HOSTS = ("tikwm.com", "tiktokcdn.com", "tiktokcdn-us.com", "tiktokcdn-eu.com")


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
    return _map_guarded(url, body)


def _map_guarded(url_id: str, body: dict) -> ResolveResponse:
    """Run the mapper over untrusted upstream JSON; any shape we didn't anticipate
    becomes a clean upstream_error instead of an unhandled 500 (mirrors extractor)."""
    try:
        return map_tiktok(url_id, body)
    except AppError:
        raise
    except Exception as exc:
        logger.warning("tiktok mapping failed for %s: %r", url_id, exc)
        raise app_error(UPSTREAM) from exc


def _size(value: object) -> int | None:
    """Byte counts are trusted only when a positive int; else fill_sizes fills it."""
    return value if isinstance(value, int) and value > 0 else None


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


def map_tiktok(url_id: str, body: dict) -> ResolveResponse:
    if body.get("code") != 0:
        msg = str(body.get("msg", "")).lower()
        if "not" in msg and ("found" in msg or "exist" in msg):
            raise app_error(NOT_FOUND)
        raise app_error(UPSTREAM)
    data = body.get("data")
    if not isinstance(data, dict):
        raise app_error(UPSTREAM)
    images = data.get("images")
    if isinstance(images, list):
        photo_urls = [u for u in images if isinstance(u, str) and u.startswith("https://")]
        if photo_urls:
            return _map_slideshow(url_id, data, photo_urls)
    author = data.get("author") or {}
    variants: list[Variant] = []
    # hdplay/play are watermark-free; wmplay carries the watermark and is never offered.
    for key, label, size_key in (("hdplay", "hd", "hd_size"), ("play", "sd", "size")):
        u = data.get(key)
        if isinstance(u, str) and u.startswith("https://"):
            variants.append(Variant(label=label, url=u, size_bytes=_size(data.get(size_key))))
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
