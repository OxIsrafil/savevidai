"""Range analytics for the admin dashboard.

Every window bound is computed in Python from an injected `now` and the
owner's tz offset, then handed to SQLite as bound `ts >= ? AND ts < ?`
parameters in the stored UTC text format. Nothing here calls the database
clock: the same `now` always gives the same numbers, which is what makes the
report testable with a fixed clock and lets `idx_events_ts` serve every range.

Local-time grouping (days, hours) uses `datetime(ts, '<+/-N minutes>')` with
the validated integer offset inlined, as the old stats module did.
"""
import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from .store import Store

RANGES = {"today": 1, "7d": 7, "30d": 30, "90d": 90}
DEFAULT_RANGE = "7d"
_TS_FORMAT = "%Y-%m-%d %H:%M:%S"
_MAX_TZ = 840  # +/- 14 hours

# Standard resolution ladder (pixel heights). fxtwitter and reddit emit the raw
# source height as the quality label (`{height}p`), so odd-aspect / portrait
# videos produce non-standard values like 1124p or 1054p that would otherwise
# each become their own row in the qualities panel. We snap each raw height to
# the nearest rung for display; named labels (hd/sd/photo/... from TikTok) are
# not heights and pass through untouched.
# Note: the label is the source HEIGHT, so tall portrait clips bias upward (a
# 720x1280 portrait video is height 1280 and snaps to 1440p, not 1080p). That is
# inherent to bucketing by height, not a snapping bug.
_TIER_LADDER = (144, 240, 360, 480, 720, 1080, 1440, 2160)
_HEIGHT_LABEL = re.compile(r"^(\d+)p$")


def _bucket_quality(label: str) -> str:
    """Snap a `{height}p` quality label to the nearest standard tier; return any
    non-height label (hd, sd, video, photo, album, sound, ...) unchanged. Exact
    midpoint ties resolve to the lower tier (the quality actually guaranteed)."""
    m = _HEIGHT_LABEL.match(label)
    if not m:
        return label
    h = int(m.group(1))
    # min() scans the ascending ladder and keeps the FIRST minimal difference,
    # so an exact tie lands on the lower rung.
    tier = min(_TIER_LADDER, key=lambda t: abs(t - h))
    return f"{tier}p"


def parse_tz(raw) -> int:
    """Validate the timezone offset (minutes east of UTC). Must be an integer in
    [-840, 840]; anything else raises ValueError (guards the SQL modifier)."""
    if raw is None or raw == "":
        raise ValueError("tz required")
    if isinstance(raw, float) and not raw.is_integer():
        # int(3.5) would silently truncate to 3 instead of rejecting; a real
        # (non-HTTP) caller could pass a fractional float directly.
        raise ValueError("tz must be an integer")
    try:
        tz = int(raw)
    except (TypeError, ValueError) as exc:
        raise ValueError("tz must be an integer") from exc
    if tz < -_MAX_TZ or tz > _MAX_TZ:
        raise ValueError("tz out of range")
    return tz


def parse_range(raw: str | None) -> str:
    """An omitted or empty range means the default (7d); anything not in RANGES
    raises ValueError so the router can answer 422 bad_range."""
    if raw is None or raw == "":
        return DEFAULT_RANGE
    if raw not in RANGES:
        raise ValueError("bad range")
    return raw


def _tzmod(tz: int) -> str:
    # tz is a validated int, safe to inline into the SQLite datetime modifier.
    sign = "+" if tz >= 0 else "-"
    return f"{sign}{abs(tz)} minutes"


def _local(tz: int) -> str:
    return f"datetime(ts, '{_tzmod(tz)}')"


def _fmt(dt: datetime) -> str:
    return dt.strftime(_TS_FORMAT)


def _utc_text(local: datetime, tz: int) -> str:
    """A naive local wall-clock instant as stored UTC text."""
    return _fmt(local - timedelta(minutes=tz))


def _local_now(now: datetime, tz: int) -> datetime:
    """`now` (aware) as naive local wall time: L = now + tz minutes."""
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    return now.astimezone(UTC).replace(tzinfo=None) + timedelta(minutes=tz)


@dataclass(frozen=True)
class Window:
    """A half-open local-time window [start, end) and its UTC text bounds.

    `start` and `end` are naive local wall-clock datetimes; the SQL bounds are
    the same instants converted back to UTC text, so `ts >= start_utc AND
    ts < end_utc` selects exactly the events inside the local window."""

    start: datetime
    end: datetime
    tz: int

    @property
    def start_utc(self) -> str:
        return _utc_text(self.start, self.tz)

    @property
    def end_utc(self) -> str:
        return _utc_text(self.end, self.tz)

    @property
    def last_midnight_utc(self) -> str:
        """UTC text of local midnight on the window's last day: the complete
        days are [start, last midnight), the partial day is the rest."""
        midnight = self.end.replace(hour=0, minute=0, second=0, microsecond=0)
        return _utc_text(midnight, self.tz)

    @property
    def first_date(self) -> str:
        return self.start.date().isoformat()

    @property
    def last_date(self) -> str:
        return self.end.date().isoformat()


def windows(range_key: str, tz: int, now: datetime) -> tuple[Window, Window]:
    """Current and previous windows for a range (spec B2).

    With L = now + tz minutes and M0 = local midnight of L's date, the current
    window is local [M0 - (N-1) days, L) and the previous one is the current
    window shifted back by exactly N days: same length, same time-of-day cut."""
    n = RANGES[range_key]
    local_now = _local_now(now, tz)
    m0 = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    current = Window(m0 - timedelta(days=n - 1), local_now, tz)
    previous = Window(current.start - timedelta(days=n), local_now - timedelta(days=n), tz)
    return current, previous


def has_previous(store: Store, previous: Window) -> bool:
    """True only when the oldest retained event is at or before the previous
    window's start, so a delta never compares against a half-covered period."""
    rows = store.query("SELECT MIN(ts) AS m FROM events", [])
    oldest = rows[0]["m"] if rows else None
    return oldest is not None and oldest <= previous.start_utc


# ---- totals ----------------------------------------------------------------

_COUNTS_SQL = (
    "SELECT "
    "COALESCE(SUM(CASE WHEN type='visit' THEN 1 ELSE 0 END), 0) AS page_views, "
    "COALESCE(SUM(CASE WHEN type='fetch' THEN 1 ELSE 0 END), 0) AS fetches, "
    "COALESCE(SUM(CASE WHEN type='fetch' AND outcome='ok' THEN 1 ELSE 0 END), 0) AS ok_fetches, "
    "COALESCE(SUM(CASE WHEN type='fetch' AND outcome IS NOT NULL AND outcome != 'ok' "
    "THEN 1 ELSE 0 END), 0) AS failed_fetches, "
    "COALESCE(SUM(CASE WHEN type='fetch' AND outcome='upstream_error' THEN 1 ELSE 0 END), 0) "
    "AS upstream_errors, "
    "COALESCE(SUM(CASE WHEN type='download' THEN 1 ELSE 0 END), 0) AS downloads "
    "FROM events WHERE ts >= ? AND ts < ?"
)

_KINDS_SQL = (
    "SELECT "
    "COALESCE(SUM(CASE WHEN n > 0 THEN 1 ELSE 0 END), 0) AS new_visitors, "
    "COALESCE(SUM(CASE WHEN n = 0 AND r > 0 THEN 1 ELSE 0 END), 0) AS returning_visitors "
    "FROM (SELECT visitor, "
    "SUM(CASE WHEN visitor_kind='new' THEN 1 ELSE 0 END) AS n, "
    "SUM(CASE WHEN visitor_kind='returning' THEN 1 ELSE 0 END) AS r "
    "FROM events WHERE ts >= ? AND ts < ? AND type='visit' GROUP BY visitor)"
)


def _visitor_days(store: Store, tz: int, start_utc: str, end_utc: str) -> dict:
    """Visitor-day summary of a UTC text range: one row per distinct (local day,
    visitor) with what that person did that day, then nested counts. `visitors`
    is the sum over local days of COUNT(DISTINCT visitor); `downloaded` needs an
    ok fetch AND a download on the same visitor-day."""
    local = _local(tz)
    rows = store.query(
        "SELECT COUNT(*) AS visitors, "
        "COALESCE(SUM(f), 0) AS fetched, "
        "COALESCE(SUM(o), 0) AS got_result, "
        "COALESCE(SUM(CASE WHEN o = 1 AND d = 1 THEN 1 ELSE 0 END), 0) AS downloaded "
        f"FROM (SELECT date({local}) AS day, visitor, "
        "MAX(CASE WHEN type='fetch' THEN 1 ELSE 0 END) AS f, "
        "MAX(CASE WHEN type='fetch' AND outcome='ok' THEN 1 ELSE 0 END) AS o, "
        "MAX(CASE WHEN type='download' THEN 1 ELSE 0 END) AS d "
        "FROM events WHERE ts >= ? AND ts < ? GROUP BY day, visitor)",
        [start_utc, end_utc],
    )
    return rows[0]


def totals(store: Store, window: Window, n: int) -> dict:
    """The totals block (spec B3) for one window. `n` is the range length in
    days: complete days are the N-1 before the partial last day (0 for today)."""
    counts = store.query(_COUNTS_SQL, [window.start_utc, window.end_utc])[0]
    days = _visitor_days(store, window.tz, window.start_utc, window.end_utc)
    kinds = store.query(_KINDS_SQL, [window.start_utc, window.end_utc])[0]
    complete_days = n - 1
    if complete_days:
        complete = _visitor_days(store, window.tz, window.start_utc, window.last_midnight_utc)
        complete_day_visitors = complete["visitors"]
    else:
        complete_day_visitors = 0
    return {
        "visitors": days["visitors"],
        "page_views": counts["page_views"],
        "fetches": counts["fetches"],
        "ok_fetches": counts["ok_fetches"],
        "failed_fetches": counts["failed_fetches"],
        "upstream_errors": counts["upstream_errors"],
        "downloads": counts["downloads"],
        "downloaded_visitors": days["downloaded"],
        "new_visitors": kinds["new_visitors"],
        "returning_visitors": kinds["returning_visitors"],
        "complete_days": complete_days,
        "complete_day_visitors": complete_day_visitors,
    }


# ---- series ----------------------------------------------------------------

_SERIES_VALUES = (
    "COUNT(DISTINCT visitor) AS visitors, "
    "COALESCE(SUM(CASE WHEN type='fetch' THEN 1 ELSE 0 END), 0) AS fetches, "
    "COALESCE(SUM(CASE WHEN type='download' THEN 1 ELSE 0 END), 0) AS downloads, "
    "COALESCE(SUM(CASE WHEN type='fetch' AND outcome IS NOT NULL AND outcome != 'ok' "
    "THEN 1 ELSE 0 END), 0) AS failed_fetches"
)


def _zero_point() -> dict:
    return {"visitors": 0, "fetches": 0, "downloads": 0, "failed_fetches": 0}


def _point(row: dict) -> dict:
    return {
        "visitors": row["visitors"],
        "fetches": row["fetches"],
        "downloads": row["downloads"],
        "failed_fetches": row["failed_fetches"],
    }


def _daily_points(store: Store, window: Window) -> dict[str, dict]:
    local = _local(window.tz)
    rows = store.query(
        f"SELECT date({local}) AS key, {_SERIES_VALUES} "
        "FROM events WHERE ts >= ? AND ts < ? GROUP BY key",
        [window.start_utc, window.end_utc],
    )
    return {r["key"]: _point(r) for r in rows}


def _hourly_points(store: Store, window: Window) -> dict[int, dict]:
    local = _local(window.tz)
    rows = store.query(
        f"SELECT CAST(strftime('%H', {local}) AS INTEGER) AS key, {_SERIES_VALUES} "
        "FROM events WHERE ts >= ? AND ts < ? GROUP BY key",
        [window.start_utc, window.end_utc],
    )
    return {int(r["key"]): _point(r) for r in rows}


def series(store: Store, current: Window, previous: Window, n: int, bucket: str,
           with_previous: bool) -> list[dict]:
    """One row per bucket (spec B2 buckets). Hourly for today: integer keys
    0..23, null values after the current local hour in both series. Daily
    otherwise: N local dates oldest first, zero-filled; bucket i of the previous
    series is local day M0 - (2N-1) + i."""
    if bucket == "hour":
        cur = _hourly_points(store, current)
        prev = _hourly_points(store, previous) if with_previous else {}
        last_hour = current.end.hour
        out = []
        for h in range(24):
            if h > last_hour:
                out.append({"key": h, "prev_key": h, "cur": None, "prev": None})
                continue
            out.append({
                "key": h,
                "prev_key": h,
                "cur": cur.get(h, _zero_point()),
                "prev": prev.get(h, _zero_point()) if with_previous else None,
            })
        return out
    cur = _daily_points(store, current)
    prev = _daily_points(store, previous) if with_previous else {}
    out = []
    for i in range(n):
        key = (current.start.date() + timedelta(days=i)).isoformat()
        prev_key = (previous.start.date() + timedelta(days=i)).isoformat()
        out.append({
            "key": key,
            "prev_key": prev_key,
            "cur": cur.get(key, _zero_point()),
            "prev": prev.get(prev_key, _zero_point()) if with_previous else None,
        })
    return out


# ---- entry point -----------------------------------------------------------

def compute_report(store: Store, range_key: str, tz: int, now: datetime) -> dict:
    """The report core (spec B4 minus the panels, which Task 3 adds to this
    same dict). `range_key` must come from parse_range and `tz` from parse_tz;
    `now` is an aware datetime (the router passes datetime.now(UTC))."""
    n = RANGES[range_key]
    current, previous = windows(range_key, tz, now)
    bucket = "hour" if range_key == "today" else "day"
    with_previous = has_previous(store, previous)
    return {
        "range": range_key,
        "tz": tz,
        "bucket": bucket,
        "has_previous": with_previous,
        "window": {"start": current.first_date, "end": current.last_date},
        "totals": totals(store, current, n),
        "previous": totals(store, previous, n) if with_previous else None,
        "series": series(store, current, previous, n, bucket, with_previous),
    }
