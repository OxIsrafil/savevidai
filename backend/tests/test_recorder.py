from app.analytics.recorder import Recorder
from app.analytics.store import SqliteStore


def _store():
    s = SqliteStore(":memory:")
    s.init_schema()
    return s


def test_record_then_flush_writes_rows():
    s = _store()
    rec = Recorder(s)
    rec.record("fetch", visitor="v1", outcome="ok", country="BD")
    rec.record("visit", visitor="v2")
    written = rec.flush()
    assert written == 2
    rows = s.query("SELECT type, visitor, outcome, country FROM events ORDER BY id", [])
    assert rows[0]["type"] == "fetch" and rows[0]["country"] == "BD"
    assert rows[1]["type"] == "visit" and rows[1]["outcome"] is None


def test_drops_oldest_when_full():
    s = _store()
    rec = Recorder(s, max_queue=3)
    for i in range(5):
        rec.record("visit", visitor=f"v{i}")
    assert rec.dropped == 2
    written = rec.flush()
    assert written == 3
    rows = s.query("SELECT visitor FROM events ORDER BY id", [])
    # oldest two (v0, v1) dropped; v2..v4 kept
    assert [r["visitor"] for r in rows] == ["v2", "v3", "v4"]


def test_flush_empty_is_zero():
    rec = Recorder(_store())
    assert rec.flush() == 0


def test_prune_removes_old_events():
    s = _store()
    s.execute_many([
        ("INSERT INTO events (ts,type,outcome,country,visitor) VALUES (?,?,?,?,?)",
         ["2000-01-01 00:00:00", "visit", None, None, "old"]),
        ("INSERT INTO events (ts,type,outcome,country,visitor) VALUES (?,?,?,?,?)",
         [__import__("datetime").datetime.now(__import__("datetime").timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
          "visit", None, None, "new"]),
    ])
    Recorder(s, prune_days=90).prune()
    rows = s.query("SELECT visitor FROM events", [])
    assert [r["visitor"] for r in rows] == ["new"]
