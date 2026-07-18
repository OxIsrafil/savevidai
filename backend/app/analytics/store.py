import sqlite3
import threading
from typing import Any, Protocol

import httpx

SCHEMA: list[str] = [
    """CREATE TABLE IF NOT EXISTS events (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        ts      TEXT NOT NULL,
        type    TEXT NOT NULL,
        outcome TEXT,
        country TEXT,
        visitor TEXT NOT NULL
    )""",
    "CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts)",
    "CREATE INDEX IF NOT EXISTS idx_events_type_ts ON events(type, ts)",
]


class Store(Protocol):
    def init_schema(self) -> None: ...
    def execute_many(self, statements: list[tuple[str, list]]) -> None: ...
    def query(self, sql: str, args: list) -> list[dict]: ...


class SqliteStore:
    """Local/VPS and test backend. Thread-safe via a single lock (writer thread
    plus request threads share one connection)."""

    def __init__(self, path: str = ":memory:"):
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.Lock()

    def init_schema(self) -> None:
        with self._lock:
            for stmt in SCHEMA:
                self._conn.execute(stmt)
            self._conn.commit()

    def execute_many(self, statements: list[tuple[str, list]]) -> None:
        with self._lock:
            for sql, args in statements:
                self._conn.execute(sql, args)
            self._conn.commit()

    def query(self, sql: str, args: list) -> list[dict]:
        with self._lock:
            cur = self._conn.execute(sql, args)
            return [dict(row) for row in cur.fetchall()]


def _turso_arg(value: Any) -> dict:
    if value is None:
        return {"type": "null", "value": None}
    if isinstance(value, int):
        return {"type": "integer", "value": str(value)}
    return {"type": "text", "value": str(value)}


class TursoStore:
    """Render backend. Talks to Turso's libSQL HTTP pipeline API."""

    def __init__(self, url: str, token: str):
        # libsql:// -> https:// for the HTTP endpoint
        self._endpoint = url.replace("libsql://", "https://").rstrip("/") + "/v2/pipeline"
        self._headers = {"Authorization": f"Bearer {token}"}

    def _pipeline(self, stmts: list[tuple[str, list]]) -> list[dict]:
        requests = [
            {"type": "execute", "stmt": {"sql": sql, "args": [_turso_arg(a) for a in args]}}
            for sql, args in stmts
        ]
        requests.append({"type": "close"})
        resp = httpx.post(self._endpoint, headers=self._headers,
                          json={"requests": requests}, timeout=15.0)
        resp.raise_for_status()
        return resp.json()["results"]

    def init_schema(self) -> None:
        self._pipeline([(stmt, []) for stmt in SCHEMA])

    def execute_many(self, statements: list[tuple[str, list]]) -> None:
        self._pipeline(statements)

    def query(self, sql: str, args: list) -> list[dict]:
        results = self._pipeline([(sql, args)])
        result = results[0]["response"]["result"]
        cols = [c["name"] for c in result["cols"]]
        out: list[dict] = []
        for row in result["rows"]:
            values = [None if cell["type"] == "null" else cell["value"] for cell in row]
            typed = []
            for cell, val in zip(row, values):
                if val is not None and cell["type"] == "integer":
                    typed.append(int(val))
                else:
                    typed.append(val)
            out.append(dict(zip(cols, typed)))
        return out


def make_store(cfg) -> Store:
    return TursoStore(cfg.turso_url, cfg.turso_token)
