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
COPY backend/ backend/
RUN pip install --no-cache-dir ./backend
COPY --from=web /web/dist static/
ENV STATIC_DIR=/srv/static
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
