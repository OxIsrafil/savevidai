import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded

from . import proxy, resolve
from .analytics import service as analytics_service
from .analytics.config import load_config
from .analytics.recorder import Recorder
from .analytics.router import router as analytics_router
from .analytics.store import make_store
from .errors import AppError
from .limits import limiter


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
        return {"ok": True}

    app.include_router(resolve.router)
    app.include_router(proxy.router)

    cfg = load_config(os.environ)
    if cfg is not None:
        store = make_store(cfg)
        analytics_service.service.init(cfg, store, Recorder(store))
    app.include_router(analytics_router)

    # Serves the built frontend in the Docker image; absent in dev, where Vite serves it.
    static_dir = os.environ.get("STATIC_DIR", "")
    if static_dir and os.path.isdir(static_dir):
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
    return app


app = create_app()
