import functools
import os
import re
import time

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, field_validator

from ..limits import limiter
from . import auth as _auth_mod
from .auth import check_password, make_cookie, verify_cookie
from .service import service
from .stats import compute_stats, parse_tz

router = APIRouter()

_QUALITY_OK = re.compile(r"^\d{2,4}p$|^video$")
COOKIE = "svid_admin"

# Carry-forward fix from the Task 4 review: auth.make_cookie/verify_cookie call
# auth._key(password) on every invocation, re-running PBKDF2-HMAC-SHA256 with
# 100k iterations each time. /api/admin/stats is polled every 60s and calls
# verify_cookie per request, so uncached this is a CPU-amplification vector.
# The admin password is fixed for the process lifetime, so memoize the
# derivation here (auth.py's public API is unchanged; this wraps the module's
# internal deriver once, at import time, so every later call reuses the key).
_auth_mod._key = functools.lru_cache(maxsize=4)(_auth_mod._key)


class EventIn(BaseModel):
    type: str
    quality: str | None = None

    @field_validator("type")
    @classmethod
    def _type(cls, v: str) -> str:
        if v not in ("visit", "download"):
            raise ValueError("bad type")
        return v

    @field_validator("quality")
    @classmethod
    def _quality(cls, v):
        if v is not None and not _QUALITY_OK.match(v):
            raise ValueError("bad quality")
        return v


class LoginIn(BaseModel):
    password: str


def _require_enabled() -> None:
    if not service.enabled:
        raise HTTPException(status_code=404)


@router.post("/api/event", status_code=204)
@limiter.limit("30/minute")
def event(request: Request, payload: EventIn) -> Response:
    _require_enabled()
    outcome = payload.quality if payload.type == "download" else None
    service.record_from_request(request, payload.type, outcome)
    return Response(status_code=204)


@router.post("/api/admin/login", status_code=204)
@limiter.limit("5/minute")
def login(request: Request, payload: LoginIn) -> Response:
    _require_enabled()
    cfg = service.config()
    if not check_password(payload.password, cfg.admin_password):
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    resp = Response(status_code=204)
    resp.set_cookie(
        COOKIE, make_cookie(cfg.admin_password, time.time()),
        max_age=2_592_000, httponly=True, secure=True, samesite="strict", path="/api/admin",
    )
    return resp


@router.get("/api/admin/stats")
def stats(request: Request, days: int = 30, tz: str = "0") -> JSONResponse:
    _require_enabled()
    cfg = service.config()
    cookie = request.cookies.get(COOKIE, "")
    if not verify_cookie(cookie, cfg.admin_password, time.time()):
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    try:
        tz_min = parse_tz(tz)
    except ValueError:
        return JSONResponse(status_code=422, content={"error": "bad_tz"})
    days = max(1, min(int(days), 365))
    store = service.recorder()._store
    try:
        return JSONResponse(compute_stats(store, days, tz_min))
    except Exception:
        return JSONResponse(status_code=503, content={"error": "analytics_unavailable"})


@router.get("/admin")
def admin_page() -> FileResponse:
    static_dir = os.environ.get("STATIC_DIR", "")
    path = os.path.join(static_dir, "admin.html")
    if static_dir and os.path.isfile(path):
        return FileResponse(path)
    raise HTTPException(status_code=404)
