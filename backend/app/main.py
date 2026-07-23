import logging
import os
import shutil
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded

from . import mux, proxy, resolve
from .analytics import service as analytics_service
from .analytics.config import load_config
from .analytics.recorder import Recorder
from .analytics.router import router as analytics_router
from .analytics.store import make_store
from .errors import AppError
from .limits import limiter

logger = logging.getLogger("savevidai.analytics")


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
        # Set Cache-Control on outgoing responses so hashed assets cache forever
        # while HTML pages are always revalidated (a deploy is picked up at once).
        response = await call_next(request)
        path = request.url.path
        if path.startswith("/api/"):
            # API responses (health, resolve, mux, proxy, event) are left untouched.
            return response
        if path.startswith("/assets/") or path.startswith("/fonts/"):
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

    @app.get("/tiktokvideodownloader")
    def tiktok_page():
        from fastapi import HTTPException
        from fastapi.responses import FileResponse

        sd = os.environ.get("STATIC_DIR", "")
        path = os.path.join(sd, "tiktokvideodownloader.html")
        if sd and os.path.isfile(path):
            return FileResponse(path)
        raise HTTPException(status_code=404)

    @app.get("/redditvideodownloader")
    def reddit_page():
        from fastapi import HTTPException
        from fastapi.responses import FileResponse

        sd = os.environ.get("STATIC_DIR", "")
        path = os.path.join(sd, "redditvideodownloader.html")
        if sd and os.path.isfile(path):
            return FileResponse(path)
        raise HTTPException(status_code=404)

    # Serves the built frontend in the Docker image; absent in dev, where Vite serves it.
    static_dir = os.environ.get("STATIC_DIR", "")
    if static_dir and os.path.isdir(static_dir):
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
    return app


app = create_app()
