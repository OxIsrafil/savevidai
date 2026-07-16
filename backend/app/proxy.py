import asyncio
import re
from urllib.parse import unquote

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from .errors import UPSTREAM, AppError, app_error
from .limits import limiter

router = APIRouter()

_ALLOWED_PREFIX = "https://video.twimg.com/"
_SAFE = re.compile(r"[^A-Za-z0-9._-]")
_SEM = asyncio.Semaphore(8)  # fallback path only; protects the small VPS from saturation


@router.get("/api/proxy")
@limiter.limit("20/minute")
async def proxy(request: Request, url: str, filename: str = "video.mp4"):
    if not url.startswith(_ALLOWED_PREFIX):
        raise AppError("forbidden_url", "Only video.twimg.com URLs can be proxied.", 403)
    name = _SAFE.sub("_", unquote(filename))[:120] or "video.mp4"

    await _SEM.acquire()
    client = httpx.AsyncClient(timeout=httpx.Timeout(30.0, read=60.0))
    try:
        upstream = await client.send(client.build_request("GET", url), stream=True)
    except httpx.HTTPError:
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
    return StreamingResponse(stream(), media_type="video/mp4", headers=headers)
