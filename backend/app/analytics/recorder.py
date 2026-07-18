import logging
import threading
from collections import deque
from datetime import datetime, timezone

from .store import Store

logger = logging.getLogger("savevidai.analytics")

_INSERT = "INSERT INTO events (ts, type, outcome, country, visitor) VALUES (?,?,?,?,?)"


class Recorder:
    """Fire-and-forget event recording. record() never blocks on I/O; a background
    thread batches inserts. If the queue is full, the oldest event is dropped."""

    def __init__(self, store: Store, max_queue: int = 1000, batch_interval: float = 5.0,
                 prune_days: int = 90):
        self._store = store
        self._max = max_queue
        self._interval = batch_interval
        self._prune_days = prune_days
        self._q: deque[tuple] = deque()
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._cycles = 0
        self.dropped = 0

    def record(self, type: str, visitor: str, outcome: str | None = None,
               country: str | None = None) -> None:
        ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        with self._lock:
            if len(self._q) >= self._max:
                self._q.popleft()
                self.dropped += 1
                logger.warning("analytics queue full, dropped oldest event")
            self._q.append((ts, type, outcome, country, visitor))

    def flush(self) -> int:
        with self._lock:
            batch = list(self._q)
            self._q.clear()
        if not batch:
            return 0
        try:
            self._store.execute_many([(_INSERT, list(row)) for row in batch])
        except Exception as exc:  # store/network failure must not propagate
            logger.warning("analytics flush failed, %d events lost: %r", len(batch), exc)
            return 0
        return len(batch)

    def prune(self) -> None:
        try:
            self._store.execute_many(
                [("DELETE FROM events WHERE ts < datetime('now', ?)", [f"-{self._prune_days} days"])]
            )
        except Exception as exc:
            logger.warning("analytics prune failed: %r", exc)

    def _loop(self) -> None:
        # Flush every interval; prune roughly hourly (720 * 5s).
        while not self._stop.wait(self._interval):
            self.flush()
            self._cycles += 1
            if self._cycles % 720 == 0:
                self.prune()

    def start(self) -> None:
        if self._thread is None:
            self._thread = threading.Thread(target=self._loop, daemon=True)
            self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self.flush()
