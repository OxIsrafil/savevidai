#!/bin/sh
# Local dev: run the API and the Vite frontend together so the site never
# points at a dead backend. Stopping this script stops both processes.
set -e
cd "$(dirname "$0")/.."

# Load local secrets (reddit api creds etc) if present; never committed.
if [ -f backend/.env ]; then
  set -a
  . backend/.env
  set +a
fi

backend/.venv/bin/python -m uvicorn app.main:app --app-dir backend --port 8000 --proxy-headers --forwarded-allow-ips '*' &
API_PID=$!
trap 'kill "$API_PID" 2>/dev/null' EXIT INT TERM

cd frontend
npm run dev
