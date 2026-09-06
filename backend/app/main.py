import logging
import os
import shutil
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded

from . import maintenance, mux, proxy, resolve
from .analytics import service as analytics_service
from .analytics.config import load_config
from .analytics.recorder import Recorder
from .analytics.router import router as analytics_router
from .analytics.store import make_store
from .envutil import env_truthy
from .errors import AppError
from .limits import limiter

logger = logging.getLogger("savevidai.analytics")

# The public HTML shells, by slug. "index" is the Twitter/X home page and is the
# only one whose clean URL is the bare prefix ("/", "/es/", "/hi/").
PUBLIC_PAGES = (
    "index",
    "tiktokvideodownloader",
    "redditvideodownloader",
    "instagramvideodownloader",
    "facebookvideodownloader",
)

# "" is English at the root; every other entry is a URL prefix and the matching
# STATIC_DIR subdirectory. Adding a language here plus its shells is the whole
# backend change.
LOCALES = ("", "es", "hi")


def _maintenance_on() -> bool:
    return maintenance.is_on() or env_truthy("MAINTENANCE_MODE")


@asynccontextmanager
async def _lifespan(app: FastAPI):
    yield
    # Recorder.start() runs during init() below (app creation), not here;
    # shutdown only needs to stop the background flush thread and flush
    # whatever is left in the queue, and only when analytics is enabled.
    if analytics_service.service.enabled:
        analytics_service.service.recorder().stop()


def create_app() -> FastAPI:
    app = FastAPI(title="SaveVid AI", docs_url=None, redoc_url=None, lifespan=_lifespan)
    app.state.limiter = limiter

    @app.middleware("http")
    async def cache_headers(request: Request, call_next):
        # Maintenance short-circuit: when MAINTENANCE_MODE is truthy the whole site
        # serves the maintenance page. Read per-request so a redeploy can toggle it.
        if _maintenance_on():
            path = request.url.path
            # /api/health must stay 200 so Render's health check keeps the deploy
            # live (a failing check would mark the deploy failed and roll back).
            # The maintenance page's own assets must load, so let them fall through.
            # The cookie-authed admin API must also stay reachable, otherwise the
            # operator is locked out and can never toggle maintenance back off.
            # The /admin dashboard page itself is exempt for the same reason: a
            # fresh visit must load the login/toggle UI, not the maintenance page.
            # /assets/ and /fonts/ are exempt too: the admin shell is a Vite SPA
            # whose login/toggle UI only boots once its hashed JS/CSS chunks (and
            # fonts) load, so blocking them would relock the owner out of the
            # toggle. These are immutable hashed bundles with no secrets, and the
            # public app's HTML entry ("/") stays blocked, so regular visitors
            # still see the maintenance page and never boot the main app.
            if (
                path not in ("/api/health", "/admin", "/favicon.svg")
                and not path.startswith("/maintenance/")
                and not path.startswith("/api/admin/")
                and not path.startswith("/assets/")
                and not path.startswith("/fonts/")
            ):
                if path.startswith("/api/"):
                    return JSONResponse(
                        status_code=503,
                        content={
                            "error": "maintenance",
                            "message": "SaveVid AI is briefly down for maintenance. Try again in a few minutes.",
                        },
                        headers={"Retry-After": "120"},
                    )
                sd = os.environ.get("STATIC_DIR", "")
                page = os.path.join(sd, "maintenance.html")
                if sd and os.path.isfile(page):
                    return FileResponse(
                        page,
                        status_code=503,
                        headers={"Retry-After": "120", "Cache-Control": "no-store"},
                    )
                return HTMLResponse(
                    "<!doctype html><meta charset=utf-8><title>Under maintenance</title>"
                    "<h1>Under maintenance</h1>"
                    "<p>SaveVid AI will be live again shortly.</p>",
                    status_code=503,
                    headers={"Retry-After": "120", "Cache-Control": "no-store"},
                )

        # Set Cache-Control on outgoing responses so hashed assets cache forever
        # while HTML pages are always revalidated (a deploy is picked up at once).
        response = await call_next(request)
        path = request.url.path
        if path.startswith("/api/"):
            # API responses (health, resolve, mux, proxy, event) are left untouched.
            return response
        if path.startswith(("/assets/", "/fonts/")):
            # Hashed filenames never change under a given name; safe to cache forever.
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        elif response.headers.get("content-type", "").startswith("text/html"):
            # Pages and the SPA index must always revalidate to avoid stale deploys.
            response.headers["Cache-Control"] = "no-cache"
        return response

    @app.exception_handler(AppError)
    async def on_app_error(request: Request, exc: AppError):
        return JSONResponse(status_code=exc.status, content={"error": exc.code, "message": exc.message})

    @app.exception_handler(RateLimitExceeded)
    async def on_rate_limit(request: Request, exc: RateLimitExceeded):
        return JSONResponse(
            status_code=429,
            content={"error": "rate_limited", "message": "Too many requests. Give it a minute."},
        )

    @app.get("/api/health")
    def health():
        # ffmpeg presence is reported so the mux endpoint's core dependency is
        # observable without exercising a real merge.
        return {"ok": True, "ffmpeg": shutil.which("ffmpeg") is not None}

    app.include_router(resolve.router)
    app.include_router(proxy.router)
    app.include_router(mux.router)

    # Analytics enablement must never be able to take the public site down.
    # cfg load, store construction, init_schema, and recorder start are all
    # covered: if Turso is unreachable, the token is stale, or a statement
    # errors, leave analytics disabled for this process and keep booting.
    # It self-heals on the next restart.
    try:
        cfg = load_config(os.environ)
        if cfg is not None:
            store = make_store(cfg)
            analytics_service.service.init(cfg, store, Recorder(store))
    except Exception as exc:
        logger.warning("analytics disabled: init failed: %r", exc)
    app.include_router(analytics_router)

    # Every public page gets an explicit route because its clean URL
    # (/tiktokvideodownloader, /es/tiktokvideodownloader) has no file of that
    # name for the static mount to resolve. The .html forms and the locale
    # homes are routed alongside them so all 30 forms answer identically, all
    # of them declared ahead of the mount. /admin is deliberately NOT in the
    # loop: it is served by the explicit route in analytics/router.py.
    def _page_endpoint(filename: str):
        # Factory, not an inline closure: binding the filename per iteration is
        # what stops every route in the loop below from serving the last page.
        def endpoint():
            static_dir = os.environ.get("STATIC_DIR", "")
            path = os.path.join(static_dir, filename)
            if not static_dir or not os.path.isfile(path):
                raise HTTPException(status_code=404)
            # FileResponse, not a hand-read body: it streams the file off
            # disk and stamps ETag / Last-Modified. Starlette turns those
            # validators into 304s only inside StaticFiles, so this route
            # still answers 200 with the body. The Cache-Control middleware
            # stamps HTML no-cache either way.
            return FileResponse(path)

        endpoint.__name__ = "page_" + filename.replace("/", "_").replace(".", "_")
        return endpoint

    for locale in LOCALES:
        # en lives at the root ("" prefix, files at the top of STATIC_DIR);
        # each other locale is a path prefix and a matching STATIC_DIR
        # subdirectory shipped by the Vite build (dist/es/, dist/hi/).
        prefix = f"/{locale}" if locale else ""
        subdir = f"{locale}/" if locale else ""
        for page in PUBLIC_PAGES:
            if page == "index":
                # Home is the trailing-slash form per the URL spec; Starlette
                # (or the static mount's directory redirect) sends /es -> /es/.
                paths = [f"{prefix}/", f"{prefix}/index.html"]
            else:
                paths = [f"{prefix}/{page}", f"{prefix}/{page}.html"]
            endpoint = _page_endpoint(f"{subdir}{page}.html")
            for path in paths:
                app.get(path)(endpoint)

    # Serves the built frontend in the Docker image; absent in dev, where Vite serves it.
    static_dir = os.environ.get("STATIC_DIR", "")
    if static_dir and os.path.isdir(static_dir):
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
    return app


app = create_app()
