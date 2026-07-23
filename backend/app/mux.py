"""Manifest-driven mux endpoint: merge v.redd.it's split video+audio streams.

Reddit serves a DASH manifest whose video and audio tracks are separate byte
streams; a browser download of a single rendition therefore has no sound. This
endpoint reads the manifest (via ``reddit.fetch_manifest``), downloads the chosen
video rendition plus the audio track, and stream-copies them into one mp4 with
ffmpeg (``-c copy``: no re-encode, no quality loss, nothing transcoded). The
merge is ephemeral: both inputs and the output live in a per-request temp dir
that is deleted the instant the response finishes streaming.

Nothing is stored, no Reddit credentials are used (the byte fetch is anonymous
with the SaveVidAI UA), and the whole heavy path runs under a size-2 semaphore so
a small VPS is never asked to run more than two ffmpeg merges at once. When a clip
has no audio track the manifest carries no audio Representation, and we simply
307 the caller at the existing /api/proxy for the bare video rather than spinning
up ffmpeg for a no-op copy.
"""
import asyncio
import logging
import os
import re
import shutil
import tempfile
from urllib.parse import quote, unquote

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse, StreamingResponse

from . import reddit
from .errors import INVALID_URL, NO_VIDEO, UPSTREAM, AppError, app_error
from .limits import limiter

logger = logging.getLogger("savevidai.mux")

router = APIRouter()

# A v.redd.it video id: bare alphanumerics, 8-20 chars (matches reddit._VREDD_ID_RE
# length bounds). Re-checked here because the id is spliced into byte-fetch URLs.
_VID_RE = re.compile(r"[A-Za-z0-9]{8,20}")

# The rendition ladder the endpoint will serve. A request outside this set is a
# 422 rather than a silent nearest-match, so callers only ever ask for real rungs.
_HEIGHTS = frozenset({144, 240, 360, 480, 540, 720, 1080})

# Content-Disposition filename is attacker-influenced (query param), so it is
# reduced to a bare filename charset, matching /api/proxy's sanitiser exactly.
_SAFE = re.compile(r"[^A-Za-z0-9._-]")

# The byte fetch to v.redd.it is anonymous; this UA is the contract with the host
# (the same identity the manifest fetch uses, minus the URL comment).
_MUX_UA = "SaveVidAI/1.0"

# Combined (video + audio) Content-Length ceiling. Read from headers before any
# body is pulled, so an oversize clip is rejected without touching the disk.
_MAX_BYTES = 300 * 1024 * 1024

# Wall-clock ceiling on the ffmpeg stream-copy. A copy of a few-minute clip is
# near-instant; anything past 60s is a stuck/hostile input, killed and surfaced
# as an upstream error.
_FFMPEG_TIMEOUT = 60.0

# ffmpeg + disk I/O are heavier than a plain proxy stream, so the concurrency cap
# is tighter (2) than proxy's 8. Acquired only on the audio-present merge path.
_SEM = asyncio.Semaphore(2)

# 413: the app's shared error specs have no "too large", so it is defined here.
_TOO_LARGE = ("too_large", "This video is too large to merge on the fly.", 413)


def _pick_rendition(manifest: reddit.Manifest, height: int) -> reddit.Rendition | None:
    """Return the rendition with the requested height, else the nearest below it.

    ``manifest.videos`` is sorted height-descending, so the first rendition whose
    height is <= the request is simultaneously the exact match (when present) and
    otherwise the largest rung below the request. None means every rendition is
    taller than the request (no acceptable rung), which the caller maps to
    NO_VIDEO.
    """
    for rendition in manifest.videos:
        if rendition.height <= height:
            return rendition
    return None


def _content_length(resp: httpx.Response) -> int:
    """Parse a response's Content-Length header, or 0 when absent/malformed."""
    raw = resp.headers.get("content-length")
    if raw is None or not raw.isdigit():
        return 0
    return int(raw)


async def _write_stream(resp: httpx.Response, dest: str) -> None:
    """Write an already-opened streaming response body to ``dest`` with a cap.

    The combined-header check runs before either body is pulled; this per-chunk
    guard is defense in depth against an upstream that lies about (or omits) its
    Content-Length and then streams a body larger than the ceiling.
    """
    written = 0
    with open(dest, "wb") as out:
        async for chunk in resp.aiter_bytes(1 << 16):
            written += len(chunk)
            if written > _MAX_BYTES:
                raise AppError(*_TOO_LARGE)
            out.write(chunk)


@router.get("/api/mux/{vid}/{height}.mp4")
@limiter.limit("10/minute")
async def mux(request: Request, vid: str, height: int, filename: str = "video.mp4"):
    if not _VID_RE.fullmatch(vid) or height not in _HEIGHTS:
        raise app_error(INVALID_URL)

    manifest = reddit.fetch_manifest(vid)
    rendition = _pick_rendition(manifest, height)
    if rendition is None:
        raise app_error(NO_VIDEO)

    name = _SAFE.sub("_", unquote(filename))[:120] or "video.mp4"
    video_url = f"https://v.redd.it/{vid}/{rendition.base_url}"

    # Silent clip: no audio track to merge, so hand the bare video to /api/proxy.
    # The url is left literal (not percent-encoded) so the proxy's allowlist sees
    # a real v.redd.it URL; only the filename, which may carry odd characters,
    # is escaped.
    if manifest.audio_base is None:
        target = f"/api/proxy?url={video_url}&filename={quote(name)}"
        return RedirectResponse(target, status_code=307)

    audio_url = f"https://v.redd.it/{vid}/{manifest.audio_base}"

    # ffmpeg is a runtime dependency of the image; if it is somehow absent, fail
    # loudly as an upstream error rather than 500-ing on the subprocess launch.
    if shutil.which("ffmpeg") is None:
        logger.error("ffmpeg is not on PATH; cannot mux %s", vid)
        raise app_error(UPSTREAM)

    await _SEM.acquire()
    tmpdir = tempfile.mkdtemp(prefix="mux-")
    released = False
    try:
        video_path = os.path.join(tmpdir, "video")
        audio_path = os.path.join(tmpdir, "audio")
        out_path = os.path.join(tmpdir, "out.mp4")

        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, read=60.0)) as client:
            # Open both streams and read their advertised sizes BEFORE pulling any
            # body, so a combined-oversize pair is rejected without disk writes.
            v_resp = await client.send(
                client.build_request("GET", video_url, headers={"User-Agent": _MUX_UA}),
                stream=True,
            )
            try:
                if v_resp.status_code != 200:
                    logger.warning("v.redd.it video non-200 (%s) for %s", v_resp.status_code, vid)
                    raise app_error(UPSTREAM)
                a_resp = await client.send(
                    client.build_request("GET", audio_url, headers={"User-Agent": _MUX_UA}),
                    stream=True,
                )
                try:
                    if a_resp.status_code != 200:
                        logger.warning("v.redd.it audio non-200 (%s) for %s", a_resp.status_code, vid)
                        raise app_error(UPSTREAM)
                    if _content_length(v_resp) + _content_length(a_resp) > _MAX_BYTES:
                        raise AppError(*_TOO_LARGE)
                    await _write_stream(v_resp, video_path)
                    await _write_stream(a_resp, audio_path)
                finally:
                    await a_resp.aclose()
            finally:
                await v_resp.aclose()

        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-y", "-i", video_path, "-i", audio_path,
            "-c", "copy", "-movflags", "+faststart", out_path,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
        )
        try:
            _, stderr = await asyncio.wait_for(proc.communicate(), timeout=_FFMPEG_TIMEOUT)
        except (asyncio.TimeoutError, TimeoutError):
            proc.kill()
            await proc.wait()
            logger.warning("ffmpeg timed out merging %s", vid)
            raise app_error(UPSTREAM) from None
        if proc.returncode != 0:
            logger.warning("ffmpeg exited %s merging %s: %s",
                           proc.returncode, vid, (stderr or b"").decode("utf-8", "replace")[:500])
            raise app_error(UPSTREAM)

        size = os.path.getsize(out_path)

        def _stream():
            try:
                with open(out_path, "rb") as merged:
                    while True:
                        chunk = merged.read(1 << 16)
                        if not chunk:
                            break
                        yield chunk
            finally:
                shutil.rmtree(tmpdir, ignore_errors=True)
                _SEM.release()

        # Ownership of the temp dir and the semaphore permit passes to the stream
        # generator, whose finally cleans up once the body has finished sending.
        released = True
        headers = {
            "Content-Disposition": f'attachment; filename="{name}"',
            "Content-Length": str(size),
        }
        return StreamingResponse(_stream(), media_type="video/mp4", headers=headers)
    finally:
        # Every non-success exit (validation, download failure, 413, ffmpeg
        # failure, timeout, unexpected error) runs here: drop the temp dir and
        # release the permit. On success ``released`` is True and the generator
        # owns both, so this is a no-op.
        if not released:
            shutil.rmtree(tmpdir, ignore_errors=True)
            _SEM.release()
