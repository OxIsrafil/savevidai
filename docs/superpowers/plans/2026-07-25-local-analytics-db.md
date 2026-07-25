# Local Analytics DB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move analytics storage from Turso Cloud to a local SQLite file on the VPS (persisted in a Docker volume), with a one-time migration script that copies the existing Turso events over. Turso mode stays fully supported.

**Architecture:** This is a storage-selection change, not a rewrite. `backend/app/analytics/store.py` already ships a thread-safe `SqliteStore` implementing the same `Store` protocol as `TursoStore`. We extend `AnalyticsConfig` to carry either backend, make `make_store` branch on which one is configured, mount a named Docker volume at `/data`, and add a standalone script whose pure `copy_events(src, dst)` function copies all events between any two `Store` instances.

**Tech Stack:** Python 3.12 / FastAPI backend, sqlite3 stdlib, pytest (with monkeypatch + tmp_path), Docker Compose, Caddy. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-25-local-analytics-db-design.md` (approved).

## Global Constraints

- NO em dashes, NO emoji, anywhere: code, comments, docs, UI copy, commit messages.
- Conventional commit prefixes; every commit ends with the trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Backend warning baseline is 7: the `pytest -q` summary must end with exactly `7 warnings`. Anything new is a finding.
- `ruff check backend` must be clean (run from repo root or backend/, both work).
- TDD: write the failing test first, run it and watch it fail, implement, run it and watch it pass.
- Backend commands run from `backend/` with the venv active: `source .venv/bin/activate`.
- Branch is `feature/local-analytics-db` (already checked out). Never commit to main.
- Turso mode must remain fully working; local mode is additive. Anyone with `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` set keeps the exact current behavior.
- Do NOT change: the recorder, `compute_stats`, the admin dashboard, maintenance mode, `service.py`, `main.py`, the `Store` protocol, or the events schema.
- `service.init()` already calls `store.init_schema()` (`backend/app/analytics/service.py:21`). `make_store` only constructs; do NOT call `init_schema()` inside it.

## File map

- Modify: `backend/app/analytics/config.py` (Task 1) - config carries either backend
- Modify: `backend/app/analytics/store.py:149-150` (Task 1) - `make_store` branches
- Modify: `backend/tests/test_analytics_config.py` (Task 1) - new mode-selection tests
- Modify: `backend/tests/test_store.py` (Task 1) - new `make_store` tests
- Modify: `compose.prod.yaml` (Task 2) - `analytics_data` volume
- Modify: `deploy/app.env.example` (Task 2) - document `ANALYTICS_DB_PATH`
- Create: `scripts/migrate_analytics.py` (Task 3) - one-time migration
- Create: `backend/tests/test_migrate_analytics.py` (Task 3) - migration tests
- Modify: `Dockerfile` (Task 3) - copy `scripts/` into the image so the migration can run in the container

Context an implementer needs but might not guess:

- The events table columns are exactly: `id, ts, type, outcome, country, visitor, platform, source, visitor_kind` (`backend/app/analytics/store.py:7-21`). `id` is `INTEGER PRIMARY KEY AUTOINCREMENT`; SQLite accepts explicit id values on insert, which preserves ordering and keeps the copy faithful.
- Three test files construct `AnalyticsConfig` POSITIONALLY as `AnalyticsConfig("libsql://x", "t", "pw-long", "salt")`: `backend/tests/test_analytics_boot.py:43`, `backend/tests/test_analytics_api.py:15`, `backend/tests/test_maintenance_api.py:29`. The dataclass field order `turso_url, turso_token, admin_password, salt` must therefore be PRESERVED, and since turso fields gain defaults, ALL fields get defaults (dataclass rules: defaulted fields cannot precede non-defaulted ones). `load_config` remains the gate that guarantees password and salt are non-empty. Those three files must NOT be edited; they keep passing untouched.
- The backend venv is an editable install of the `app` package, so `from app.analytics.store import ...` works from anywhere with the venv active. Inside the Docker image the package is pip-installed (`Dockerfile:16`), so the same import works there with no sys.path handling.
- Docker is NOT installed on this dev machine. Compose changes are validated locally with pyyaml (shipped via `uvicorn[standard]` in the venv); the real `docker compose config` check happens on the VPS.

---

### Task 1: Storage-aware config and make_store selection

**Files:**
- Modify: `backend/app/analytics/config.py` (whole file, it is 26 lines)
- Modify: `backend/app/analytics/store.py:149-150` (`make_store`)
- Test: `backend/tests/test_analytics_config.py` (append)
- Test: `backend/tests/test_store.py` (imports + append)

**Interfaces:**
- Consumes: existing `SqliteStore(path)`, `TursoStore(url, token)`, `Store` protocol from `backend/app/analytics/store.py` (unchanged).
- Produces: `AnalyticsConfig` frozen dataclass with fields, in this exact order, all defaulting to `""`: `turso_url: str`, `turso_token: str`, `admin_password: str`, `salt: str`, `db_path: str`. `load_config(env: Mapping[str, str]) -> AnalyticsConfig | None`: requires `ADMIN_PASSWORD` + `ANALYTICS_SALT`, then selects Turso (both `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` set), else local (`ANALYTICS_DB_PATH` set), else returns `None`. In Turso mode `db_path` stays `""`; in local mode both turso fields stay `""`. `make_store(cfg) -> Store`: returns `TursoStore(cfg.turso_url, cfg.turso_token)` when both turso fields are truthy, else `SqliteStore(cfg.db_path)`. Task 3 relies on `TursoStore` and `SqliteStore` being importable from `app.analytics.store` (already true today).

- [ ] **Step 1: Write the failing config tests**

Append to `backend/tests/test_analytics_config.py` (keep everything already in the file; `load_config` is already imported at the top):

```python
LOCAL = {
    "ANALYTICS_DB_PATH": "/data/analytics.db",
    "ADMIN_PASSWORD": "s3cret-long",
    "ANALYTICS_SALT": "random-salt",
}


def test_turso_mode_carries_creds_and_no_db_path():
    cfg = load_config(FULL)
    assert cfg is not None
    assert cfg.turso_url == "libsql://db.turso.io"
    assert cfg.turso_token == "tok"
    assert cfg.db_path == ""


def test_local_mode_carries_db_path_and_no_turso():
    cfg = load_config(LOCAL)
    assert cfg is not None
    assert cfg.db_path == "/data/analytics.db"
    assert cfg.turso_url == ""
    assert cfg.turso_token == ""
    assert cfg.admin_password == "s3cret-long"
    assert cfg.salt == "random-salt"


def test_turso_wins_when_both_backends_set():
    cfg = load_config({**FULL, "ANALYTICS_DB_PATH": "/data/analytics.db"})
    assert cfg is not None
    assert cfg.turso_url == "libsql://db.turso.io"
    assert cfg.db_path == ""


def test_none_when_no_storage_backend():
    only_gate = {"ADMIN_PASSWORD": "s3cret-long", "ANALYTICS_SALT": "random-salt"}
    assert load_config(only_gate) is None


def test_local_mode_none_when_password_or_salt_missing():
    for k in ("ADMIN_PASSWORD", "ANALYTICS_SALT"):
        partial = {kk: vv for kk, vv in LOCAL.items() if kk != k}
        assert load_config(partial) is None


def test_local_mode_none_when_db_path_blank():
    assert load_config({**LOCAL, "ANALYTICS_DB_PATH": "   "}) is None
```

- [ ] **Step 2: Run the config tests to verify the new ones fail**

```bash
cd /Users/israfil/projects/savevidai/backend
source .venv/bin/activate
pytest tests/test_analytics_config.py -v
```

Expected: 3 FAIL, 6 PASS. `test_turso_mode_carries_creds_and_no_db_path` and `test_turso_wins_when_both_backends_set` fail with `AttributeError: 'AnalyticsConfig' object has no attribute 'db_path'`; `test_local_mode_carries_db_path_and_no_turso` fails with `AssertionError` (cfg is None). The three pre-existing tests plus the three new negative-gate tests already pass (they pin current behavior).

- [ ] **Step 3: Implement the config change**

Replace the entire contents of `backend/app/analytics/config.py` with:

```python
from collections.abc import Mapping
from dataclasses import dataclass


@dataclass(frozen=True)
class AnalyticsConfig:
    # Field order is load-bearing: existing tests construct this positionally
    # as AnalyticsConfig(url, token, password, salt). All fields default to ""
    # because turso_url/turso_token gained defaults and dataclass rules forbid
    # non-default fields after defaulted ones. load_config is the gate that
    # guarantees password and salt are non-empty in every enabled config.
    turso_url: str = ""
    turso_token: str = ""
    admin_password: str = ""
    salt: str = ""
    db_path: str = ""


def load_config(env: Mapping[str, str]) -> AnalyticsConfig | None:
    """Return config when the admin gate and a storage backend are both set.

    ADMIN_PASSWORD and ANALYTICS_SALT are always required. The salt is part of
    the gate on purpose: an empty salt would make visitor hashes
    brute-forceable, silently breaking anonymity.

    Storage selection: both Turso vars set -> Turso mode (existing behavior,
    self-hosters unaffected). Else ANALYTICS_DB_PATH set -> local SQLite mode.
    Else None: password+salt alone is not enough, there must be somewhere to
    store data.
    """
    url = env.get("TURSO_DATABASE_URL", "").strip()
    token = env.get("TURSO_AUTH_TOKEN", "").strip()
    db_path = env.get("ANALYTICS_DB_PATH", "").strip()
    password = env.get("ADMIN_PASSWORD", "").strip()
    salt = env.get("ANALYTICS_SALT", "").strip()
    if not (password and salt):
        return None
    if url and token:
        return AnalyticsConfig(turso_url=url, turso_token=token,
                               admin_password=password, salt=salt)
    if db_path:
        return AnalyticsConfig(admin_password=password, salt=salt, db_path=db_path)
    return None
```

- [ ] **Step 4: Run the config tests to verify they pass**

```bash
pytest tests/test_analytics_config.py -v
```

Expected: 9 passed.

- [ ] **Step 5: Commit the config change**

```bash
cd /Users/israfil/projects/savevidai
git add backend/app/analytics/config.py backend/tests/test_analytics_config.py
git commit -m "feat(analytics): config selects turso or local sqlite storage

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 6: Write the failing make_store tests**

In `backend/tests/test_store.py`, replace the import block at the top (currently lines 1-3):

```python
import pytest

from app.analytics.config import AnalyticsConfig
from app.analytics.store import (
    SqliteStore,
    TursoStore,
    _raise_on_pipeline_errors,
    make_store,
)
```

Then append at the end of the file:

```python
def test_make_store_turso_cfg_returns_turso_store():
    cfg = AnalyticsConfig(turso_url="libsql://db.turso.io", turso_token="tok",
                          admin_password="pw-long", salt="s")
    assert isinstance(make_store(cfg), TursoStore)


def test_make_store_local_cfg_returns_sqlite_store(tmp_path):
    cfg = AnalyticsConfig(admin_password="pw-long", salt="s",
                          db_path=str(tmp_path / "analytics.db"))
    assert isinstance(make_store(cfg), SqliteStore)


def test_make_store_local_cfg_roundtrip_on_real_file(tmp_path):
    db = tmp_path / "analytics.db"
    cfg = AnalyticsConfig(admin_password="pw-long", salt="s", db_path=str(db))
    store = make_store(cfg)
    store.init_schema()
    store.execute_many([
        ("INSERT INTO events (ts, type, outcome, country, visitor) VALUES (?,?,?,?,?)",
         ["2026-07-25 10:00:00", "fetch", "ok", "BD", "vh"]),
    ])
    rows = store.query("SELECT type, outcome, country, visitor FROM events", [])
    assert rows == [{"type": "fetch", "outcome": "ok", "country": "BD", "visitor": "vh"}]
    assert db.exists()
```

- [ ] **Step 7: Run the store tests to verify the new ones fail**

```bash
pytest tests/test_store.py -v
```

Expected: 2 FAIL, the rest PASS. `test_make_store_local_cfg_returns_sqlite_store` fails with `AssertionError` (make_store still always returns TursoStore); `test_make_store_local_cfg_roundtrip_on_real_file` fails on `init_schema()` with `httpx.UnsupportedProtocol` (the TursoStore built from empty creds has no valid endpoint). `test_make_store_turso_cfg_returns_turso_store` already passes: it pins the unchanged Turso path.

- [ ] **Step 8: Implement the make_store branch**

In `backend/app/analytics/store.py`, replace the existing `make_store` (lines 149-150):

```python
def make_store(cfg) -> Store:
    return TursoStore(cfg.turso_url, cfg.turso_token)
```

with:

```python
def make_store(cfg) -> Store:
    """Storage selection mirrors load_config: Turso wins when both are set.

    Construction only. service.init() is the one place that calls
    init_schema(), do not add it here.
    """
    if cfg.turso_url and cfg.turso_token:
        return TursoStore(cfg.turso_url, cfg.turso_token)
    return SqliteStore(cfg.db_path)
```

- [ ] **Step 9: Run the store tests, then the whole suite and ruff**

```bash
pytest tests/test_store.py -v
```

Expected: all pass.

```bash
pytest -q
```

Expected: all tests pass and the summary ends with exactly `7 warnings` (the baseline). In particular `tests/test_analytics_boot.py`, `tests/test_analytics_api.py`, and `tests/test_maintenance_api.py` (positional `AnalyticsConfig` constructions) must pass UNCHANGED.

```bash
cd /Users/israfil/projects/savevidai
ruff check backend
```

Expected: `All checks passed!`

- [ ] **Step 10: Commit**

```bash
git add backend/app/analytics/store.py backend/tests/test_store.py
git commit -m "feat(analytics): make_store branches to local sqlite when configured

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Persist the DB in a Docker volume and document the env var

**Files:**
- Modify: `compose.prod.yaml` (app service + top-level volumes block)
- Modify: `deploy/app.env.example` (analytics section)

**Interfaces:**
- Consumes: the `ANALYTICS_DB_PATH` env var semantics from Task 1 (`load_config`).
- Produces: a named volume `analytics_data` mounted at `/data` on the `app` service, so `ANALYTICS_DB_PATH=/data/analytics.db` survives `docker compose -f compose.prod.yaml up -d --build`. Task 3's runbook command depends on this mount existing.

- [ ] **Step 1: Run the compose assertion to verify it fails first**

Docker is not installed on this machine, so validate with the venv's pyyaml (already present via `uvicorn[standard]`). From the repo root:

```bash
cd /Users/israfil/projects/savevidai
backend/.venv/bin/python - <<'EOF'
import yaml
doc = yaml.safe_load(open("compose.prod.yaml"))
assert "analytics_data:/data" in doc["services"]["app"].get("volumes", []), "app mount missing"
assert "analytics_data" in doc["volumes"], "top-level analytics_data volume missing"
print("compose ok")
EOF
```

Expected: `AssertionError: app mount missing`.

- [ ] **Step 2: Add the volume to compose.prod.yaml**

Replace the `app:` service block and the top-level `volumes:` block in `compose.prod.yaml` so the file's services/volumes read exactly:

```yaml
services:
  app:
    build: .
    restart: unless-stopped
    env_file:
      # format: raw disables compose's $-interpolation so minified ad
      # snippets containing $ are passed through byte-for-byte.
      - path: ./deploy/app.env
        format: raw
    expose:
      - "8000"
    volumes:
      # Local analytics SQLite file (ANALYTICS_DB_PATH=/data/analytics.db).
      # Named volumes survive `up -d --build`, so the DB outlives every deploy.
      - analytics_data:/data

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - app

volumes:
  analytics_data:
  caddy_data:
  caddy_config:
```

(The header comment at the top of the file stays as is. The `caddy` service is shown for position only and is byte-for-byte unchanged.)

- [ ] **Step 3: Re-run the compose assertion**

Run the same heredoc command from Step 1. Expected: `compose ok`. On the VPS the real check is `docker compose -f compose.prod.yaml config --quiet` (exit 0); that happens at deploy time.

- [ ] **Step 4: Document ANALYTICS_DB_PATH in deploy/app.env.example**

In `deploy/app.env.example`, replace the header note (currently lines 4-6, the paragraph starting `# These are the SAME values you already set in Render`) with:

```
# Migrating from Turso? scripts/migrate_analytics.py does the one-time copy of
# existing events into the local file (see the usage note in that script).
```

and replace the analytics section (currently lines 8-15) with:

```
# --- Analytics + admin dashboard + maintenance toggle ---
# ADMIN_PASSWORD and ANALYTICS_SALT are always required for /admin, analytics,
# and the in-dashboard maintenance toggle. Storage is then selected:
#   1. TURSO_DATABASE_URL + TURSO_AUTH_TOKEN both set -> Turso Cloud mode
#      (legacy; still fully supported for self-hosters already on Turso).
#   2. Otherwise ANALYTICS_DB_PATH set -> local SQLite file. /data is the
#      analytics_data volume from compose.prod.yaml, so the DB survives every
#      deploy. Recommended: free, no quota, no external service.
#   3. Neither -> analytics disabled; the site still works as a downloader.
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=
ANALYTICS_DB_PATH=/data/analytics.db
ADMIN_PASSWORD=
ANALYTICS_SALT=
```

Everything after the analytics section (Reddit, maintenance override, ads) stays untouched.

- [ ] **Step 5: Commit**

```bash
git add compose.prod.yaml deploy/app.env.example
git commit -m "feat(deploy): persist local analytics db in analytics_data volume

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: One-time Turso to local SQLite migration script

**Files:**
- Create: `scripts/migrate_analytics.py`
- Modify: `Dockerfile` (one COPY line after line 16)
- Test: `backend/tests/test_migrate_analytics.py`

**Interfaces:**
- Consumes: `Store` protocol, `SqliteStore(path)`, `TursoStore(url, token)` from `app.analytics.store` (no re-implementation of the wire format). `SqliteStore.init_schema()` creates the events table idempotently.
- Produces: `copy_events(src: Store, dst: Store, batch: int = 500) -> int` (returns rows copied) and `main(argv: list[str] | None = None) -> int` (process exit code) in `scripts/migrate_analytics.py`. Nothing later depends on this module; it is a standalone operational tool.

Test-design note: the source store in every test is an in-memory `SqliteStore` standing in for `TursoStore`. Both implement the same `Store` protocol, so `copy_events` cannot tell the difference and no network is involved. `main()` is tested by monkeypatching the module's `TursoStore` attribute. The `--force` test pre-seeds the destination with id 999 so the copied ids 1..3 cannot collide with it (a forced copy into a dest holding the SAME ids would correctly die on the PRIMARY KEY, which is out of scope to soften: --force only bypasses the row-count guard, it does not merge).

- [ ] **Step 1: Write the failing migration tests**

Create `backend/tests/test_migrate_analytics.py`:

```python
"""Tests for the one-time Turso -> local SQLite migration script.

The source store is an in-memory SqliteStore standing in for TursoStore: both
implement the same Store protocol, so copy_events cannot tell the difference
and no network is involved.
"""
import sys
from pathlib import Path

from app.analytics.store import SqliteStore

# scripts/ is not a package; make the script importable for testing.
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

import migrate_analytics  # noqa: E402  (needs the sys.path insert above)

INSERT = (
    "INSERT INTO events "
    "(id, ts, type, outcome, country, visitor, platform, source, visitor_kind) "
    "VALUES (?,?,?,?,?,?,?,?,?)"
)


def _seeded_source(n: int) -> SqliteStore:
    """A source store with n events exercising every column, nulls included."""
    src = SqliteStore(":memory:")
    src.init_schema()
    src.execute_many([
        (INSERT, [
            i,
            f"2026-07-{(i % 28) + 1:02d} 10:00:00",
            "fetch" if i % 2 else "download",
            "ok" if i % 2 else None,
            "BD" if i % 3 else None,
            f"visitor-{i}",
            "twitter" if i % 2 else None,
            "direct" if i % 4 else None,
            "new" if i % 2 else None,
        ])
        for i in range(1, n + 1)
    ])
    return src


def _turso_env(monkeypatch, tmp_path, src):
    """Wire main()'s env and swap TursoStore for the seeded in-memory source."""
    monkeypatch.setattr(migrate_analytics, "TursoStore", lambda url, token: src)
    monkeypatch.setenv("TURSO_DATABASE_URL", "libsql://db.turso.io")
    monkeypatch.setenv("TURSO_AUTH_TOKEN", "tok")
    db_path = str(tmp_path / "analytics.db")
    monkeypatch.setenv("ANALYTICS_DB_PATH", db_path)
    return db_path


def test_copy_events_copies_everything_field_for_field(tmp_path):
    src = _seeded_source(7)
    dst = SqliteStore(str(tmp_path / "dest.db"))
    dst.init_schema()

    copied = migrate_analytics.copy_events(src, dst, batch=3)  # 3+3+1: exercises batching

    assert copied == 7
    src_rows = src.query("SELECT * FROM events ORDER BY id", [])
    dst_rows = dst.query("SELECT * FROM events ORDER BY id", [])
    assert len(dst_rows) == 7
    assert dst_rows == src_rows  # ids preserved, every column identical
    assert dst_rows[1] == {
        "id": 2, "ts": "2026-07-03 10:00:00", "type": "download", "outcome": None,
        "country": "BD", "visitor": "visitor-2", "platform": None, "source": "direct",
        "visitor_kind": None,
    }


def test_copy_events_empty_source_returns_zero():
    src = SqliteStore(":memory:")
    src.init_schema()
    dst = SqliteStore(":memory:")
    dst.init_schema()
    assert migrate_analytics.copy_events(src, dst) == 0


def test_main_copies_then_guard_blocks_rerun(tmp_path, monkeypatch, capsys):
    db_path = _turso_env(monkeypatch, tmp_path, _seeded_source(3))

    assert migrate_analytics.main([]) == 0
    assert "copied 3" in capsys.readouterr().out

    # Second run: destination already has rows, refuse without --force.
    assert migrate_analytics.main([]) == 1
    assert "already has 3 rows" in capsys.readouterr().err
    dst = SqliteStore(db_path)
    assert dst.query("SELECT COUNT(*) AS n FROM events", [])[0]["n"] == 3


def test_main_force_overrides_guard(tmp_path, monkeypatch):
    db_path = _turso_env(monkeypatch, tmp_path, _seeded_source(3))

    # Pre-seed the destination with one unrelated row. id 999 so the copied
    # ids 1..3 do not collide with it.
    dst = SqliteStore(db_path)
    dst.init_schema()
    dst.execute_many([(INSERT, [999, "2026-07-01 09:00:00", "visit", None, None,
                                "visitor-old", None, None, None])])

    assert migrate_analytics.main(["--force"]) == 0
    assert dst.query("SELECT COUNT(*) AS n FROM events", [])[0]["n"] == 4


def test_main_errors_without_env(monkeypatch, capsys):
    for var in ("TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "ANALYTICS_DB_PATH"):
        monkeypatch.delenv(var, raising=False)
    assert migrate_analytics.main([]) == 1
    assert "TURSO_DATABASE_URL" in capsys.readouterr().err
```

- [ ] **Step 2: Run the migration tests to verify they fail**

```bash
cd /Users/israfil/projects/savevidai/backend
source .venv/bin/activate
pytest tests/test_migrate_analytics.py -v
```

Expected: collection error, `ModuleNotFoundError: No module named 'migrate_analytics'`.

- [ ] **Step 3: Write the migration script**

Create `scripts/migrate_analytics.py`:

```python
"""One-time migration: copy analytics events from Turso into a local SQLite file.

Run it on the VPS once, after compose.prod.yaml mounts the analytics_data
volume at /data and BEFORE removing the Turso env vars from deploy/app.env:

    docker compose -f compose.prod.yaml run --rm \
        -e ANALYTICS_DB_PATH=/data/analytics.db \
        app python scripts/migrate_analytics.py

TURSO_DATABASE_URL and TURSO_AUTH_TOKEN come from the app service's env_file
(deploy/app.env). The script refuses to touch a destination that already has
rows so an accidental re-run cannot double-import; pass --force to override.
Any unexpected error (Turso unreachable, bad token) raises and exits non-zero.
"""
import argparse
import os
import sys

from app.analytics.store import SqliteStore, Store, TursoStore

EVENT_COLUMNS = ["id", "ts", "type", "outcome", "country", "visitor",
                 "platform", "source", "visitor_kind"]

_SELECT = (
    "SELECT id, ts, type, outcome, country, visitor, platform, source, visitor_kind "
    "FROM events ORDER BY id"
)
_INSERT = (
    "INSERT INTO events "
    "(id, ts, type, outcome, country, visitor, platform, source, visitor_kind) "
    "VALUES (?,?,?,?,?,?,?,?,?)"
)


def copy_events(src: Store, dst: Store, batch: int = 500) -> int:
    """Copy every events row from src to dst in batches. Returns rows copied.

    Explicit column lists on both sides so neither schema's column order
    matters. Explicit ids preserve ordering and keep the copy faithful
    (SQLite accepts explicit AUTOINCREMENT rowid values).
    """
    rows = src.query(_SELECT, [])
    copied = 0
    for start in range(0, len(rows), batch):
        chunk = rows[start:start + batch]
        dst.execute_many([(_INSERT, [row[col] for col in EVENT_COLUMNS]) for row in chunk])
        copied += len(chunk)
        print(f"copied {copied}/{len(rows)} rows")
    return copied


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Copy analytics events from Turso into a local SQLite file.")
    parser.add_argument("--force", action="store_true",
                        help="copy even if the destination already has rows")
    args = parser.parse_args(argv)

    url = os.environ.get("TURSO_DATABASE_URL", "").strip()
    token = os.environ.get("TURSO_AUTH_TOKEN", "").strip()
    db_path = os.environ.get("ANALYTICS_DB_PATH", "").strip()
    if not (url and token):
        print("error: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must both be set (source)",
              file=sys.stderr)
        return 1
    if not db_path:
        print("error: ANALYTICS_DB_PATH must be set (destination)", file=sys.stderr)
        return 1

    src = TursoStore(url, token)
    dst = SqliteStore(db_path)
    dst.init_schema()

    existing = dst.query("SELECT COUNT(*) AS n FROM events", [])[0]["n"]
    if existing and not args.force:
        print(f"error: destination {db_path} already has {existing} rows; a re-run "
              "would double-import. Pass --force to copy anyway.", file=sys.stderr)
        return 1

    copied = copy_events(src, dst)
    print(f"done: copied {copied} events to {db_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run the migration tests to verify they pass**

```bash
pytest tests/test_migrate_analytics.py -v
```

Expected: 5 passed.

- [ ] **Step 5: Run the whole suite and ruff**

```bash
pytest -q
```

Expected: all tests pass, summary ends with exactly `7 warnings`.

```bash
cd /Users/israfil/projects/savevidai
ruff check backend
```

Expected: `All checks passed!` (the script lives outside backend/; it is written to the same line-length 100 style anyway).

- [ ] **Step 6: Copy scripts/ into the Docker image**

The runbook command runs the script inside the app container, but the image currently only copies `backend/` and the built frontend. In `Dockerfile`, insert one COPY after the pip install (line 16), so stage 2 reads:

```dockerfile
COPY backend/ backend/
RUN pip install --no-cache-dir ./backend
# The one-time analytics migration runs inside the container:
#   docker compose -f compose.prod.yaml run --rm ... app python scripts/migrate_analytics.py
# The app package above is pip-installed, so its imports resolve in-container.
COPY scripts/ scripts/
COPY --from=web /web/dist static/
```

Verify the line landed:

```bash
grep -n "COPY scripts/ scripts/" Dockerfile
```

Expected: one match, exit 0. (No docker locally; the full image build is exercised on the VPS by deploy step 1 below.)

- [ ] **Step 7: Commit**

```bash
git add scripts/migrate_analytics.py backend/tests/test_migrate_analytics.py Dockerfile
git commit -m "feat(analytics): one-time turso to local sqlite migration script

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Deploy runbook (manual, owner-run on the VPS after merge; NOT plan tasks)

1. `git pull && docker compose -f compose.prod.yaml up -d --build`: new code, still Turso mode (Turso vars set, no `ANALYTICS_DB_PATH` in app.env yet). Zero behavior change.
2. Run the migration once: `docker compose -f compose.prod.yaml run --rm -e ANALYTICS_DB_PATH=/data/analytics.db app python scripts/migrate_analytics.py`. The env_file supplies the Turso creds; the named volume supplies /data. Confirm the printed count matches the dashboard totals.
3. Edit `deploy/app.env`: remove `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`, add `ANALYTICS_DB_PATH=/data/analytics.db`. Keep `ADMIN_PASSWORD` + `ANALYTICS_SALT`.
4. `docker compose -f compose.prod.yaml up -d --build`: now local mode.
5. Verify `/admin` shows the migrated totals, then delete the Turso database in the Turso dashboard.

Reviewer note from the spec, recorded so nobody "optimizes" it into a bug: `SqliteStore`'s single-connection-plus-lock design intentionally serializes the recorder flush and the dashboard queries. At one uvicorn worker and this QPS that is fine; WAL mode is not needed (YAGNI).
