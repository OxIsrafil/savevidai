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
    """Run the mapper over untrusted upstream HTML; any shape we didn't
    anticipate becomes a clean upstream_error instead of an unhandled 500
    (mirrors extractor/tiktok/instagram)."""
    try:
        return map_facebook(id_, status, body)
    except AppError:
        raise
    except Exception as exc:
        logger.warning("facebook mapping failed for %s: %r", id_, exc)
        raise app_error(UPSTREAM) from exc


def _allowed_media_url(url: str) -> bool:
    """Boundary-safe suffix match, never substring (mirrors proxy.py), so a
    hijacked fixer pointing og:video off-CDN can never mint a download link."""
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
