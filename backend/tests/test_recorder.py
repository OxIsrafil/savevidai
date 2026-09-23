import threading

from app.analytics.recorder import Recorder
from app.analytics.store import SqliteStore


def _store():
    s = SqliteStore(":memory:")
    s.init_schema()
    return s


class FlakyStore:
    """Fake Store whose execute_many raises the first N times, then records
    every subsequent batch. Lets us assert flush() swallows failures."""

    def __init__(self, fail_times: int = 1):
        self._fail_times = fail_times
        self.calls = 0
        self.batches: list[list[tuple[str, list]]] = []

    def init_schema(self) -> None:  # pragma: no cover - unused
        pass

    def execute_many(self, statements: list[tuple[str, list]]) -> None:
        self.calls += 1
        if self.calls <= self._fail_times:
            raise RuntimeError("store unavailable")
        self.batches.append(statements)

    def query(self, sql: str, args: list) -> list[dict]:  # pragma: no cover - unused
        return []


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


def test_flush_swallows_store_failure_then_recovers():
    store = FlakyStore(fail_times=1)
    rec = Recorder(store)
    rec.record("visit", visitor="v1")
    # First flush: store raises. flush() must swallow it, return 0, not propagate.
    assert rec.flush() == 0
    # The queue was drained on the failed flush, so those events are lost (logged).
    assert store.batches == []
    # A subsequent flush with a now-working store still writes new events.
    rec.record("visit", visitor="v2")
    assert rec.flush() == 1
    assert len(store.batches) == 1
    # Each statement is (_INSERT, [ts, type, outcome, country, visitor, platform,
    # source, visitor_kind, locale]); visitor is at index 4.
    assert store.batches[0][0][1][4] == "v2"


def test_stop_flushes_remaining_events():
    s = _store()
    rec = Recorder(s, batch_interval=60.0)  # long interval so only stop() flushes
    rec.record("visit", visitor="a")
    rec.record("visit", visitor="b")
    rec.start()
    rec.stop()  # stop() must trigger a final synchronous flush
    rows = s.query("SELECT visitor FROM events ORDER BY id", [])
    assert [r["visitor"] for r in rows] == ["a", "b"]


def test_concurrent_record_respects_bound():
    s = _store()
    n_threads = 8
    per_thread = 500
    total = n_threads * per_thread
    cap = total  # large enough to hold everything, so nothing should drop
    rec = Recorder(s, max_queue=cap)

    # Track the max queue length observed during recording to prove the bound holds.
    observed_max = 0
    observed_lock = threading.Lock()
    start = threading.Event()

    def worker(tid: int) -> None:
        nonlocal observed_max
        start.wait()
        for i in range(per_thread):
            rec.record("visit", visitor=f"t{tid}-{i}")
            with rec._lock:
                cur = len(rec._q)
            with observed_lock:
                observed_max = max(observed_max, cur)

    threads = [threading.Thread(target=worker, args=(t,)) for t in range(n_threads)]
    for t in threads:
        t.start()
    start.set()
    for t in threads:
        t.join()

    enqueued = len(rec._q)
    assert enqueued + rec.dropped == total
    assert observed_max <= cap
    assert enqueued <= cap
    # With a cap == total and no concurrent flush, nothing should have dropped.
    assert rec.dropped == 0
    assert enqueued == total


def test_record_writes_platform():
    from app.analytics.recorder import Recorder
    from app.analytics.store import SqliteStore
    s = SqliteStore(":memory:")
    s.init_schema()
    r = Recorder(s)
    r.record("fetch", visitor="vh", outcome="ok", platform="tiktok")
    r.flush()
    assert s.query("SELECT platform FROM events", [])[0]["platform"] == "tiktok"


def test_record_writes_source_and_visitor_kind():
    from app.analytics.recorder import Recorder
    from app.analytics.store import SqliteStore
    s = SqliteStore(":memory:")
    s.init_schema()
    r = Recorder(s)
    r.record("visit", visitor="vh", source="search", visitor_kind="new")
    r.flush()
    row = s.query("SELECT source, visitor_kind FROM events", [])[0]
    assert row["source"] == "search"
    assert row["visitor_kind"] == "new"


def test_record_writes_locale_and_defaults_it_to_null():
    s = SqliteStore(":memory:")
    s.init_schema()
    r = Recorder(s)
    r.record("visit", visitor="vh", source="search", visitor_kind="new", locale="hi")
    r.record("download", visitor="vh", outcome="hd", platform="tiktok")
    r.flush()
    rows = s.query("SELECT type, locale FROM events ORDER BY id", [])
    assert rows == [{"type": "visit", "locale": "hi"}, {"type": "download", "locale": None}]
