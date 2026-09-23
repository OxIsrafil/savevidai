import functools
import os
import re
import time
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, field_validator

from ..limits import limiter
from . import auth as _auth_mod
from .auth import check_password, make_cookie, verify_cookie
from .report import compute_report, compute_resolvers, parse_range, parse_tz
from .service import service
from .stats import compute_stats

router = APIRouter()

_QUALITY_OK = re.compile(r"^(\d{2,4}p|video|hd|sd|photo|album|sound)$")
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
    platform: str | None = None
    source: str | None = None
    visitor_kind: str | None = None
    locale: str | None = None

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

    @field_validator("platform")
    @classmethod
    def _platform(cls, v):
        if v is not None and v not in ("twitter", "tiktok", "reddit", "instagram", "facebook"):
            raise ValueError("bad platform")
        return v

    @field_validator("source")
    @classmethod
    def _source(cls, v):
        if v is not None and v not in ("direct", "search", "social", "referral", "internal"):
            raise ValueError("bad source")
        return v

    @field_validator("visitor_kind")
    @classmethod
    def _visitor_kind(cls, v):
        if v is not None and v not in ("new", "returning"):
            raise ValueError("bad visitor_kind")
        return v

    @field_validator("locale")
    @classmethod
    def _locale(cls, v):
        if v is not None and v not in ("en", "es", "hi"):
            raise ValueError("bad locale")
        return v


class LoginIn(BaseModel):
    password: str


class MaintenanceIn(BaseModel):
    on: bool


def _require_enabled() -> None:
    if not service.enabled:
        raise HTTPException(status_code=404)


def _unauthorized(request: Request) -> JSONResponse | None:
    """The 401 body for a missing or bad admin cookie, None when signed in."""
    cfg = service.config()
    if verify_cookie(request.cookies.get(COOKIE, ""), cfg.admin_password, time.time()):
        return None
    return JSONResponse(status_code=401, content={"error": "unauthorized"})


def _forced_by_env() -> bool:
    return os.environ.get("MAINTENANCE_MODE", "").strip().lower() in ("1", "true", "yes", "on")


def _maintenance_state() -> dict:
    from ..maintenance import is_on
    return {"on": is_on() or _forced_by_env(), "forced_by_env": _forced_by_env()}


@router.post("/api/event", status_code=204)
@limiter.limit("30/minute")
def event(request: Request, payload: EventIn) -> Response:
    _require_enabled()
    outcome = payload.quality if payload.type == "download" else None
    source = payload.source if payload.type == "visit" else None
    visitor_kind = payload.visitor_kind if payload.type == "visit" else None
    locale = payload.locale if payload.type == "visit" else None
    service.record_from_request(request, payload.type, outcome, platform=payload.platform,
                                source=source, visitor_kind=visitor_kind, locale=locale)
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


@router.post("/api/admin/logout", status_code=204)
def logout() -> Response:
    """Clears the admin cookie in this browser (the same attributes login sets,
    so the browser matches the existing cookie). No cookie required: idempotent.
    Cookies are stateless HMACs, so every other browser stays signed in until
    ADMIN_PASSWORD changes."""
    _require_enabled()
    resp = Response(status_code=204)
    resp.delete_cookie(COOKIE, path="/api/admin", secure=True, httponly=True, samesite="strict")
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


@router.get("/api/admin/report")
def report(request: Request, range_key: Annotated[str | None, Query(alias="range")] = None,
           tz: str | None = None) -> JSONResponse:
    _require_enabled()
    denied = _unauthorized(request)
    if denied is not None:
        return denied
    try:
        key = parse_range(range_key)
    except ValueError:
        return JSONResponse(status_code=422, content={"error": "bad_range"})
    try:
        tz_min = parse_tz(tz)
    except ValueError:
        return JSONResponse(status_code=422, content={"error": "bad_tz"})
    store = service.recorder()._store
    try:
        return JSONResponse(compute_report(store, key, tz_min, datetime.now(UTC)))
    except Exception:
        return JSONResponse(status_code=503, content={"error": "analytics_unavailable"})


@router.get("/api/admin/resolvers")
def resolvers(request: Request, tz: str | None = None) -> JSONResponse:
    _require_enabled()
    denied = _unauthorized(request)
    if denied is not None:
        return denied
    try:
        tz_min = parse_tz(tz)
    except ValueError:
        return JSONResponse(status_code=422, content={"error": "bad_tz"})
    store = service.recorder()._store
    try:
        return JSONResponse(compute_resolvers(store, tz_min, datetime.now(UTC)))
    except Exception:
        return JSONResponse(status_code=503, content={"error": "analytics_unavailable"})


@router.get("/api/admin/maintenance")
def get_maintenance(request: Request) -> JSONResponse:
    _require_enabled()
    cfg = service.config()
    if not verify_cookie(request.cookies.get(COOKIE, ""), cfg.admin_password, time.time()):
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    return JSONResponse(_maintenance_state())


@router.post("/api/admin/maintenance")
@limiter.limit("10/minute")
def set_maintenance(request: Request, payload: MaintenanceIn) -> JSONResponse:
    _require_enabled()
    cfg = service.config()
    if not verify_cookie(request.cookies.get(COOKIE, ""), cfg.admin_password, time.time()):
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    from ..maintenance import set_on
    set_on(payload.on)
    return JSONResponse(_maintenance_state())


@router.get("/admin")
def admin_page() -> FileResponse:
    static_dir = os.environ.get("STATIC_DIR", "")
    path = os.path.join(static_dir, "admin.html")
    if static_dir and os.path.isfile(path):
        # The dashboard must never be indexed. The shell carries a robots meta
        # too; the header covers crawlers that skip the body. Scoped to this
        # route only, so the five public pages stay indexable.
        return FileResponse(path, headers={"X-Robots-Tag": "noindex"})
    raise HTTPException(status_code=404)
