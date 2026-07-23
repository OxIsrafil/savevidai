from datetime import datetime, time, timedelta, timezone

import pytest

from app.analytics.stats import compute_stats, parse_tz
from app.analytics.store import SqliteStore


def test_parse_tz_valid():
    assert parse_tz("360") == 360
    assert parse_tz(-300) == -300
    assert parse_tz(0) == 0


def test_parse_tz_rejects():
    for bad in ["abc", "841", "-841", "1); DROP TABLE events;--", None, ""]:
        with pytest.raises(ValueError):
            parse_tz(bad)


def test_parse_tz_rejects_non_integer_float():
    # A non-HTTP caller could pass a real float; int(3.5) would silently
    # truncate to 3 instead of rejecting it. String "3.5" already raises
    # via int(), this covers the float-arrives-directly path.
    with pytest.raises(ValueError):
        parse_tz(3.5)
    with pytest.raises(ValueError):
        parse_tz(-3.5)


def test_parse_tz_boundary_inclusive():
    assert parse_tz(840) == 840
    assert parse_tz(-840) == -840
    assert parse_tz("840") == 840
    assert parse_tz("-840") == -840


def _seeded():
    s = SqliteStore(":memory:")
    s.init_schema()
    rows = [
        ("2026-07-17 03:00:00", "visit", None, "BD", "v1"),
        ("2026-07-17 03:01:00", "fetch", "ok", "BD", "v1"),
        ("2026-07-17 03:02:00", "download", "1080p", "BD", "v1"),
        ("2026-07-17 04:00:00", "visit", None, "US", "v2"),
        ("2026-07-17 04:01:00", "fetch", "no_video", "US", "v2"),
        ("2026-07-18 03:00:00", "visit", None, "BD", "v1b"),
        ("2026-07-18 03:01:00", "fetch", "ok", "BD", "v1b"),
    ]
    s.execute_many([
        ("INSERT INTO events (ts,type,outcome,country,visitor) VALUES (?,?,?,?,?)", list(r))
        for r in rows
    ])
    return s


def test_compute_stats_shape_and_values():
    stats = compute_stats(_seeded(), days=30, tz=0)
    assert stats["totals"]["fetches"]["all_time"] == 3
    assert stats["totals"]["downloads"]["all_time"] == 1
    assert stats["totals"]["visits"]["all_time"] == 3
    # countries
    countries = {c["country"]: c["count"] for c in stats["countries"]}
    assert countries["BD"] >= 1 and countries["US"] >= 1
    # qualities
    assert stats["qualities"] == [{"quality": "1080p", "count": 1}]
    # errors (non-ok fetch outcomes)
    errs = {e["code"]: e["count"] for e in stats["errors"]}
    assert errs["no_video"] == 1
    # series has per-day rows
    assert len(stats["series"]) >= 2
    # conversion = fetch-visitor-days / visitor-days on a daily-unique basis
    assert 0.0 <= stats["totals"]["conversion"] <= 1.0


def test_countries_always_includes_unknown_bucket():
    # Spec: "top 10 plus an unknown bucket" - the unknown/null-country bucket
    # must always be present, not just when it ranks in the combined top 11.
    s = SqliteStore(":memory:")
    s.init_schema()
    rows = [
        ("2026-07-18 03:00:00", "visit", None, "BD", "v1"),
        ("2026-07-18 03:01:00", "visit", None, "US", "v2"),
    ]
    s.execute_many([
        ("INSERT INTO events (ts,type,outcome,country,visitor) VALUES (?,?,?,?,?)", list(r))
        for r in rows
    ])
    stats = compute_stats(s, days=30, tz=0)
    countries = {c["country"]: c["count"] for c in stats["countries"]}
    assert "unknown" in countries
    assert countries["unknown"] == 0


def test_conversion_is_sum_of_daily_distinct_not_cross_day_distinct():
    # 3 days, same visitor (v1) appears on two different days, v2 appears on
    # every day, v3 fetches without ever "visiting", v4 visits but never
    # fetches. A correct sum-of-daily-distinct conversion differs from a
    # cross-day COUNT(DISTINCT) implementation, which would instead compute
    # 3/4 = 0.75 (global-distinct fetchers over global-distinct visitors).
    s = SqliteStore(":memory:")
    s.init_schema()
    rows = [
        # day 1 (2026-07-16): v1 visits only, v2 visits + fetches
        ("2026-07-16 03:00:00", "visit", None, "BD", "v1"),
        ("2026-07-16 03:05:00", "visit", None, "US", "v2"),
        ("2026-07-16 03:06:00", "fetch", "ok", "US", "v2"),
        # day 2 (2026-07-17): v1 fetches (no visit event needed), v3 fetches only
        ("2026-07-17 03:00:00", "fetch", "ok", "BD", "v1"),
        ("2026-07-17 03:01:00", "fetch", "ok", "US", "v3"),
        # day 3 (2026-07-18): v2 fetches only, v4 visits and never fetches
        ("2026-07-18 03:00:00", "fetch", "ok", "US", "v2"),
        ("2026-07-18 03:01:00", "visit", None, "BD", "v4"),
    ]
    s.execute_many([
        ("INSERT INTO events (ts,type,outcome,country,visitor) VALUES (?,?,?,?,?)", list(r))
        for r in rows
    ])
    stats = compute_stats(s, days=30, tz=0)
    # visitor-days = 6: (v1,v2) day1, (v1,v3) day2, (v2,v4) day3
    # fetch-visitor-days = 4: v2 day1, v1+v3 day2, v2 day3
    assert stats["totals"]["conversion"] == round(4 / 6, 3)


def test_compute_stats_nonzero_tz_window_not_truncated_and_hour_shift():
    # Regression for: the multi-day window used a fixed UTC instant while
    # series/hours/uniq bucket by LOCAL date. For tz != 0 that truncates the
    # oldest local day. Uses a real Dhaka-style offset (+360 min).
    tz = 360
    days = 30

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    local_now = now + timedelta(minutes=tz)
    earliest_local_day = (local_now - timedelta(days=days)).date()
    earliest_local_midnight_utc = datetime.combine(earliest_local_day, time.min) - timedelta(minutes=tz)

    # The OLD buggy filter was `ts >= datetime('now', '-{days} days')`, a
    # fixed UTC instant. Its local-time representation is exactly
    # (local_now - days), i.e. earliest_local_day at local_now's
    # time-of-day - NOT local midnight. Anything between local midnight and
    # that instant would be wrongly excluded even though it belongs to a day
    # that should be fully included.
    buggy_cutoff = now - timedelta(days=days)
    gap = buggy_cutoff - earliest_local_midnight_utc
    assert gap > timedelta(0), "test must not run exactly at local midnight"

    boundary_event_ts = earliest_local_midnight_utc + gap / 2
    assert boundary_event_ts < buggy_cutoff
    assert (boundary_event_ts + timedelta(minutes=tz)).date() == earliest_local_day

    # A second event: UTC 22:00 on some day comfortably inside the window
    # rolls forward to the *next* local day at local hour 04:00.
    shift_utc_day = earliest_local_day + timedelta(days=5)
    shift_utc = datetime.combine(shift_utc_day, time(22, 0, 0))
    shift_local = shift_utc + timedelta(minutes=tz)
    assert shift_local.date() == shift_utc_day + timedelta(days=1)
    assert shift_local.hour == 4

    boundary_local_hour = (boundary_event_ts + timedelta(minutes=tz)).hour
    expected_hour4_count = 1 + (1 if boundary_local_hour == 4 else 0)

    def fmt(dt: datetime) -> str:
        return dt.strftime("%Y-%m-%d %H:%M:%S")

    s = SqliteStore(":memory:")
    s.init_schema()
    s.execute_many([
        ("INSERT INTO events (ts,type,outcome,country,visitor) VALUES (?,?,?,?,?)",
         [fmt(boundary_event_ts), "visit", None, "BD", "boundary-visitor"]),
        ("INSERT INTO events (ts,type,outcome,country,visitor) VALUES (?,?,?,?,?)",
         [fmt(shift_utc), "fetch", "ok", "BD", "shift-visitor"]),
    ])

    stats = compute_stats(s, days=days, tz=tz)
    series_by_day = {row["day"]: row for row in stats["series"]}

    earliest_day_str = earliest_local_day.isoformat()
    assert earliest_day_str in series_by_day, "earliest local day missing/truncated by the window filter"
    assert series_by_day[earliest_day_str]["visit"] == 1

    shift_local_day_str = (shift_utc_day + timedelta(days=1)).isoformat()
    assert shift_local_day_str in series_by_day
    assert series_by_day[shift_local_day_str]["fetch"] == 1

    hours_by_hour = {row["hour"]: row["count"] for row in stats["hours"]}
    assert hours_by_hour.get(4) == expected_hour4_count


def test_stats_platforms_breakdown():
    from app.analytics.stats import compute_stats
    from app.analytics.store import SqliteStore
    s = SqliteStore(":memory:")
    s.init_schema()
    rows = [
        ("2026-07-20 10:00:00", "fetch", "ok", None, "v1", "twitter"),
        ("2026-07-20 10:01:00", "fetch", "ok", None, "v2", "tiktok"),
        ("2026-07-20 10:02:00", "download", "hd", None, "v2", "tiktok"),
    ]
    s.execute_many([("INSERT INTO events (ts,type,outcome,country,visitor,platform) VALUES (?,?,?,?,?,?)", list(r)) for r in rows])
    out = compute_stats(s, days=30, tz=0)
    by = {p["platform"]: p for p in out["platforms"]}
    assert by["twitter"]["fetches"] == 1
    assert by["tiktok"]["fetches"] == 1
    assert by["tiktok"]["downloads"] == 1


def test_platforms_breakdown_nonzero_tz_window_not_truncated():
    # Regression for the same UTC-vs-local window class as
    # test_compute_stats_nonzero_tz_window_not_truncated_and_hour_shift, but
    # aimed at the platforms breakdown query specifically. The existing
    # platforms test only runs tz=0 (where local == UTC), so a future rewrite
    # of the platforms query to a fixed UTC-instant cutoff
    # (ts >= datetime('now','-days days')) would still pass it. This pins the
    # local-time window: a platform-tagged event that sits BEFORE the buggy
    # UTC cutoff but INSIDE the correct local-date window must be counted.
    tz = 360
    days = 30

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    local_now = now + timedelta(minutes=tz)
    earliest_local_day = (local_now - timedelta(days=days)).date()
    earliest_local_midnight_utc = datetime.combine(earliest_local_day, time.min) - timedelta(minutes=tz)

    # The would-be buggy filter `ts >= datetime('now','-days days')` cuts at a
    # fixed UTC instant strictly later than the earliest local midnight (when
    # tz > 0). An event between local midnight and that instant belongs to a
    # day the window should fully include, yet a UTC-instant filter drops it.
    buggy_cutoff = now - timedelta(days=days)
    gap = buggy_cutoff - earliest_local_midnight_utc
    assert gap > timedelta(0), "test must not run exactly at local midnight"

    boundary_event_ts = earliest_local_midnight_utc + gap / 2
    assert boundary_event_ts < buggy_cutoff
    assert (boundary_event_ts + timedelta(minutes=tz)).date() == earliest_local_day

    def fmt(dt: datetime) -> str:
        return dt.strftime("%Y-%m-%d %H:%M:%S")

    s = SqliteStore(":memory:")
    s.init_schema()
    s.execute_many([
        # Boundary fetch: excluded by a UTC-instant window, included by the
        # correct local-date window.
        ("INSERT INTO events (ts,type,outcome,country,visitor,platform) VALUES (?,?,?,?,?,?)",
         [fmt(boundary_event_ts), "fetch", "ok", "BD", "boundary-visitor", "tiktok"]),
        # A second platform comfortably inside the window, so the breakdown is
        # non-empty either way and the boundary row is the only thing at stake.
        ("INSERT INTO events (ts,type,outcome,country,visitor,platform) VALUES (?,?,?,?,?,?)",
         [fmt(now - timedelta(days=1)), "fetch", "ok", "US", "inside-visitor", "twitter"]),
    ])

    out = compute_stats(s, days=days, tz=tz)
    by = {p["platform"]: p for p in out["platforms"]}
    assert by["twitter"]["fetches"] == 1
    # If the platforms query used a UTC-instant cutoff, tiktok would be absent.
    assert "tiktok" in by, "boundary-day platform truncated by a UTC-instant window filter"
    assert by["tiktok"]["fetches"] == 1


def test_platforms_breakdown_ordered_by_fetches_desc():
    # Pins "ORDER BY fetches DESC" on the platforms query. The existing
    # platforms test ties fetch counts 1-1 and reads the result into a dict,
    # discarding order, so dropping the ORDER BY would not fail it. Here the
    # counts are unequal and we assert the list order directly.
    s = SqliteStore(":memory:")
    s.init_schema()
    rows = [
        # twitter: 1 fetch
        ("2026-07-20 10:00:00", "fetch", "ok", None, "v1", "twitter"),
        # tiktok: 3 fetches (the largest, must sort first)
        ("2026-07-20 10:01:00", "fetch", "ok", None, "v2", "tiktok"),
        ("2026-07-20 10:02:00", "fetch", "ok", None, "v3", "tiktok"),
        ("2026-07-20 10:03:00", "fetch", "ok", None, "v4", "tiktok"),
        # instagram: 2 fetches (middle)
        ("2026-07-20 10:04:00", "fetch", "ok", None, "v5", "instagram"),
        ("2026-07-20 10:05:00", "fetch", "ok", None, "v6", "instagram"),
    ]
    s.execute_many([
        ("INSERT INTO events (ts,type,outcome,country,visitor,platform) VALUES (?,?,?,?,?,?)", list(r))
        for r in rows
    ])
    out = compute_stats(s, days=30, tz=0)
    order = [p["platform"] for p in out["platforms"]]
    assert order == ["tiktok", "instagram", "twitter"]


def _day_ts(offset_days: int, hour: int = 12) -> str:
    d = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=offset_days)
    return d.replace(hour=hour, minute=0, second=0, microsecond=0).strftime("%Y-%m-%d %H:%M:%S")


def test_avg_active_d7_d30_daily_uniques_over_fixed_window():
    # avg_active convention: sum of per-day distinct-visitor counts over the
    # FIXED 7 / 30 local-day window, divided by 7 / 30 (missing days count as
    # 0 uniques), rounded to nearest int. Independent of the `days` argument.
    s = SqliteStore(":memory:")
    s.init_schema()
    rows = []
    # last-7-day window: day -1 => 10 distinct, day -2 => 20, day -3 => 30.
    for offset, n in ((1, 10), (2, 20), (3, 30)):
        for i in range(n):
            rows.append((_day_ts(offset), "visit", None, "BD", f"a{offset}_{i}", None, None, None))
    # inside 30d but outside 7d: day -15 => 40 distinct.
    for i in range(40):
        rows.append((_day_ts(15), "visit", None, "BD", f"b_{i}", None, None, None))
    s.execute_many([
        ("INSERT INTO events (ts,type,outcome,country,visitor,platform,source,visitor_kind) "
         "VALUES (?,?,?,?,?,?,?,?)", list(r))
        for r in rows
    ])
    stats = compute_stats(s, days=7, tz=0)
    assert stats["avg_active"]["d7"] == round((10 + 20 + 30) / 7)
    assert stats["avg_active"]["d30"] == round((10 + 20 + 30 + 40) / 30)


def test_avg_active_empty_is_zero():
    s = SqliteStore(":memory:")
    s.init_schema()
    stats = compute_stats(s, days=30, tz=0)
    assert stats["avg_active"] == {"d7": 0, "d30": 0}


def test_avg_active_nonzero_tz_local_day_bucketing():
    # Pins the local-day bucketing of the fixed 7-day window. A boundary-day of
    # distinct visitors sits BEFORE the would-be buggy UTC-instant cutoff
    # (ts >= datetime('now','-7 days')) but INSIDE the correct local-date
    # window. Counting it makes d7 = round(4/7) = 1; a UTC rewrite yields 0.
    tz = 360
    window_days = 7

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    local_now = now + timedelta(minutes=tz)
    earliest_local_day = (local_now - timedelta(days=window_days)).date()
    earliest_local_midnight_utc = datetime.combine(earliest_local_day, time.min) - timedelta(minutes=tz)

    buggy_cutoff = now - timedelta(days=window_days)
    gap = buggy_cutoff - earliest_local_midnight_utc
    assert gap > timedelta(0), "test must not run exactly at local midnight"

    boundary_event_ts = earliest_local_midnight_utc + gap / 2
    assert boundary_event_ts < buggy_cutoff
    assert (boundary_event_ts + timedelta(minutes=tz)).date() == earliest_local_day

    def fmt(dt: datetime) -> str:
        return dt.strftime("%Y-%m-%d %H:%M:%S")

    s = SqliteStore(":memory:")
    s.init_schema()
    # 4 distinct visitors, all on the boundary local day, nothing else.
    s.execute_many([
        ("INSERT INTO events (ts,type,outcome,country,visitor,platform,source,visitor_kind) "
         "VALUES (?,?,?,?,?,?,?,?)",
         [fmt(boundary_event_ts), "visit", None, "BD", f"bv{i}", None, None, None])
        for i in range(4)
    ])

    stats = compute_stats(s, days=window_days, tz=tz)
    assert stats["avg_active"]["d7"] == 1


def test_sources_grouped_and_ordered_desc():
    s = SqliteStore(":memory:")
    s.init_schema()
    rows = [
        ("2026-07-20 10:00:00", "visit", None, "BD", "v1", None, "search", None),
        ("2026-07-20 10:01:00", "visit", None, "BD", "v2", None, "search", None),
        ("2026-07-20 10:02:00", "visit", None, "US", "v3", None, "direct", None),
        # non-visit with a source must not be counted
        ("2026-07-20 10:03:00", "fetch", "ok", "US", "v3", None, "search", None),
        # visit with NULL source must not be counted
        ("2026-07-20 10:04:00", "visit", None, "US", "v4", None, None, None),
    ]
    s.execute_many([
        ("INSERT INTO events (ts,type,outcome,country,visitor,platform,source,visitor_kind) "
         "VALUES (?,?,?,?,?,?,?,?)", list(r))
        for r in rows
    ])
    stats = compute_stats(s, days=30, tz=0)
    assert stats["sources"] == [{"source": "search", "count": 2}, {"source": "direct", "count": 1}]


def test_visitors_new_vs_returning_split():
    s = SqliteStore(":memory:")
    s.init_schema()
    rows = [
        ("2026-07-20 10:00:00", "visit", None, "BD", "v1", None, None, "new"),
        ("2026-07-20 10:01:00", "visit", None, "BD", "v2", None, None, "new"),
        ("2026-07-20 10:02:00", "visit", None, "US", "v3", None, None, "new"),
        ("2026-07-20 10:03:00", "visit", None, "US", "v4", None, None, "returning"),
        ("2026-07-20 10:04:00", "visit", None, "US", "v5", None, None, "returning"),
        # non-visit rows carry no visitor_kind and must be ignored
        ("2026-07-20 10:05:00", "fetch", "ok", "US", "v1", None, None, None),
    ]
    s.execute_many([
        ("INSERT INTO events (ts,type,outcome,country,visitor,platform,source,visitor_kind) "
         "VALUES (?,?,?,?,?,?,?,?)", list(r))
        for r in rows
    ])
    stats = compute_stats(s, days=30, tz=0)
    assert stats["visitors"] == {"new": 3, "returning": 2}
