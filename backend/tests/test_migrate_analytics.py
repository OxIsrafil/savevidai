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

import migrate_analytics  # imported after the sys.path insert above

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
        "visitor_kind": None, "locale": None,
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
