# Stage 1: build the frontend
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: backend + static files
FROM python:3.12-slim
WORKDIR /srv
# ffmpeg is a runtime dependency of the /api/mux endpoint (stream-copy remux of
# reddit's split video+audio tracks).
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
COPY backend/ backend/
RUN pip install --no-cache-dir ./backend
# The one-time analytics migration runs inside the container:
#   docker compose -f compose.prod.yaml run --rm ... app python scripts/migrate_analytics.py
# The app package above is pip-installed, so its imports resolve in-container.
COPY scripts/ scripts/
COPY --from=web /web/dist static/
ENV STATIC_DIR=/srv/static
# Monthly refresh of the DB-IP country database (deploy/README.md, section 6).
# Only the image sets it, so tests and CI never touch the network.
ENV GEOIP_UPDATE=1
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
