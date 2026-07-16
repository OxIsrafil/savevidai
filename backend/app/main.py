import os

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded

from . import proxy, resolve
from .errors import AppError
from .limits import limiter


def create_app() -> FastAPI:
    app = FastAPI(title="SaveVid AI", docs_url=None, redoc_url=None)
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

    # Serves the built frontend in the Docker image; absent in dev, where Vite serves it.
    static_dir = os.environ.get("STATIC_DIR", "")
    if static_dir and os.path.isdir(static_dir):
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
    return app


app = create_app()
