"""Resolve tweets to downloadable video variants via the FixTweet public API.

Twitter closed anonymous/guest video access, so yt-dlp can no longer read video
without a logged-in account's cookies. The fxtwitter API (api.fxtwitter.com) needs
no auth and returns video.twimg.com URLs, so the browser still downloads straight
from Twitter's CDN. vxtwitter is a lower-fidelity fallback (single quality) used
only when fxtwitter has a transport/upstream failure. When extraction breaks, the
fix is usually a FixTweet-side change, not ours; see CONTRIBUTING.
"""
import logging
import re

import httpx

from .errors import NOT_FOUND, NO_VIDEO, PRIVATE, UPSTREAM, AppError, app_error
from .schemas import MediaItem, ResolveResponse, Variant

logger = logging.getLogger("savevidai.extractor")

_FX_URL = "https://api.fxtwitter.com/i/status/{}"
_VX_URL = "https://api.vxtwitter.com/i/status/{}"
_UA = "SaveVidAI/1.0 (+https://savevidai.israfill.dev)"
_RES_RE = re.compile(r"/(\d+)x(\d+)/")
_TWIMG = "https://video.twimg.com/"


def extract(tweet_id: str) -> ResolveResponse:
    """Resolve a tweet ID to its video variants. fxtwitter primary, vxtwitter fallback."""
    try:
        return _map_guarded(map_fxtwitter, tweet_id, _get_json(_FX_URL.format(tweet_id)))
    except AppError as first:
        if first.code != UPSTREAM[0]:
            raise  # definitive not_found/private/no_video: do not retry
        try:
            return _map_guarded(map_vxtwitter, tweet_id, _get_json(_VX_URL.format(tweet_id)))
        except AppError:
            raise first from None


def _map_guarded(mapper, tweet_id: str, body: dict) -> ResolveResponse:
    """Run a mapper over untrusted upstream JSON; any shape we didn't anticipate
    becomes a clean upstream_error instead of an unhandled 500."""
    try:
        return mapper(tweet_id, body)
    except AppError:
        raise
    except Exception as exc:
        # Spec: upstream failures are logged with the tweet ID so FixTweet-side
        # breakage (usually a schema change) is visible immediately.
        logger.warning("mapping failed for tweet %s via %s: %r", tweet_id, mapper.__name__, exc)
        raise app_error(UPSTREAM) from exc


def _get_json(url: str) -> dict:
    """GET and parse JSON. Any transport error or non-JSON body maps to UPSTREAM.

    Returns the parsed body regardless of HTTP status: FixTweet sends its JSON
    (with a `code` field) even on 404/401, and the caller interprets that code.
    """
    try:
        resp = httpx.get(url, headers={"User-Agent": _UA}, timeout=10.0, follow_redirects=True)
    except httpx.HTTPError as exc:
        logger.warning("upstream fetch failed for %s: %r", url, exc)
        raise app_error(UPSTREAM) from exc
    try:
        body = resp.json()
    except ValueError as exc:
        logger.warning("upstream returned non-JSON for %s (status %s)", url, resp.status_code)
        raise app_error(UPSTREAM) from exc
    if not isinstance(body, dict):
        logger.warning("upstream returned non-object JSON for %s", url)
        raise app_error(UPSTREAM)
    return body


def _parse_res(url: str) -> tuple[int | None, int | None]:
    m = _RES_RE.search(url)
    if not m:
        return None, None
    return int(m.group(1)), int(m.group(2))


def _mp4_variant(url: str) -> Variant | None:
    if not url.startswith(_TWIMG):
        return None
    width, height = _parse_res(url)
    return Variant(label=f"{height}p" if height else "video", width=width, height=height, url=url)


def map_fxtwitter(tweet_id: str, body: dict) -> ResolveResponse:
    code = body.get("code")
    if code == 401:
        raise app_error(PRIVATE)
    if code == 404:
        raise app_error(NOT_FOUND)
    if code != 200:
        raise app_error(UPSTREAM)
    tweet = body.get("tweet") or {}
    author = tweet.get("author") or {}
    items: list[MediaItem] = []
    for vid in (tweet.get("media") or {}).get("videos") or []:
        if not isinstance(vid, dict):
            continue
        variants: list[Variant] = []
        for var in vid.get("variants") or []:
            if not isinstance(var, dict) or var.get("content_type") != "video/mp4":
                continue  # skip non-dicts and HLS playlists
            variant = _mp4_variant(var.get("url") or "")
            if variant:
                variants.append(variant)
        if not variants:
            continue
        variants.sort(key=lambda v: (v.height or 0, v.width or 0), reverse=True)
        items.append(MediaItem(
            index=len(items) + 1,
            kind="gif" if vid.get("type") == "gif" else "video",
            thumbnail=vid.get("thumbnail_url"),
            duration_seconds=vid.get("duration"),
            variants=variants,
        ))
    if not items:
        raise app_error(NO_VIDEO)
    handle = author.get("screen_name") or "unknown"
    return ResolveResponse(
        id=tweet_id,
        author=author.get("name") or handle,
        handle=handle,
        avatar_url=author.get("avatar_url"),
        text=(tweet.get("text") or "").strip(),
        items=items,
    )


def map_vxtwitter(tweet_id: str, body: dict) -> ResolveResponse:
    if body.get("error"):
        raise app_error(NOT_FOUND)
    handle = body.get("user_screen_name") or "unknown"
    items: list[MediaItem] = []
    index = 0
    for media in body.get("media_extended") or []:
        if not isinstance(media, dict):
            continue
        if media.get("type") not in ("video", "gif"):
            continue  # skip images
        variant = _mp4_variant(media.get("url") or "")
        if not variant:
            continue
        index += 1
        size = media.get("size") or {}
        if variant.height is None and size.get("height"):
            variant = Variant(label=f"{size['height']}p", width=size.get("width"),
                              height=size.get("height"), url=variant.url)
        millis = media.get("duration_millis")
        items.append(MediaItem(
            index=index,
            kind="gif" if media.get("type") == "gif" else "video",
            thumbnail=media.get("thumbnail_url"),
            duration_seconds=(millis / 1000.0) if millis else None,
            variants=[variant],
        ))
    if not items:
        raise app_error(NO_VIDEO)
    return ResolveResponse(
        id=tweet_id,
        author=body.get("user_name") or handle,
        handle=handle,
        text=(body.get("text") or "").strip(),
        items=items,
    )
