from .store import Store

_MAX_TZ = 840  # +/- 14 hours


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


def _tzmod(tz: int) -> str:
    # tz is a validated int, safe to inline into the SQLite datetime modifier.
    sign = "+" if tz >= 0 else "-"
    return f"{sign}{abs(tz)} minutes"


def _local(tz: int) -> str:
    return f"datetime(ts, '{_tzmod(tz)}')"


def _count_since(store: Store, where: str, args: list) -> int:
    rows = store.query(f"SELECT COUNT(*) AS n FROM events WHERE {where}", args)
    return rows[0]["n"] if rows else 0


def _period(store: Store, type_: str, tz: int) -> dict:
    local = _local(tz)
    day = f"date({local}) = date(datetime('now','{_tzmod(tz)}'))"
    return {
        "today": _count_since(store, f"type=? AND {day}", [type_]),
        "d7": _count_since(store, "type=? AND ts >= datetime('now','-7 days')", [type_]),
        "d30": _count_since(store, "type=? AND ts >= datetime('now','-30 days')", [type_]),
        "all_time": _count_since(store, "type=?", [type_]),
    }


def compute_stats(store: Store, days: int, tz: int) -> dict:
    local = _local(tz)
    tzmod = _tzmod(tz)
    # Window boundary expressed as a LOCAL calendar-date cutoff so it lines up
    # with the local-date GROUP BY buckets below (series/hours/uniq/
    # visitor_days/fetch_visitor_days). A fixed UTC-instant cutoff would
    # truncate the oldest local day whenever tz != 0.
    window = f"date({local}) >= date(datetime('now','{tzmod}'), '-{int(days)} days')"

    fetches = _period(store, "fetch", tz)
    downloads = _period(store, "download", tz)
    visits = _period(store, "visit", tz)

    uniq_today = store.query(
        f"SELECT COUNT(DISTINCT visitor) AS n FROM events "
        f"WHERE date({local}) = date(datetime('now','{tzmod}'))",
        [],
    )[0]["n"]

    ok = _count_since(store, f"type='fetch' AND outcome='ok' AND {window}", [])
    total_fetch = _count_since(store, f"type='fetch' AND {window}", [])
    success_rate = (ok / total_fetch) if total_fetch else 0.0

    # conversion: sum of daily-distinct fetching visitors / sum of daily-distinct visitors
    visitor_days = store.query(
        f"SELECT COUNT(*) AS n FROM (SELECT DISTINCT date({local}) d, visitor "
        f"FROM events WHERE {window})", [],
    )[0]["n"]
    fetch_visitor_days = store.query(
        f"SELECT COUNT(*) AS n FROM (SELECT DISTINCT date({local}) d, visitor "
        f"FROM events WHERE type='fetch' AND {window})", [],
    )[0]["n"]
    conversion = (fetch_visitor_days / visitor_days) if visitor_days else 0.0

    active_now = store.query(
        "SELECT COUNT(DISTINCT visitor) AS n FROM events WHERE ts >= datetime('now','-5 minutes')",
        [],
    )[0]["n"]

    series_rows = store.query(
        f"SELECT date({local}) AS day, type, COUNT(*) AS n FROM events "
        f"WHERE {window} GROUP BY day, type ORDER BY day", [],
    )
    uniq_rows = store.query(
        f"SELECT date({local}) AS day, COUNT(DISTINCT visitor) AS n FROM events "
        f"WHERE {window} GROUP BY day ORDER BY day", [],
    )
    series: dict[str, dict] = {}
    for r in series_rows:
        series.setdefault(r["day"], {"day": r["day"], "fetch": 0, "download": 0, "visit": 0, "uniques": 0})
        series[r["day"]][r["type"]] = r["n"]
    for r in uniq_rows:
        series.setdefault(r["day"], {"day": r["day"], "fetch": 0, "download": 0, "visit": 0, "uniques": 0})
        series[r["day"]]["uniques"] = r["n"]

    # Top 10 known countries, plus an unknown/null bucket computed separately
    # so it's always present in the response, not just when it happens to
    # rank in the top 11 alongside the named countries.
    countries = store.query(
        f"SELECT country, COUNT(*) AS count FROM events "
        f"WHERE {window} AND country IS NOT NULL "
        f"GROUP BY country ORDER BY count DESC LIMIT 10", [],
    )
    unknown_count = _count_since(store, f"country IS NULL AND {window}", [])
    countries.append({"country": "unknown", "count": unknown_count})

    qualities = store.query(
        f"SELECT outcome AS quality, COUNT(*) AS count FROM events "
        f"WHERE type='download' AND {window} GROUP BY outcome ORDER BY count DESC", [],
    )
    errors = store.query(
        f"SELECT outcome AS code, COUNT(*) AS count FROM events "
        f"WHERE type='fetch' AND outcome != 'ok' AND {window} GROUP BY outcome ORDER BY count DESC", [],
    )
    hours = store.query(
        f"SELECT CAST(strftime('%H', {local}) AS INTEGER) AS hour, COUNT(*) AS count "
        f"FROM events WHERE {window} GROUP BY hour ORDER BY hour", [],
    )

    platform_rows = store.query(
        f"SELECT platform, "
        f"SUM(CASE WHEN type='fetch' THEN 1 ELSE 0 END) AS fetches, "
        f"SUM(CASE WHEN type='download' THEN 1 ELSE 0 END) AS downloads "
        f"FROM events WHERE {window} AND platform IS NOT NULL "
        f"GROUP BY platform ORDER BY fetches DESC", [],
    )
    platforms = [{"platform": r["platform"], "fetches": r["fetches"] or 0,
                  "downloads": r["downloads"] or 0} for r in platform_rows]

    # avg_active: mean daily unique visitors over FIXED 7- and 30-local-day
    # windows, independent of the `days` argument. Convention (pinned): sum of
    # per-day COUNT(DISTINCT visitor) over the window divided by the window
    # length (7 or 30), so days with no visits contribute 0 uniques, then round
    # to nearest int. The per-day distinct-visitor count matches the series
    # `uniques` query (DISTINCT visitor across all event types), keeping
    # avg_active consistent with series[].uniques. The lower bound is built the
    # same local-calendar-date way as `window`, just with 7/30.
    def _avg_active(window_days: int) -> int:
        bound = f"date({local}) >= date(datetime('now','{tzmod}'), '-{window_days} days')"
        rows = store.query(
            f"SELECT COUNT(DISTINCT visitor) AS n FROM events "
            f"WHERE {bound} GROUP BY date({local})", [],
        )
        return round(sum(r["n"] for r in rows) / window_days)

    avg_active = {"d7": _avg_active(7), "d30": _avg_active(30)}

    source_rows = store.query(
        f"SELECT source, COUNT(*) AS count FROM events "
        f"WHERE {window} AND type='visit' AND source IS NOT NULL "
        f"GROUP BY source ORDER BY count DESC", [],
    )
    sources = [{"source": r["source"], "count": r["count"]} for r in source_rows]

    kind_rows = store.query(
        f"SELECT visitor_kind, COUNT(*) AS count FROM events "
        f"WHERE {window} AND type='visit' GROUP BY visitor_kind", [],
    )
    kind_counts = {r["visitor_kind"]: r["count"] for r in kind_rows}
    visitors = {"new": kind_counts.get("new", 0), "returning": kind_counts.get("returning", 0)}

    return {
        "totals": {
            "fetches": fetches,
            "downloads": downloads,
            "visits": visits,
            "unique_today": uniq_today,
            "success_rate": round(success_rate, 3),
            "conversion": round(conversion, 3),
        },
        "active_now": active_now,
        "series": sorted(series.values(), key=lambda r: r["day"]),
        "countries": countries,
        "qualities": qualities,
        "errors": errors,
        "hours": hours,
        "platforms": platforms,
        "avg_active": avg_active,
        "sources": sources,
        "visitors": visitors,
    }
