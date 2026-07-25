# Move analytics off Turso to a local SQLite file - design

Date: 2026-07-25
Status: approved (brainstorm)
Branch: feature/local-analytics-db

## Problem

Analytics is stored in Turso Cloud (free tier). During the KOL traffic surge,
the "rows read" quota hit 75% (dashboard polls compute_stats every 60s, each
poll runs ~15 full-table-scan queries over the growing events table). The owner
wants zero recurring cost and no quota risk. Now that the app runs on an
owned VPS with persistent storage (previously Render's ephemeral filesystem
forced a remote DB), a local SQLite file is the natural, free, unlimited-read
home for this data.

Key enabling fact: `backend/app/analytics/store.py` already ships a thread-safe
`SqliteStore` (single shared connection + a `threading.Lock`,
`check_same_thread=False`) implementing the SAME `Store` protocol as
`TursoStore`. The recorder's background flush thread and the dashboard read
threads are already handled. So this is a storage-selection change plus a
one-time data migration, not a rewrite.

## Goals

- Analytics runs on a local SQLite file on the VPS, persisted across deploys.
- Existing history (all events currently in Turso) migrates over intact.
- Turso mode stays supported (self-hosters, and a safe fallback) - not removed.
- Zero behavior change to recording, the dashboard, admin, or maintenance.

## Configuration change (backend/app/analytics/config.py)

Analytics is enabled by `ADMIN_PASSWORD` + `ANALYTICS_SALT` (both always
required - the salt gate protects visitor-hash anonymity, unchanged). Storage
is then selected:

- If `TURSO_DATABASE_URL` AND `TURSO_AUTH_TOKEN` are both set -> Turso mode
  (existing behavior, so anyone still on Turso is unaffected).
- Else if `ANALYTICS_DB_PATH` is set -> local SQLite mode.
- Else -> analytics disabled (return None), same as today.

`AnalyticsConfig` is extended so it can carry either backend. Concretely:
`turso_url` and `turso_token` become `str` defaulting to `""`, and a new
`db_path: str = ""` field is added. `load_config` fills whichever pair is
present, requiring password+salt in all enabled cases, and returns None when
neither storage is configured (password+salt alone is not enough - there must
be somewhere to store data).

`make_store(cfg)`:
- Turso creds present -> `TursoStore(cfg.turso_url, cfg.turso_token)` (unchanged).
- else `cfg.db_path` set -> `SqliteStore(cfg.db_path)`.
- The precedence matches load_config (Turso wins if both somehow set).

`service.init()` already calls `store.init_schema()`, which for `SqliteStore`
creates the table + runs the same idempotent column migrations. No change
needed there. The boot path in `main.py` (load_config -> make_store ->
service.init) is unchanged; make_store just returns a different store.

## Persistence (compose.prod.yaml)

- Add a named volume `analytics_data` mounted at `/data` on the `app` service.
- `ANALYTICS_DB_PATH=/data/analytics.db` goes in `deploy/app.env` (documented
  in `deploy/app.env.example`).
- Named volumes survive `docker compose -f compose.prod.yaml up -d --build`
  (the image/container are recreated; the volume is not), so the DB persists
  across every deploy.
- The container runs as root (no `USER` in the Dockerfile), so `/data` is
  writable with no chown step. Verified.

SqliteStore concurrency at this scale: the single-connection-plus-lock design
serializes the recorder flush and the dashboard's queries. At one uvicorn
worker and this QPS that is fine; WAL mode is not needed (YAGNI). Recorded for
the reviewer so nobody "optimizes" it into a per-thread-connection bug.

## Migration (scripts/migrate_analytics.py)

A standalone one-time script. Reads config from the environment:
- Source: `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` (constructs a `TursoStore`).
- Dest: `ANALYTICS_DB_PATH` (constructs a `SqliteStore`, calls `init_schema()`).

Behavior:
- `SELECT id, ts, type, outcome, country, visitor, platform, source,
  visitor_kind FROM events ORDER BY id` from the source (all rows).
- Insert into the dest in batches (e.g. 500 rows/execute_many call) using an
  explicit-column INSERT so schema column order is irrelevant.
- Print progress (rows copied) and a final count; exit non-zero on any error.
- Safety: refuse to run if the dest DB already has rows (avoids double-import
  on an accidental re-run) unless a `--force` flag is passed. Print the guard
  message clearly.

It reuses `TursoStore`/`SqliteStore` from `app.analytics.store` - no
re-implementation of the wire format.

The `id` column is AUTOINCREMENT; inserting explicit ids preserves ordering and
is harmless (SQLite accepts explicit rowid values). Preserving ids keeps the
migration a faithful copy and makes a re-run's "already has rows" guard simple.

## Deploy sequence (runbook, not code - goes in the report/handoff)

On the VPS, in order:
1. `git pull && docker compose -f compose.prod.yaml up -d --build` - new code,
   still Turso mode (Turso vars still set, no DB path yet). Zero behavior change.
2. Run the migration once, with the volume mounted and both Turso creds and the
   dest path available. Exact command decided at implementation, of the form:
   `docker compose -f compose.prod.yaml run --rm -e ANALYTICS_DB_PATH=/data/analytics.db app python scripts/migrate_analytics.py`
   (the `app` service's env_file supplies the Turso creds; the named volume
   supplies /data). Confirm it prints the copied count matching the dashboard.
3. Edit `deploy/app.env`: remove `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`,
   add `ANALYTICS_DB_PATH=/data/analytics.db`. Keep `ADMIN_PASSWORD` +
   `ANALYTICS_SALT`.
4. `docker compose -f compose.prod.yaml up -d --build` - now local mode.
5. Verify `/admin` shows the migrated totals. Then delete the Turso database in
   the Turso dashboard so all usage stops.

## Testing

Backend (pytest):
- config: `TURSO_*` present -> config carries turso creds, no db_path; only
  `ANALYTICS_DB_PATH` present -> config carries db_path, no turso; neither ->
  None; password or salt missing -> None even if storage is set.
- make_store: turso cfg -> `TursoStore`; local cfg -> `SqliteStore` pointing at
  the given path; a local cfg with a real temp-file path yields a working store
  (init_schema, insert, query round-trip).
- migration: seed a source `SqliteStore(:memory:)` (stands in for any Store,
  same interface as Turso) with N events across all columns; run the copy
  routine into a dest `SqliteStore(temp file)`; assert dest row count == N and
  a sample row matches field-for-field including nullable columns; the
  "dest already has rows" guard blocks a second run and `--force` overrides.
- The migration's copy logic is a pure function `copy_events(src, dst,
  batch=500) -> int` (returns rows copied) so it is testable without Turso;
  the script's `main()` just wires env -> stores -> copy_events.
- Existing analytics/store/recorder/stats tests keep passing unchanged.

Backend warning baseline stays 7; `ruff check backend` clean.

Deployment is verified live by the owner via /admin after the switch (the
migration count and the dashboard totals must match).

## What does NOT change

- `TursoStore`, the recorder, `compute_stats`, the admin dashboard, the API,
  maintenance mode, the ads feature: all untouched.
- The `Store` protocol and the events schema: unchanged (migration copies the
  existing columns).
- Self-hosters using Turso: unaffected (Turso mode still selected when its
  vars are set).

## Out of scope (noted, not built)

- Automated backups of the local DB file (a nightly cron copy is a small future
  add; the data is aggregate vanity metrics, so acceptable to skip now).
- Reducing the dashboard's 60s poll rate / query count (separate optimization;
  local reads are unlimited so it no longer matters for cost).
