import pytest

from app.analytics.config import AnalyticsConfig
from app.analytics.store import (
    SqliteStore,
    TursoStore,
    _raise_on_pipeline_errors,
    make_store,
)


def test_schema_and_roundtrip():
    s = SqliteStore(":memory:")
    s.init_schema()
    s.execute_many([
        ("INSERT INTO events (ts, type, outcome, country, visitor) VALUES (?,?,?,?,?)",
         ["2026-07-17 10:00:00", "fetch", "ok", "BD", "abc123"]),
        ("INSERT INTO events (ts, type, outcome, country, visitor) VALUES (?,?,?,?,?)",
         ["2026-07-17 10:01:00", "download", "1080p", None, "abc123"]),
    ])
    rows = s.query("SELECT type, outcome, country, visitor FROM events ORDER BY id", [])
    assert rows[0] == {"type": "fetch", "outcome": "ok", "country": "BD", "visitor": "abc123"}
    assert rows[1]["outcome"] == "1080p"
    assert rows[1]["country"] is None


def test_query_with_args():
    s = SqliteStore(":memory:")
    s.init_schema()
    s.execute_many([
        ("INSERT INTO events (ts, type, outcome, country, visitor) VALUES (?,?,?,?,?)",
         ["2026-07-17 10:00:00", "fetch", "ok", None, "v1"]),
        ("INSERT INTO events (ts, type, outcome, country, visitor) VALUES (?,?,?,?,?)",
         ["2026-07-17 10:00:00", "visit", None, None, "v2"]),
    ])
    rows = s.query("SELECT COUNT(*) AS n FROM events WHERE type = ?", ["fetch"])
    assert rows[0]["n"] == 1


def test_raise_on_pipeline_errors_raises():
    results = [
        {"type": "ok", "response": {}},
        {"type": "error", "error": {"message": "no such table: events"}},
    ]
    with pytest.raises(RuntimeError, match="no such table: events"):
        _raise_on_pipeline_errors(results)


def test_raise_on_pipeline_errors_missing_message():
    with pytest.raises(RuntimeError, match="unknown Turso error"):
        _raise_on_pipeline_errors([{"type": "error"}])


def test_raise_on_pipeline_errors_success_no_raise():
    results = [{"type": "ok", "response": {}}, {"type": "ok", "response": {}}]
    _raise_on_pipeline_errors(results)


def test_platform_column_present_and_idempotent():
    from app.analytics.store import SqliteStore
    s = SqliteStore(":memory:")
    s.init_schema()
    s.init_schema()  # second call must not raise (migration idempotent)
    s.execute_many([(
        "INSERT INTO events (ts, type, outcome, country, visitor, platform) VALUES (?,?,?,?,?,?)",
        ["2026-07-20 10:00:00", "fetch", "ok", None, "vh", "tiktok"],
    )])
    rows = s.query("SELECT platform FROM events", [])
    assert rows[0]["platform"] == "tiktok"


def test_platform_column_alter_migration_on_legacy_table():
    # Simulate a pre-migration DB: an events table created WITHOUT the platform
    # column. init_schema must ALTER it in, idempotently.
    s = SqliteStore(":memory:")
    s._conn.execute("""CREATE TABLE events (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        ts      TEXT NOT NULL,
        type    TEXT NOT NULL,
        outcome TEXT,
        country TEXT,
        visitor TEXT NOT NULL
    )""")
    s._conn.commit()

    cols_before = {r[1] for r in s._conn.execute("PRAGMA table_info(events)")}
    assert "platform" not in cols_before

    s.init_schema()  # exercises the ALTER TABLE ... ADD COLUMN path
    cols_after = {r[1] for r in s._conn.execute("PRAGMA table_info(events)")}
    assert "platform" in cols_after

    s.init_schema()  # second call must be idempotent, no raise

    s.execute_many([(
        "INSERT INTO events (ts, type, outcome, country, visitor, platform) VALUES (?,?,?,?,?,?)",
        ["2026-07-20 11:00:00", "fetch", "ok", None, "vl", "tiktok"],
    )])
    rows = s.query("SELECT platform FROM events", [])
    assert rows[0]["platform"] == "tiktok"


def test_source_and_visitor_kind_columns_present_and_idempotent():
    s = SqliteStore(":memory:")
    s.init_schema()
    s.init_schema()  # second call must not raise (migration idempotent)
    s.execute_many([(
        ("INSERT INTO events (ts, type, outcome, country, visitor, source, visitor_kind) "
         "VALUES (?,?,?,?,?,?,?)"),
        ["2026-07-20 10:00:00", "fetch", "ok", None, "vh", "twitter", "returning"],
    )])
    rows = s.query("SELECT source, visitor_kind FROM events", [])
    assert rows[0]["source"] == "twitter"
    assert rows[0]["visitor_kind"] == "returning"


def test_source_and_visitor_kind_alter_migration_on_legacy_table():
    # Simulate a pre-migration DB: an events table created WITHOUT the source and
    # visitor_kind columns. init_schema must ALTER them in, idempotently.
    s = SqliteStore(":memory:")
    s._conn.execute("""CREATE TABLE events (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        ts      TEXT NOT NULL,
        type    TEXT NOT NULL,
        outcome TEXT,
        country TEXT,
        visitor TEXT NOT NULL
    )""")
    s._conn.commit()

    cols_before = {r[1] for r in s._conn.execute("PRAGMA table_info(events)")}
    assert "source" not in cols_before
    assert "visitor_kind" not in cols_before

    s.init_schema()  # exercises the ALTER TABLE ... ADD COLUMN path
    cols_after = {r[1] for r in s._conn.execute("PRAGMA table_info(events)")}
    assert "source" in cols_after
    assert "visitor_kind" in cols_after

    s.init_schema()  # second call must be idempotent, no raise

    s.execute_many([(
        ("INSERT INTO events (ts, type, outcome, country, visitor, source, visitor_kind) "
         "VALUES (?,?,?,?,?,?,?)"),
        ["2026-07-20 11:00:00", "fetch", "ok", None, "vl", "twitter", "new"],
    )])
    rows = s.query("SELECT source, visitor_kind FROM events", [])
    assert rows[0]["source"] == "twitter"
    assert rows[0]["visitor_kind"] == "new"


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
