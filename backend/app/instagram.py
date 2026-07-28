"""Resolve Instagram posts to direct CDN media via the kkinstagram redirect service.

kkinstagram is a pure redirector: GET /reel/<shortcode> answers 302 with a
Location on Instagram's own CDN. It serves no HTML and no metadata, so
responses are metadata-light by design: no author, caption, or thumbnail
(owner-accepted). Carousels resolve to their first item only (the service has
no index syntax; verified 2026-07-29). Media is progressive (single file) and
the CDN allows cross-origin fetches, so the browser downloads directly and
/api/proxy is only a fallback. CDN URLs are signed with a short expiry, so
resolve.py caches instagram with a reduced TTL. Single volunteer-run
dependency, like tikwm; a fallback fixer can slot in here later (mirrors
fxtwitter -> vxtwitter). kkinstagram gates the media redirect on embed-crawler
user agents, so the UA carries the Discordbot token alongside our own identity;
if resolves start failing with upstream_error, check this gate first.
"""
import base64
import json
import logging
from urllib.parse import parse_qs, urlparse

import httpx

from .errors import NOT_FOUND, UPSTREAM, AppError, app_error
from .schemas import MediaItem, ResolveResponse, Variant

logger = logging.getLogger("savevidai.instagram")

_FIXER = "https://kkinstagram.com"
# The Discordbot token is load-bearing: kkinstagram serves the media 302 only to
# embed-crawler UAs and 301s everything else to an "open in app" page (verified
# live 2026-07-29). Our own name and contact URL stay in the string.
_UA = "SaveVidAI/1.0 (compatible; Discordbot/2.0; +https://savevidai.israfill.dev)"
# Registrable suffixes the redirect may land on (scontent*.cdninstagram.com,
# scontent*.fbcdn.net). NOTE: this tuple feeds the /api/proxy SSRF allowlist,
# so widening it widens what the proxy will fetch on the server's behalf -
# change with care.
INSTAGRAM_MEDIA_HOSTS = ("cdninstagram.com", "fbcdn.net")

_IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".webp")
_REDIRECTS = (301, 302, 303, 307, 308)


def extract_instagram(shortcode: str) -> ResolveResponse:
    try:
        resp = httpx.get(f"{_FIXER}/reel/{shortcode}", headers={"User-Agent": _UA},
                         timeout=12.0, follow_redirects=False)
    except httpx.HTTPError as exc:
        logger.warning("instagram fetch failed for %s: %r", shortcode, exc)
        raise app_error(UPSTREAM) from exc
    return _map_guarded(shortcode, resp.status_code, resp.headers.get("location"))


def _map_guarded(shortcode: str, status: int, location: str | None) -> ResolveResponse:
    """Run the mapper over untrusted upstream output; any shape we didn't
    anticipate becomes a clean upstream_error instead of an unhandled 500
    (mirrors extractor/tiktok)."""
    try:
        return map_instagram(shortcode, status, location)
    except AppError:
        raise
    except Exception as exc:
        logger.warning("instagram mapping failed for %s: %r", shortcode, exc)
        raise app_error(UPSTREAM) from exc


def _allowed_media_url(url: str) -> bool:
    """Boundary-safe suffix match, never substring (mirrors proxy.py), so a
    hijacked fixer redirecting off-CDN can never mint a download link."""
    if not url.startswith("https://"):
        return False
    host = (urlparse(url).hostname or "").lower()
    return any(host == d or host.endswith("." + d) for d in INSTAGRAM_MEDIA_HOSTS)


def _duration(url: str) -> float | None:
    """Best-effort: the CDN URL's efg param is base64 JSON with duration_s."""
    try:
        efg = parse_qs(urlparse(url).query).get("efg", [""])[0]
        val = json.loads(base64.b64decode(efg + "=" * (-len(efg) % 4))).get("duration_s")
        return float(val) if isinstance(val, (int, float)) else None
    except Exception:
        return None


def map_instagram(shortcode: str, status: int, location: str | None) -> ResolveResponse:
    if status == 404:
        raise app_error(NOT_FOUND)
    if status not in _REDIRECTS or not location:
        raise app_error(UPSTREAM)
    if not _allowed_media_url(location):
        logger.warning("instagram redirect to disallowed host for %s", shortcode)
        raise app_error(UPSTREAM)
    path = urlparse(location).path.lower()
    if path.endswith(_IMAGE_EXTS):
        kind, label, duration = "image", "photo", None
    elif path.endswith(".gif"):
        kind, label, duration = "gif", "gif", None
    else:
        kind, label, duration = "video", "hd", _duration(location)
    return ResolveResponse(
        id=shortcode,
        author="Instagram",
        handle=shortcode,
        avatar_url=None,
        text="",
        items=[MediaItem(index=1, kind=kind, thumbnail=None, duration_seconds=duration,
                         variants=[Variant(label=label, url=location)])],
    )
