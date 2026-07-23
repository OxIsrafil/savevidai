import asyncio
import re
from urllib.parse import unquote, urlparse

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from .errors import UPSTREAM, AppError, app_error
from .limits import limiter
from .reddit import REDDIT_MEDIA_HOSTS
from .tiktok import TIKTOK_MEDIA_HOSTS

router = APIRouter()

# Exact hosts or registrable suffixes allowed as download sources. Suffix match
# is boundary-safe (host == d or host endswith "." + d), never substring, so
# "video.twimg.com.evil.com" and "tikwm.com.evil.com" are rejected.
# "redd.it" is a registrable suffix, so the dot-suffix rule covers both
# v.redd.it (video) and i.redd.it (images) while rejecting "redd.it.evil.com".
_ALLOWED_HOSTS = ("video.twimg.com", *TIKTOK_MEDIA_HOSTS, *REDDIT_MEDIA_HOSTS)
_SAFE = re.compile(r"[^A-Za-z0-9._-]")


def _allowed_host(url: str) -> bool:
    if not url.startswith("https://"):
        return False
    try:
        host = (urlparse(url).hostname or "").lower()
    except ValueError:
        return False
    return any(host == d or host.endswith("." + d) for d in _ALLOWED_HOSTS)
_SEM = asyncio.Semaphore(8)  # fallback path only; protects the small VPS from saturation


@router.get("/api/proxy")
@limiter.limit("60/minute")
async def proxy(request: Request, url: str, filename: str = "video.mp4"):
    if not _allowed_host(url):
        raise AppError("forbidden_url", "This URL host is not allowed.", 403)
    name = _SAFE.sub("_", unquote(filename))[:120] or "video.mp4"

    await _SEM.acquire()
    client = httpx.AsyncClient(timeout=httpx.Timeout(30.0, read=60.0))
    try:
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
    upstream_type = (upstream.headers.get("content-type") or "").split(";")[0].strip() or "video/mp4"
    return StreamingResponse(stream(), media_type=upstream_type, headers=headers)
