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
