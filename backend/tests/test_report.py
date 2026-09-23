"""Report tests run against a FIXED clock: NOW = 2026-09-23 07:30 UTC. Every
seed is written relative to it (absolute UTC text or the at() helper), so the
numbers below never drift with the calendar."""
import inspect
from datetime import UTC, datetime, timedelta

import pytest

from app.analytics import report
from app.analytics.report import (
    RANGES,
    Window,
    _bucket_quality,
    compute_report,
    compute_resolvers,
    has_previous,
    parse_range,
    parse_tz,
    windows,
)
from app.analytics.store import SqliteStore

NOW = datetime(2026, 9, 23, 7, 30, tzinfo=UTC)

COLS = ("ts", "type", "outcome", "country", "visitor", "platform", "source", "visitor_kind",
        "locale")
_INSERT = f"INSERT INTO events ({', '.join(COLS)}) VALUES ({', '.join('?' * len(COLS))})"

TOTAL_KEYS = {
    "visitors", "page_views", "fetches", "ok_fetches", "failed_fetches", "upstream_errors",
    "downloads", "downloaded_visitors", "new_visitors", "returning_visitors", "complete_days",
    "complete_day_visitors",
}


def at(**delta) -> str:
    """UTC text of NOW shifted by timedelta(**delta), e.g. at(minutes=-4)."""
    return (NOW + timedelta(**delta)).strftime("%Y-%m-%d %H:%M:%S")


def seeded(rows) -> SqliteStore:
    """Rows are tuples in COLS order; short tuples are padded with NULLs."""
    s = SqliteStore(":memory:")
    s.init_schema()
    s.execute_many([(_INSERT, list(r) + [None] * (len(COLS) - len(r))) for r in rows])
    return s


def zeros() -> dict:
    return {"visitors": 0, "fetches": 0, "downloads": 0, "failed_fetches": 0}


# ---- helpers ported from tests/test_stats.py ---------------------------------

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


def test_bucket_quality_snaps_heights_to_nearest_standard_tier():
    # Raw pixel-height labels (fxtwitter/reddit emit `{height}p` verbatim, so
    # portrait/odd-aspect videos produce values like 1124p, 1054p, 680p) snap to
    # the nearest standard rung on the ladder.
    assert _bucket_quality("1124p") == "1080p"
    assert _bucket_quality("1054p") == "1080p"
    assert _bucket_quality("680p") == "720p"
    assert _bucket_quality("500p") == "480p"
    assert _bucket_quality("400p") == "360p"
    # Exact standard tiers are unchanged.
    assert _bucket_quality("1080p") == "1080p"
    assert _bucket_quality("360p") == "360p"
    # A genuine hi-res video is not squashed into 1080p.
    assert _bucket_quality("1440p") == "1440p"
    assert _bucket_quality("2100p") == "2160p"
    # Exact midpoint ties resolve to the lower (guaranteed) tier.
    assert _bucket_quality("600p") == "480p"


def test_bucket_quality_passes_named_labels_through():
    # TikTok emits named labels; they are not heights and must survive verbatim.
    for label in ("hd", "sd", "video", "photo", "album", "sound"):
        assert _bucket_quality(label) == label


def test_parse_range_defaults_and_rejects():
    assert parse_range(None) == "7d"
    assert parse_range("") == "7d"
    for key in RANGES:
        assert parse_range(key) == key
    for bad in ("7", "week", "1d", "TODAY", "365d", "7d "):
        with pytest.raises(ValueError):
            parse_range(bad)


def test_report_never_reads_the_database_clock():
    # Every bound is a parameter computed from `now`; the SQLite clock would
    # make the numbers depend on wall time and defeat the index.
    src = inspect.getsource(report)
    assert "datetime('now'" not in src
    assert 'datetime("now"' not in src


# ---- windows (spec B2) --------------------------------------------------------

# (tz, range) -> ((current start, current end), (previous start, previous end)) as
# UTC text. Worked from NOW = 2026-09-23 07:30 UTC:
#   tz 0:    L = 07:30, M0 = 2026-09-23 00:00
#   tz +360: L = 13:30, M0 = 2026-09-23 00:00 local = 2026-09-22 18:00 UTC
#   tz -300: L = 02:30, M0 = 2026-09-23 00:00 local = 2026-09-23 05:00 UTC
BOUNDS = {
    (0, "today"): (("2026-09-23 00:00:00", "2026-09-23 07:30:00"),
                   ("2026-09-22 00:00:00", "2026-09-22 07:30:00")),
    (0, "7d"): (("2026-09-17 00:00:00", "2026-09-23 07:30:00"),
                ("2026-09-10 00:00:00", "2026-09-16 07:30:00")),
    (0, "30d"): (("2026-08-25 00:00:00", "2026-09-23 07:30:00"),
                 ("2026-07-26 00:00:00", "2026-08-24 07:30:00")),
    (0, "90d"): (("2026-06-26 00:00:00", "2026-09-23 07:30:00"),
                 ("2026-03-28 00:00:00", "2026-06-25 07:30:00")),
    (360, "today"): (("2026-09-22 18:00:00", "2026-09-23 07:30:00"),
                     ("2026-09-21 18:00:00", "2026-09-22 07:30:00")),
    (360, "7d"): (("2026-09-16 18:00:00", "2026-09-23 07:30:00"),
                  ("2026-09-09 18:00:00", "2026-09-16 07:30:00")),
    (360, "30d"): (("2026-08-24 18:00:00", "2026-09-23 07:30:00"),
                   ("2026-07-25 18:00:00", "2026-08-24 07:30:00")),
    (360, "90d"): (("2026-06-25 18:00:00", "2026-09-23 07:30:00"),
                   ("2026-03-27 18:00:00", "2026-06-25 07:30:00")),
    (-300, "today"): (("2026-09-23 05:00:00", "2026-09-23 07:30:00"),
                      ("2026-09-22 05:00:00", "2026-09-22 07:30:00")),
    (-300, "7d"): (("2026-09-17 05:00:00", "2026-09-23 07:30:00"),
                   ("2026-09-10 05:00:00", "2026-09-16 07:30:00")),
    (-300, "30d"): (("2026-08-25 05:00:00", "2026-09-23 07:30:00"),
                    ("2026-07-26 05:00:00", "2026-08-24 07:30:00")),
    (-300, "90d"): (("2026-06-26 05:00:00", "2026-09-23 07:30:00"),
                    ("2026-03-28 05:00:00", "2026-06-25 07:30:00")),
}


@pytest.mark.parametrize(("tz", "range_key"), sorted(BOUNDS))
def test_windows_utc_bounds(tz, range_key):
    current, previous = windows(range_key, tz, NOW)
    (cs, ce), (ps, pe) = BOUNDS[(tz, range_key)]
    assert (current.start_utc, current.end_utc) == (cs, ce)
    assert (previous.start_utc, previous.end_utc) == (ps, pe)
    # The previous window is the current one shifted back by exactly N days.
    n = RANGES[range_key]
    assert current.start - previous.start == timedelta(days=n)
    assert current.end - previous.end == timedelta(days=n)


def test_windows_require_an_aware_now():
    with pytest.raises(ValueError):
        windows("7d", 0, NOW.replace(tzinfo=None))


def test_window_dates_and_bucket_per_range():
    empty = seeded([])
    expected = {
        "today": ("2026-09-23", "2026-09-23", "hour", 1),
        "7d": ("2026-09-17", "2026-09-23", "day", 7),
        "30d": ("2026-08-25", "2026-09-23", "day", 30),
        "90d": ("2026-06-26", "2026-09-23", "day", 90),
    }
    for range_key, (start, end, bucket, length) in expected.items():
        out = compute_report(empty, range_key, 360, NOW)
        assert out["range"] == range_key
        assert out["tz"] == 360
        assert out["window"] == {"start": start, "end": end}
        assert out["bucket"] == bucket
        assert len(out["series"]) == (24 if bucket == "hour" else length)
        assert out["totals"]["complete_days"] == length - 1


def test_last_midnight_is_the_complete_days_cut():
    current, previous = windows("7d", 360, NOW)
    assert current.last_midnight_utc == "2026-09-22 18:00:00"
    assert previous.last_midnight_utc == "2026-09-15 18:00:00"
    today, yesterday = windows("today", -300, NOW)
    assert today.last_midnight_utc == today.start_utc == "2026-09-23 05:00:00"
    assert yesterday.last_midnight_utc == "2026-09-22 05:00:00"
    assert isinstance(today, Window)


def test_bounds_are_inclusive_start_exclusive_end_with_a_gap_between_windows():
    # tz +360, 7d: previous [09-09 18:00, 09-16 07:30), current [09-16 18:00, now).
    # The previous window is cut at the same time of day, so the rest of local
    # 09-16 (07:30 to 18:00 UTC) belongs to neither window.
    s = seeded([
        ("2026-09-09 18:00:00", "visit", None, None, "p-start", "twitter", "direct", "new"),
        ("2026-09-16 07:29:59", "fetch", "ok", None, "p-last", "twitter"),
        ("2026-09-16 07:30:00", "fetch", "ok", None, "gap-1", "twitter"),
        ("2026-09-16 17:59:59", "fetch", "ok", None, "gap-2", "twitter"),
        ("2026-09-16 18:00:00", "fetch", "ok", None, "c-start", "twitter"),
        ("2026-09-23 07:29:59", "fetch", "ok", None, "c-last", "twitter"),
        ("2026-09-23 07:30:00", "fetch", "ok", None, "c-end", "twitter"),
    ])
    out = compute_report(s, "7d", 360, NOW)
    assert out["has_previous"] is True
    assert out["totals"]["fetches"] == 2
    assert out["totals"]["visitors"] == 2
    assert out["previous"]["fetches"] == 1
    assert out["previous"]["page_views"] == 1
    assert out["previous"]["visitors"] == 2


# ---- has_previous -------------------------------------------------------------

def test_has_previous_false_on_an_empty_store():
    out = compute_report(seeded([]), "7d", 0, NOW)
    assert out["has_previous"] is False
    assert out["previous"] is None
    assert all(row["prev"] is None for row in out["series"])


def test_has_previous_needs_the_oldest_event_at_or_before_the_previous_start():
    _, previous = windows("7d", 0, NOW)
    assert previous.start_utc == "2026-09-10 00:00:00"
    after = seeded([("2026-09-10 00:00:01", "visit", None, None, "v", "twitter")])
    assert has_previous(after, previous) is False
    at_start = seeded([("2026-09-10 00:00:00", "visit", None, None, "v", "twitter")])
    assert has_previous(at_start, previous) is True
    before = seeded([("2026-09-01 00:00:00", "visit", None, None, "v", "twitter")])
    assert has_previous(before, previous) is True


def test_has_previous_is_false_for_90d_under_90_day_retention():
    # 90d compares with the 90 days before; retention prunes at 90 days, so the
    # oldest row is never early enough. The first second of the current window
    # is 89 days back and does not qualify.
    s = seeded([("2026-06-26 00:00:00", "visit", None, None, "v", "twitter")])
    out = compute_report(s, "90d", 0, NOW)
    assert out["has_previous"] is False
    assert out["previous"] is None


# ---- totals (spec B3) ---------------------------------------------------------

def _seed_week() -> SqliteStore:
    """tz 0, 7d. Previous window [09-10 00:00, 09-16 07:30), gap until 09-17
    00:00, current window [09-17 00:00, 09-23 07:30)."""
    return seeded([
        # previous window, starting on its very first second (has_previous)
        ("2026-09-10 00:00:00", "visit", None, "BD", "vOld", "twitter", "direct", "new"),
        ("2026-09-15 12:00:00", "visit", None, "US", "vP", "tiktok", "search", "returning"),
        ("2026-09-15 12:01:00", "fetch", "ok", "US", "vP", "tiktok"),
        # the gap: after the previous end, before the current start
        ("2026-09-16 12:00:00", "fetch", "ok", "US", "vG", "reddit"),
        # current window
        ("2026-09-20 10:00:00", "visit", None, "BD", "v1", "twitter", "search", "new"),
        ("2026-09-20 10:01:00", "fetch", "ok", "BD", "v1", "twitter"),
        ("2026-09-20 10:02:00", "download", "1080p", "BD", "v1", "twitter"),
        ("2026-09-20 11:00:00", "visit", None, "US", "v2", "tiktok", "direct", "returning"),
        ("2026-09-20 11:01:00", "fetch", "no_video", "US", "v2", "tiktok"),
        ("2026-09-21 09:00:00", "fetch", "ok", "BD", "v1", "twitter"),
        ("2026-09-22 05:00:00", "fetch", "upstream_error", None, "v3", "reddit"),
        ("2026-09-22 05:01:00", "fetch", "ok", None, "v3", "reddit"),
        ("2026-09-22 05:02:00", "download", "hd", None, "v3", "reddit"),
        ("2026-09-23 07:00:00", "visit", None, "ES", "v4", "instagram", "social", "new"),
        ("2026-09-23 07:29:59", "download", "720p", "ES", "v5", "reddit"),
        # exactly `now`: outside the half-open window
        ("2026-09-23 07:30:00", "fetch", "ok", "ES", "vX", "facebook"),
    ])


def test_totals_every_key_for_the_current_window():
    out = compute_report(_seed_week(), "7d", 0, NOW)
    assert set(out["totals"]) == TOTAL_KEYS
    assert out["totals"] == {
        # visitor-days: (09-20 v1) (09-20 v2) (09-21 v1) (09-22 v3) (09-23 v4) (09-23 v5)
        "visitors": 6,
        "page_views": 3,
        "fetches": 5,
        "ok_fetches": 3,
        "failed_fetches": 2,
        "upstream_errors": 1,
        "downloads": 3,
        # ok fetch AND download on the same visitor-day: (09-20 v1), (09-22 v3);
        # v5 downloaded without an ok fetch and does not count
        "downloaded_visitors": 2,
        "new_visitors": 2,
        "returning_visitors": 1,
        "complete_days": 6,
        # visitor-days before local 09-23 00:00
        "complete_day_visitors": 4,
    }


def test_totals_for_the_previous_window_use_its_own_cuts():
    out = compute_report(_seed_week(), "7d", 0, NOW)
    assert out["has_previous"] is True
    assert set(out["previous"]) == TOTAL_KEYS
    assert out["previous"] == {
        "visitors": 2,
        "page_views": 2,
        "fetches": 1,
        "ok_fetches": 1,
        "failed_fetches": 0,
        "upstream_errors": 0,
        "downloads": 0,
        "downloaded_visitors": 0,
        "new_visitors": 1,
        "returning_visitors": 1,
        "complete_days": 6,
        # both previous visitor-days fall before local 09-16 00:00
        "complete_day_visitors": 2,
    }


def test_visitors_are_visitor_days_not_distinct_hashes():
    # The same hash on two local days is two visitor-days (hashes rotate daily
    # in production, so this is the only consistent reading).
    s = seeded([
        ("2026-09-20 10:00:00", "visit", None, "BD", "v1", "twitter", "direct", "new"),
        ("2026-09-21 10:00:00", "visit", None, "BD", "v1", "twitter", "direct", "returning"),
        ("2026-09-21 10:05:00", "fetch", "ok", "BD", "v1", "twitter"),
    ])
    out = compute_report(s, "7d", 0, NOW)
    assert out["totals"]["visitors"] == 2
    assert out["totals"]["new_visitors"] == 1
    assert out["totals"]["returning_visitors"] == 0


def test_downloaded_visitors_needs_an_ok_fetch_and_a_download_on_one_visitor_day():
    s = seeded([
        # a: ok fetch and download the same day -> counts
        ("2026-09-20 10:00:00", "fetch", "ok", None, "a", "twitter"),
        ("2026-09-20 10:01:00", "download", "1080p", None, "a", "twitter"),
        # b: ok fetch one day, download the next -> neither day counts
        ("2026-09-20 11:00:00", "fetch", "ok", None, "b", "twitter"),
        ("2026-09-21 11:00:00", "download", "1080p", None, "b", "twitter"),
        # c: failed fetch then a download -> no
        ("2026-09-21 12:00:00", "fetch", "no_video", None, "c", "tiktok"),
        ("2026-09-21 12:01:00", "download", "hd", None, "c", "tiktok"),
        # d fetched ok, e downloaded: different people -> no
        ("2026-09-22 09:00:00", "fetch", "ok", None, "d", "reddit"),
        ("2026-09-22 09:01:00", "download", "720p", None, "e", "reddit"),
    ])
    out = compute_report(s, "7d", 0, NOW)
    assert out["totals"]["downloaded_visitors"] == 1
    assert out["totals"]["downloads"] == 4


def test_new_vs_returning_split_counts_people_not_events():
    # visitors count DISTINCT people, not page-load events, and the two
    # buckets are non-overlapping: a brand-new visitor who browses multiple
    # pages fires one 'new' and one-or-more 'returning' events on the SAME
    # daily hash, yet must count as new only.
    s = seeded([
        ("2026-09-20 10:00:00", "visit", None, "BD", "vA", None, None, "new"),
        ("2026-09-20 10:01:00", "visit", None, "BD", "vA", None, None, "returning"),
        ("2026-09-20 10:02:00", "visit", None, "US", "vB", None, None, "returning"),
        ("2026-09-20 10:03:00", "visit", None, "US", "vB", None, None, "returning"),
        ("2026-09-20 10:04:00", "visit", None, "US", "vC", None, None, "new"),
        # non-visit rows carry no visitor_kind and must be ignored
        ("2026-09-20 10:05:00", "fetch", "ok", "US", "vA", None, None, None),
    ])
    out = compute_report(s, "7d", 0, NOW)
    assert out["totals"]["new_visitors"] == 2
    assert out["totals"]["returning_visitors"] == 1
    assert out["totals"]["page_views"] == 5


def test_today_has_no_complete_days():
    out = compute_report(_seed_week(), "today", 0, NOW)
    assert out["totals"]["complete_days"] == 0
    assert out["totals"]["complete_day_visitors"] == 0
    # today at tz 0 is [09-23 00:00, 07:30): v4 and v5 only
    assert out["totals"]["visitors"] == 2
    assert out["totals"]["downloads"] == 1


# ---- series ---------------------------------------------------------------------

def test_daily_series_keys_values_and_zero_fill():
    out = compute_report(_seed_week(), "7d", 0, NOW)
    rows = out["series"]
    assert [r["key"] for r in rows] == [
        "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22",
        "2026-09-23",
    ]
    assert [r["prev_key"] for r in rows] == [
        "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14", "2026-09-15",
        "2026-09-16",
    ]
    by_key = {r["key"]: r for r in rows}
    assert by_key["2026-09-17"]["cur"] == zeros()
    assert by_key["2026-09-20"]["cur"] == {"visitors": 2, "fetches": 2, "downloads": 1,
                                           "failed_fetches": 1}
    assert by_key["2026-09-21"]["cur"] == {"visitors": 1, "fetches": 1, "downloads": 0,
                                           "failed_fetches": 0}
    assert by_key["2026-09-22"]["cur"] == {"visitors": 1, "fetches": 2, "downloads": 1,
                                           "failed_fetches": 1}
    assert by_key["2026-09-23"]["cur"] == {"visitors": 2, "fetches": 0, "downloads": 1,
                                           "failed_fetches": 0}
    # previous series: vOld on 09-10, vP on 09-15, and the gap event on 09-16
    # sits after that day's 07:30 cut so the last previous bucket stays empty
    assert by_key["2026-09-17"]["prev"] == {"visitors": 1, "fetches": 0, "downloads": 0,
                                            "failed_fetches": 0}
    assert by_key["2026-09-22"]["prev"] == {"visitors": 1, "fetches": 1, "downloads": 0,
                                            "failed_fetches": 0}
    assert by_key["2026-09-23"]["prev"] == zeros()
    assert by_key["2026-09-18"]["prev"] == zeros()


def test_daily_series_buckets_by_local_day_at_tz_360():
    # current window at +360 is UTC [09-16 18:00, 09-23 07:30)
    s = seeded([
        # local 09-16 23:59:59: in the gap (previous ended at 09-16 07:30 UTC)
        ("2026-09-16 17:59:59", "fetch", "ok", None, "gap", "twitter"),
        # local 09-17 00:00:00: first second of the window
        ("2026-09-16 18:00:00", "visit", None, None, "first", "twitter", "direct", "new"),
        # local 09-23 02:00: today
        ("2026-09-22 20:00:00", "fetch", "ok", None, "late", "reddit"),
    ])
    out = compute_report(s, "7d", 360, NOW)
    assert out["has_previous"] is False
    by_key = {r["key"]: r for r in out["series"]}
    assert list(by_key) == ["2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20",
                            "2026-09-21", "2026-09-22", "2026-09-23"]
    assert by_key["2026-09-17"]["cur"] == {"visitors": 1, "fetches": 0, "downloads": 0,
                                           "failed_fetches": 0}
    assert by_key["2026-09-23"]["cur"] == {"visitors": 1, "fetches": 1, "downloads": 0,
                                           "failed_fetches": 0}
    assert all(r["prev"] is None for r in out["series"])
    assert out["totals"]["fetches"] == 1


def test_hourly_series_today_at_minus_300_with_nulls_after_the_current_hour():
    # local now is 02:30 (hour 2); current [09-23 05:00, 07:30) UTC, previous
    # [09-22 05:00, 07:30) UTC.
    s = seeded([
        ("2026-09-22 05:00:00", "fetch", "ok", None, "v8", "twitter"),
        ("2026-09-22 06:00:00", "visit", None, None, "v7", "twitter", "direct", "new"),
        # local 09-22 23:59:59: neither window
        ("2026-09-23 04:59:59", "fetch", "ok", None, "v9", "twitter"),
        ("2026-09-23 05:00:00", "visit", None, None, "v1", "twitter", "direct", "new"),
        ("2026-09-23 06:10:00", "fetch", "ok", None, "v1", "twitter"),
        ("2026-09-23 07:29:59", "fetch", "ok", None, "v2", "tiktok"),
    ])
    out = compute_report(s, "today", -300, NOW)
    assert out["bucket"] == "hour"
    assert out["has_previous"] is True
    assert out["window"] == {"start": "2026-09-23", "end": "2026-09-23"}
    rows = out["series"]
    assert len(rows) == 24
    assert [r["key"] for r in rows] == list(range(24))
    assert [r["prev_key"] for r in rows] == list(range(24))
    assert rows[0]["cur"] == {"visitors": 1, "fetches": 0, "downloads": 0, "failed_fetches": 0}
    assert rows[0]["prev"] == {"visitors": 1, "fetches": 1, "downloads": 0, "failed_fetches": 0}
    assert rows[1]["cur"] == {"visitors": 1, "fetches": 1, "downloads": 0, "failed_fetches": 0}
    assert rows[1]["prev"] == {"visitors": 1, "fetches": 0, "downloads": 0, "failed_fetches": 0}
    assert rows[2]["cur"] == {"visitors": 1, "fetches": 1, "downloads": 0, "failed_fetches": 0}
    assert rows[2]["prev"] == zeros()
    for row in rows[3:]:
        assert row["cur"] is None and row["prev"] is None
    # v1 is active in hours 0 and 1 (counted in both buckets) but is one
    # visitor-day in the totals
    assert out["totals"]["visitors"] == 2
    assert out["totals"]["fetches"] == 2
    assert out["previous"]["visitors"] == 2
    assert out["previous"]["fetches"] == 1


def test_hourly_series_today_at_plus_360_cuts_after_hour_13():
    out = compute_report(seeded([]), "today", 360, NOW)
    rows = out["series"]
    assert [r["cur"] for r in rows[:14]] == [zeros()] * 14
    assert all(r["cur"] is None for r in rows[14:])
    # no previous period: prev is null in every bucket, not only after now
    assert all(r["prev"] is None for r in rows)


def test_visitor_days_follow_the_local_day_not_the_utc_day():
    # tz +360 puts local midnight at 18:00 UTC. One hash seen at 17:00 and 19:00
    # UTC is one UTC day but two local days (09-20 23:00 and 09-21 01:00), so it
    # is two visitor-days, and an ok fetch and a download on different local
    # days never make a downloaded visitor-day.
    s = seeded([
        ("2026-09-20 17:00:00", "fetch", "ok", None, "x", "twitter"),
        ("2026-09-20 19:00:00", "download", "1080p", None, "x", "twitter"),
    ])
    out = compute_report(s, "7d", 360, NOW)
    assert out["totals"]["visitors"] == 2
    assert out["totals"]["complete_day_visitors"] == 2
    assert out["totals"]["downloaded_visitors"] == 0
    assert out["totals"]["visitors"] == sum(r["cur"]["visitors"] for r in out["series"])


def test_a_fetch_with_no_outcome_is_not_a_failure():
    # spec B3: failed_fetches excludes NULL outcomes. resolve.py always records
    # an outcome today; this pins the rule for any future caller.
    s = seeded([
        ("2026-09-20 10:00:00", "fetch", None, None, "v", "twitter"),
        ("2026-09-20 10:01:00", "fetch", "no_video", None, "v", "twitter"),
    ])
    out = compute_report(s, "7d", 0, NOW)
    assert out["totals"]["fetches"] == 2
    assert out["totals"]["failed_fetches"] == 1
    assert out["series"][3]["key"] == "2026-09-20"
    assert out["series"][3]["cur"]["failed_fetches"] == 1


# ---- Task 3: panels, live, resolvers ------------------------------------------

REPORT_KEYS = {
    "range", "tz", "bucket", "has_previous", "window", "totals", "previous", "series", "peak",
    "funnel", "outcomes", "platforms", "qualities", "countries", "pages", "hours", "sources",
    "live",
}


def test_report_carries_every_key_of_spec_b4():
    out = compute_report(_seed_week(), "7d", 0, NOW)
    assert set(out) == REPORT_KEYS
    assert set(out["live"]) == {"active_now", "fetches_last_hour", "upstream_last_hour"}
    assert set(out["funnel"]) == {"visitors", "fetched", "got_result", "downloaded"}


def test_funnel_is_nested_on_a_visitor_day_basis():
    out = compute_report(_seed_week(), "7d", 0, NOW)
    # visitor-days: 6; with a fetch: (09-20 v1) (09-20 v2) (09-21 v1) (09-22 v3);
    # with an ok fetch: (09-20 v1) (09-21 v1) (09-22 v3); downloaded: (09-20 v1) (09-22 v3)
    assert out["funnel"] == {"visitors": 6, "fetched": 4, "got_result": 3, "downloaded": 2}
    assert out["funnel"]["downloaded"] == out["totals"]["downloaded_visitors"]
    f = out["funnel"]
    assert f["visitors"] >= f["fetched"] >= f["got_result"] >= f["downloaded"]


def test_funnel_empty_window_is_all_zero():
    out = compute_report(seeded([]), "today", 0, NOW)
    assert out["funnel"] == {"visitors": 0, "fetched": 0, "got_result": 0, "downloaded": 0}


def test_outcomes_include_ok_ordered_by_count_then_name():
    out = compute_report(_seed_week(), "7d", 0, NOW)
    assert out["outcomes"] == [
        {"outcome": "ok", "count": 3},
        {"outcome": "no_video", "count": 1},
        {"outcome": "upstream_error", "count": 1},
    ]


def test_platforms_breakdown_and_ordering():
    out = compute_report(_seed_week(), "7d", 0, NOW)
    # reddit and twitter tie on fetches, so the name breaks the tie; instagram
    # only has a visit in the window and does not appear
    assert out["platforms"] == [
        {"platform": "reddit", "fetches": 2, "ok": 1, "downloads": 2},
        {"platform": "twitter", "fetches": 2, "ok": 2, "downloads": 1},
        {"platform": "tiktok", "fetches": 1, "ok": 0, "downloads": 0},
    ]


def test_platforms_ordered_by_fetches_desc():
    s = seeded([
        ("2026-09-20 10:00:00", "fetch", "ok", None, "v1", "twitter"),
        ("2026-09-20 10:01:00", "fetch", "ok", None, "v2", "tiktok"),
        ("2026-09-20 10:02:00", "fetch", "ok", None, "v3", "tiktok"),
        ("2026-09-20 10:03:00", "fetch", "ok", None, "v4", "tiktok"),
        ("2026-09-20 10:04:00", "fetch", "ok", None, "v5", "instagram"),
        ("2026-09-20 10:05:00", "fetch", "ok", None, "v6", "instagram"),
    ])
    out = compute_report(s, "7d", 0, NOW)
    assert [p["platform"] for p in out["platforms"]] == ["tiktok", "instagram", "twitter"]


def test_qualities_bucketed_and_reaggregated():
    s = seeded([
        # three distinct raw heights that all snap to 1080p -> must SUM to 3
        ("2026-09-20 03:00:00", "download", "1124p", "BD", "v1"),
        ("2026-09-20 03:01:00", "download", "1054p", "BD", "v2"),
        ("2026-09-20 03:02:00", "download", "1080p", "BD", "v3"),
        # two that snap to 720p
        ("2026-09-20 03:03:00", "download", "680p", "BD", "v4"),
        ("2026-09-20 03:04:00", "download", "720p", "BD", "v5"),
        # a named tiktok label, untouched
        ("2026-09-20 03:05:00", "download", "hd", "BD", "v6"),
        # a download whose quality was never sent -> NULL outcome, excluded
        ("2026-09-20 03:06:00", "download", None, "BD", "v7"),
    ])
    out = compute_report(s, "7d", 0, NOW)
    assert out["qualities"] == [
        {"quality": "1080p", "count": 3}, {"quality": "720p", "count": 2}, {"quality": "hd", "count": 1},
    ]


def test_countries_top_10_by_visitor_days_then_unknown_row():
    codes = ["BD", "US", "ES", "IN", "DE", "FR", "GB", "BR", "MX", "ID", "PK"]
    rows = []
    for rank, code in enumerate(codes):
        # 11 visitor-days for BD down to 1 for PK, each a different visitor on 09-20
        for i in range(11 - rank):
            rows.append(("2026-09-20 10:00:00", "visit", None, code, f"{code}-{i}", "twitter"))
    # one person seen on three days with no country: three visitor-days
    for day in ("2026-09-20", "2026-09-21", "2026-09-22"):
        rows.append((f"{day} 10:00:00", "visit", None, None, "anon", "twitter"))
        rows.append((f"{day} 10:01:00", "fetch", "ok", None, "anon", "twitter"))
    out = compute_report(seeded(rows), "7d", 0, NOW)
    assert [c["country"] for c in out["countries"]] == codes[:10] + ["unknown"]
    assert out["countries"][0] == {"country": "BD", "visitors": 11}
    assert out["countries"][-1] == {"country": "unknown", "visitors": 3}


def test_countries_unknown_row_present_at_zero_and_ties_break_by_code():
    s = seeded([
        ("2026-09-20 10:00:00", "visit", None, "US", "a", "twitter"),
        ("2026-09-20 10:01:00", "visit", None, "BD", "b", "twitter"),
        # the same BD visitor twice on one day is one visitor-day
        ("2026-09-20 10:02:00", "fetch", "ok", "BD", "b", "twitter"),
    ])
    out = compute_report(s, "7d", 0, NOW)
    assert out["countries"] == [
        {"country": "BD", "visitors": 1}, {"country": "US", "visitors": 1},
        {"country": "unknown", "visitors": 0},
    ]


def test_countries_add_up_like_the_visitors_total():
    out = compute_report(_seed_week(), "7d", 0, NOW)
    assert sum(c["visitors"] for c in out["countries"]) == out["totals"]["visitors"]


def test_pages_group_by_platform_and_locale_with_null_as_unknown():
    s = seeded([
        ("2026-09-20 10:00:00", "visit", None, None, "a", "twitter", "direct", "new", "en"),
        ("2026-09-20 10:01:00", "visit", None, None, "b", "twitter", "direct", "new", "en"),
        ("2026-09-20 10:02:00", "visit", None, None, "c", "twitter", "direct", "new", None),
        ("2026-09-20 10:03:00", "visit", None, None, "d", "instagram", "direct", "new", "hi"),
        ("2026-09-20 10:04:00", "visit", None, None, "e", "tiktok", "direct", "new", "es"),
        ("2026-09-20 10:05:00", "visit", None, None, "f", "tiktok", "direct", "new", None),
        # not a visit
        ("2026-09-20 10:06:00", "fetch", "ok", None, "f", "tiktok", None, None, "es"),
        # a visit without a platform cannot be labelled and is left out
        ("2026-09-20 10:07:00", "visit", None, None, "g", None, "direct", "new", "en"),
    ])
    out = compute_report(s, "7d", 0, NOW)
    assert out["pages"] == [
        {"platform": "twitter", "locale": "en", "views": 2},
        {"platform": "instagram", "locale": "hi", "views": 1},
        {"platform": "tiktok", "locale": "es", "views": 1},
        {"platform": "tiktok", "locale": "unknown", "views": 1},
        {"platform": "twitter", "locale": "unknown", "views": 1},
    ]


def test_pages_keep_the_top_12():
    rows = []
    combos = [(p, loc) for p in ("twitter", "tiktok", "reddit", "instagram")
              for loc in ("en", "es", "hi", None)][:13]
    for views, (platform, locale) in enumerate(combos, start=1):
        for i in range(views):
            rows.append(("2026-09-20 10:00:00", "visit", None, None, f"{platform}-{locale}-{i}",
                         platform, "direct", "new", locale))
    out = compute_report(seeded(rows), "7d", 0, NOW)
    assert len(out["pages"]) == 12
    assert out["pages"][0]["views"] == 13
    assert out["pages"][-1]["views"] == 2


def test_hours_are_24_zero_filled_local_fetch_counts():
    s = seeded([
        # 20:30 and 20:31 UTC are 02:30 and 02:31 local at +360
        ("2026-09-22 20:30:00", "fetch", "ok", None, "a", "twitter"),
        ("2026-09-22 20:31:00", "fetch", "no_video", None, "b", "twitter"),
        ("2026-09-22 21:00:00", "fetch", "ok", None, "c", "reddit"),
        # a visit is not a fetch
        ("2026-09-22 20:32:00", "visit", None, None, "d", "twitter"),
    ])
    out = compute_report(s, "7d", 360, NOW)
    assert len(out["hours"]) == 24
    assert [h["hour"] for h in out["hours"]] == list(range(24))
    assert out["hours"][2] == {"hour": 2, "fetches": 2}
    assert out["hours"][3] == {"hour": 3, "fetches": 1}
    assert sum(h["fetches"] for h in out["hours"]) == 3


def test_sources_grouped_and_ordered():
    s = seeded([
        ("2026-09-20 10:00:00", "visit", None, "BD", "v1", None, "search", None),
        ("2026-09-20 10:01:00", "visit", None, "BD", "v2", None, "search", None),
        ("2026-09-20 10:02:00", "visit", None, "US", "v3", None, "direct", None),
        ("2026-09-20 10:03:00", "visit", None, "US", "v5", None, "social", None),
        # non-visit with a source must not be counted
        ("2026-09-20 10:04:00", "fetch", "ok", "US", "v3", None, "search", None),
        # visit with NULL source must not be counted
        ("2026-09-20 10:05:00", "visit", None, "US", "v4", None, None, None),
    ])
    out = compute_report(s, "7d", 0, NOW)
    assert out["sources"] == [
        {"source": "search", "visits": 2}, {"source": "direct", "visits": 1},
        {"source": "social", "visits": 1},
    ]


def test_peak_two_visitors_in_one_tumbling_bucket_rendered_in_local_time():
    # 10:01 and 10:03 both floor to the 10:00 bucket; the record carries the
    # bucket START, shifted to the owner's tz for display.
    s = seeded([
        ("2026-09-20 10:01:00", "visit", None, "BD", "v1"),
        ("2026-09-20 10:03:00", "visit", None, "US", "v2"),
    ])
    assert compute_report(s, "7d", 0, NOW)["peak"] == {
        "count": 2, "day": "2026-09-20", "time": "10:00",
    }
    assert compute_report(s, "7d", 360, NOW)["peak"] == {
        "count": 2, "day": "2026-09-20", "time": "16:00",
    }
    assert compute_report(s, "7d", -300, NOW)["peak"] == {
        "count": 2, "day": "2026-09-20", "time": "05:00",
    }


def test_peak_is_tumbling_not_sliding_and_counts_a_person_once():
    straddle = seeded([
        ("2026-09-20 10:04:00", "visit", None, "BD", "v1"),
        ("2026-09-20 10:06:00", "visit", None, "US", "v2"),
    ])
    assert compute_report(straddle, "7d", 0, NOW)["peak"]["count"] == 1
    repeat = seeded([
        ("2026-09-20 10:01:00", "visit", None, "BD", "v1"),
        ("2026-09-20 10:02:00", "fetch", "ok", "BD", "v1"),
    ])
    assert compute_report(repeat, "7d", 0, NOW)["peak"]["count"] == 1


def test_peak_only_looks_inside_the_current_window_and_ties_go_earliest():
    s = seeded([
        # three people in one bucket, but in the previous window
        ("2026-09-15 10:00:00", "visit", None, None, "p1"),
        ("2026-09-15 10:01:00", "visit", None, None, "p2"),
        ("2026-09-15 10:02:00", "visit", None, None, "p3"),
        # two buckets of two inside the window: the earliest wins the tie
        ("2026-09-18 10:00:00", "visit", None, None, "a1"),
        ("2026-09-18 10:01:00", "visit", None, None, "a2"),
        ("2026-09-20 10:00:00", "visit", None, None, "b1"),
        ("2026-09-20 10:01:00", "visit", None, None, "b2"),
    ])
    assert compute_report(s, "7d", 0, NOW)["peak"] == {
        "count": 2, "day": "2026-09-18", "time": "10:00",
    }


def test_peak_is_null_for_an_empty_window():
    assert compute_report(seeded([]), "7d", 0, NOW)["peak"] is None
    # events exist but none inside today's window
    old = seeded([("2026-09-20 10:00:00", "visit", None, None, "v")])
    assert compute_report(old, "today", 0, NOW)["peak"] is None


def test_live_block_is_range_independent_and_uses_the_last_minutes():
    s = seeded([
        (at(minutes=-4), "visit", None, None, "a", "twitter"),
        (at(minutes=-6), "fetch", "ok", None, "b", "twitter"),
        (at(minutes=-59), "fetch", "upstream_error", None, "c", "reddit"),
        (at(minutes=-61), "fetch", "upstream_error", None, "d", "reddit"),
        # stamped in this very second: still live
        (at(), "fetch", "ok", None, "e", "tiktok"),
    ])
    expected = {"active_now": 2, "fetches_last_hour": 3, "upstream_last_hour": 1}
    for range_key in RANGES:
        assert compute_report(s, range_key, 0, NOW)["live"] == expected
    assert compute_report(s, "7d", 360, NOW)["live"] == expected


def test_live_block_zero_on_empty_store():
    assert compute_report(seeded([]), "today", 0, NOW)["live"] == {
        "active_now": 0, "fetches_last_hour": 0, "upstream_last_hour": 0,
    }


def test_resolvers_five_fixed_rows_over_the_rolling_24_hours():
    s = seeded([
        (at(minutes=-30), "fetch", "ok", None, "t1", "twitter"),
        (at(minutes=-20), "fetch", "ok", None, "t2", "twitter"),
        (at(minutes=-12, seconds=-30), "fetch", "not_found", None, "t3", "twitter"),
        (at(hours=-3), "fetch", "upstream_error", None, "r1", "reddit"),
        (at(hours=-2), "fetch", "upstream_error", None, "r2", "reddit"),
        (at(minutes=-90), "fetch", "not_found", None, "r3", "reddit"),
        (at(minutes=-61), "fetch", "not_found", None, "r4", "reddit"),
        # exactly 24 hours ago: the first second of the window
        (at(hours=-24), "fetch", "ok", None, "i1", "instagram"),
        # one second older: outside
        (at(hours=-24, seconds=-1), "fetch", "ok", None, "f1", "facebook"),
        # a fetch without a platform cannot be attributed
        (at(minutes=-5), "fetch", "not_found", None, "n1", None),
        # downloads are not lookups
        (at(minutes=-5), "download", "hd", None, "t1", "twitter"),
    ])
    out = compute_resolvers(s, 0, NOW)
    assert [r["platform"] for r in out["platforms"]] == [
        "twitter", "tiktok", "reddit", "instagram", "facebook",
    ]
    by = {r["platform"]: r for r in out["platforms"]}
    assert by["twitter"] == {"platform": "twitter", "fetches": 3, "ok": 2,
                             "top_failure": {"outcome": "not_found", "count": 1},
                             "last_failure_min_ago": 12}
    assert by["tiktok"] == {"platform": "tiktok", "fetches": 0, "ok": 0, "top_failure": None,
                            "last_failure_min_ago": None}
    # reddit: not_found and upstream_error tie at 2, the name breaks the tie;
    # the newest failure is r4, 61 minutes ago
    assert by["reddit"] == {"platform": "reddit", "fetches": 4, "ok": 0,
                            "top_failure": {"outcome": "not_found", "count": 2},
                            "last_failure_min_ago": 61}
    assert by["instagram"] == {"platform": "instagram", "fetches": 1, "ok": 1,
                               "top_failure": None, "last_failure_min_ago": None}
    assert by["facebook"]["fetches"] == 0
    # tz does not change the numbers
    assert compute_resolvers(s, 360, NOW) == out


def test_resolvers_last_failure_floors_to_whole_minutes():
    s = seeded([(at(seconds=-59), "fetch", "not_found", None, "t", "twitter")])
    row = compute_resolvers(s, 0, NOW)["platforms"][0]
    assert row["last_failure_min_ago"] == 0
    s = seeded([(at(minutes=-60, seconds=-1), "fetch", "not_found", None, "t", "twitter")])
    row = compute_resolvers(s, 0, NOW)["platforms"][0]
    assert row["last_failure_min_ago"] == 60


def test_resolvers_require_an_aware_now():
    # the same guard as the report: a naive now would be read as the server's
    # local time and shift the rolling 24 hours
    naive = NOW.replace(tzinfo=None)
    with pytest.raises(ValueError, match="now must be timezone-aware"):
        compute_report(seeded([]), "7d", 0, naive)
    with pytest.raises(ValueError, match="now must be timezone-aware"):
        compute_resolvers(seeded([]), 0, naive)


def test_countries_count_visitor_days_by_the_local_day():
    # tz +360 puts local midnight at 18:00 UTC: a hash seen at 17:00 and 19:00
    # UTC is two local days, so two visitor-days, the same as in the Visitors
    # total (spec B3: date(<local ts>)).
    s = seeded([
        ("2026-09-20 17:00:00", "visit", None, "BD", "x", "twitter"),
        ("2026-09-20 19:00:00", "fetch", "ok", "BD", "x", "twitter"),
        ("2026-09-20 17:30:00", "visit", None, None, "y", "twitter"),
        ("2026-09-20 18:30:00", "fetch", "ok", None, "y", "twitter"),
    ])
    out = compute_report(s, "7d", 360, NOW)
    assert out["countries"] == [
        {"country": "BD", "visitors": 2}, {"country": "unknown", "visitors": 2},
    ]
    assert sum(c["visitors"] for c in out["countries"]) == out["totals"]["visitors"]


def test_live_upstream_counts_only_resolver_errors():
    s = seeded([
        (at(minutes=-10), "fetch", "upstream_error", None, "a", "reddit"),
        (at(minutes=-10), "fetch", "not_found", None, "b", "twitter"),
        (at(minutes=-10), "fetch", "no_video", None, "c", "tiktok"),
    ])
    assert compute_report(s, "today", 0, NOW)["live"] == {
        "active_now": 0, "fetches_last_hour": 3, "upstream_last_hour": 1,
    }


def test_pages_sources_and_hours_count_events_not_people():
    # one person loading the same page twice and pasting two links in one hour
    s = seeded([
        ("2026-09-20 10:00:00", "visit", None, None, "v", "twitter", "search", "new", "en"),
        ("2026-09-20 10:05:00", "visit", None, None, "v", "twitter", "search", "returning", "en"),
        ("2026-09-20 10:10:00", "fetch", "ok", None, "v", "twitter"),
        ("2026-09-20 10:20:00", "fetch", "no_video", None, "v", "twitter"),
    ])
    out = compute_report(s, "7d", 0, NOW)
    assert out["pages"] == [{"platform": "twitter", "locale": "en", "views": 2}]
    assert out["sources"] == [{"source": "search", "visits": 2}]
    assert out["hours"][10] == {"hour": 10, "fetches": 2}


def test_a_fetch_with_no_outcome_is_no_outcome_row_and_no_resolver_failure():
    s = seeded([
        (at(minutes=-10), "fetch", None, None, "a", "twitter"),
        (at(minutes=-9), "fetch", "ok", None, "b", "twitter"),
    ])
    assert compute_report(s, "today", 0, NOW)["outcomes"] == [{"outcome": "ok", "count": 1}]
    assert compute_resolvers(s, 0, NOW)["platforms"][0] == {
        "platform": "twitter", "fetches": 2, "ok": 1, "top_failure": None,
        "last_failure_min_ago": None,
    }
