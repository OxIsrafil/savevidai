import os

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .errors import AppError


def create_app() -> FastAPI:
    app = FastAPI(title="SaveVid AI", docs_url=None, redoc_url=None)

    @app.exception_handler(AppError)
    async def on_app_error(request: Request, exc: AppError):
        return JSONResponse(status_code=exc.status, content={"error": exc.code, "message": exc.message})

    @app.get("/api/health")
    def health():
        return {"ok": True}

    # Serves the built frontend in the Docker image; absent in dev, where Vite serves it.
    static_dir = os.environ.get("STATIC_DIR", "")
    if static_dir and os.path.isdir(static_dir):
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
    return app


app = create_app()
