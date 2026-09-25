"""Resolve tweets to downloadable video variants via the FixTweet public API.

Twitter closed anonymous/guest video access, so yt-dlp can no longer read video
without a logged-in account's cookies. The fxtwitter API (api.fxtwitter.com) needs
no auth and returns video.twimg.com URLs. That CDN allows cross-origin reads but
403s a third-party Referer, so the frontend fetches those URLs directly with no
Referer and falls back to /api/proxy only when a direct read fails; nothing is
stored either way. vxtwitter is a lower-fidelity fallback (single quality) used
when fxtwitter has a transport/upstream failure, or when its 404 does not survive
a recheck (see _recheck_not_found). When extraction breaks, the fix is usually a
FixTweet-side change, not ours; see CONTRIBUTING.
"""
import logging
import re
import secrets

import httpx

from .errors import NO_VIDEO, NOT_FOUND, PRIVATE, UPSTREAM, AppError, app_error
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
        if first.code == NOT_FOUND[0]:
            return _recheck_not_found(tweet_id, first)
        if first.code != UPSTREAM[0]:
            raise  # definitive private/no_video: do not retry
        try:
            return _map_guarded(map_vxtwitter, tweet_id, _get_json(_VX_URL.format(tweet_id)))
        except AppError:
            raise first from None


def _recheck_not_found(tweet_id: str, first: AppError) -> ResolveResponse:
    """fxtwitter's 404 is not proof the post is gone. Since 2026-09-15 it answers
    404 for many live posts (FxEmbed issue #2490, mostly age-restricted media),
    and its edge cache keeps serving that 404. Ask fxtwitter again past the
    cache, then vxtwitter, and report not_found only when neither finds the post.

    The recheck logs which source answered and nothing about the post, so the
    rate of false 404s stays measurable without recording what anyone saves."""
    uncached = f"{_FX_URL.format(tweet_id)}?cb={secrets.token_hex(4)}"
    for source, mapper, url in (("fxtwitter uncached", map_fxtwitter, uncached),
                                ("vxtwitter", map_vxtwitter, _VX_URL.format(tweet_id))):
        try:
            result = _map_guarded(mapper, tweet_id, _get_json(url, quiet=True), quiet=True)
        except AppError as exc:
            if exc.code in (NO_VIDEO[0], PRIVATE[0]):
                logger.warning("twitter 404 recheck: %s says %s", source, exc.code)
                raise  # the post exists; this answer is more precise than not_found
            continue
        logger.warning("twitter 404 recheck: recovered via %s", source)
        return result
    logger.warning("twitter 404 recheck: confirmed not_found")
    raise first


def _map_guarded(mapper, tweet_id: str, body: dict, quiet: bool = False) -> ResolveResponse:
    """Run a mapper over untrusted upstream JSON; any shape we didn't anticipate
    becomes a clean upstream_error instead of an unhandled 500."""
    try:
        return mapper(tweet_id, body)
    except AppError:
        raise
    except Exception as exc:
        # Spec: upstream failures are logged with the tweet ID so FixTweet-side
        # breakage (usually a schema change) is visible immediately. The 404
        # recheck passes quiet=True: it runs on every not_found, and naming each
        # of those posts would log what visitors try to save.
        if not quiet:
            logger.warning("mapping failed for tweet %s via %s: %r", tweet_id, mapper.__name__, exc)
        raise app_error(UPSTREAM) from exc


def _get_json(url: str, quiet: bool = False) -> dict:
    """GET and parse JSON. Any transport error or non-JSON body maps to UPSTREAM.

    Returns the parsed body regardless of HTTP status: FixTweet sends its JSON
    (with a `code` field) even on 404/401, and the caller interprets that code.
    quiet=True skips the per-URL warnings (the URL names the post).
    """
    try:
        resp = httpx.get(url, headers={"User-Agent": _UA}, timeout=10.0, follow_redirects=True)
    except httpx.HTTPError as exc:
        if not quiet:
            logger.warning("upstream fetch failed for %s: %r", url, exc)
        raise app_error(UPSTREAM) from exc
    try:
        body = resp.json()
    except ValueError as exc:
        if not quiet:
            logger.warning("upstream returned non-JSON for %s (status %s)", url, resp.status_code)
        raise app_error(UPSTREAM) from exc
    if not isinstance(body, dict):
        if not quiet:
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
