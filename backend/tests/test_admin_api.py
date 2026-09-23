"""The admin report, resolvers and logout endpoints (spec B4, B5, B6)."""
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app import maintenance
from app.analytics import service as service_mod
from app.analytics.config import AnalyticsConfig
from app.analytics.recorder import Recorder
from app.analytics.store import SqliteStore
from app.main import create_app

REPORT_KEYS = {
    "range", "tz", "bucket", "has_previous", "window", "totals", "previous", "series", "peak",
    "funnel", "outcomes", "platforms", "qualities", "countries", "pages", "hours", "sources",
    "live",
}
TOTAL_KEYS = {
    "visitors", "page_views", "fetches", "ok_fetches", "failed_fetches", "upstream_errors",
    "downloads", "downloaded_visitors", "new_visitors", "returning_visitors", "complete_days",
    "complete_day_visitors",
}


@pytest.fixture()
def enabled_client(monkeypatch):
    store = SqliteStore(":memory:")
    rec = Recorder(store, batch_interval=0.05)
    cfg = AnalyticsConfig("libsql://x", "t", "pw-long", "salt")
    svc = service_mod.AnalyticsService()
    svc.init(cfg, store, rec)
    monkeypatch.setattr(service_mod, "service", svc)
    monkeypatch.setattr("app.analytics.router.service", svc)
    monkeypatch.setattr("app.resolve.analytics", svc, raising=False)
    # https base_url: the admin cookie is Secure, so httpx only sends it back
    # over an https-scheme origin (matches real deployment; plain http would
    # silently drop the cookie and every post-login call would 401).
    client = TestClient(create_app(), base_url="https://testserver", raise_server_exceptions=False)
    return client, svc, store


def _login(client) -> None:
    assert client.post("/api/admin/login", json={"password": "pw-long"}).status_code == 204


def _minutes_ago(minutes: int) -> str:
    return (datetime.now(UTC) - timedelta(minutes=minutes)).strftime("%Y-%m-%d %H:%M:%S")


def _insert(store, rows) -> None:
    store.execute_many([
        ("INSERT INTO events (ts, type, outcome, country, visitor, platform) VALUES (?,?,?,?,?,?)",
         list(r))
        for r in rows
    ])


# ---- report ----------------------------------------------------------------------

def test_report_requires_a_cookie(enabled_client):
    client, *_ = enabled_client
    r = client.get("/api/admin/report?range=7d&tz=360")
    assert r.status_code == 401
    assert r.json() == {"error": "unauthorized"}


def test_a_non_ascii_cookie_is_a_401_not_a_500(enabled_client):
    client, *_ = enabled_client
    # httpx encodes str header values as ASCII, so the non-ASCII cookie goes
    # in as raw UTF-8 bytes, the way a browser would send it.
    headers = {"cookie": "svid_admin=1.\u00e9".encode()}
    for path in ("/api/admin/report?tz=0", "/api/admin/resolvers?tz=0"):
        r = client.get(path, headers=headers)
        assert r.status_code == 401, path
        assert r.json() == {"error": "unauthorized"}


def test_report_default_range_shape_and_tz_echo(enabled_client):
    client, *_ = enabled_client
    _login(client)
    r = client.get("/api/admin/report?tz=360")
    assert r.status_code == 200
    body = r.json()
    assert set(body) == REPORT_KEYS
    assert body["range"] == "7d"
    assert body["tz"] == 360
    assert body["bucket"] == "day"
    assert set(body["totals"]) == TOTAL_KEYS
    assert len(body["series"]) == 7
    assert len(body["hours"]) == 24
    assert body["countries"][-1]["country"] == "unknown"
    assert body["has_previous"] is False and body["previous"] is None


def test_report_every_range_is_accepted(enabled_client):
    client, *_ = enabled_client
    _login(client)
    for key, length, bucket in (("today", 24, "hour"), ("7d", 7, "day"), ("30d", 30, "day"),
                                ("90d", 90, "day")):
        body = client.get(f"/api/admin/report?range={key}&tz=0").json()
        assert body["range"] == key
        assert body["bucket"] == bucket
        assert len(body["series"]) == length
    today = client.get("/api/admin/report?range=today&tz=-300").json()
    assert today["window"]["start"] == today["window"]["end"]
    # an empty range value means the default too
    assert client.get("/api/admin/report?range=&tz=0").json()["range"] == "7d"


def test_report_rejects_a_bad_range(enabled_client):
    client, *_ = enabled_client
    _login(client)
    for bad in ("week", "1d", "TODAY", "365d"):
        r = client.get(f"/api/admin/report?range={bad}&tz=0")
        assert r.status_code == 422, bad
        assert r.json() == {"error": "bad_range"}


def test_report_rejects_a_bad_or_missing_tz(enabled_client):
    client, *_ = enabled_client
    _login(client)
    for query in ("range=7d&tz=abc", "range=7d&tz=841", "range=7d&tz=-841", "range=7d&tz=",
                  "range=7d"):
        r = client.get(f"/api/admin/report?{query}")
        assert r.status_code == 422, query
        assert r.json() == {"error": "bad_tz"}


def test_report_answers_503_when_the_store_fails(enabled_client, monkeypatch):
    client, _svc, store = enabled_client
    _login(client)

    def boom(sql, args):
        raise RuntimeError("db gone")

    monkeypatch.setattr(store, "query", boom)
    r = client.get("/api/admin/report?range=7d&tz=0")
    assert r.status_code == 503
    assert r.json() == {"error": "analytics_unavailable"}


def test_report_counts_a_recent_event_in_totals_and_live(enabled_client):
    client, _svc, store = enabled_client
    _insert(store, [
        (_minutes_ago(2), "visit", None, "BD", "v1", "twitter"),
        (_minutes_ago(2), "fetch", "upstream_error", "BD", "v1", "twitter"),
    ])
    _login(client)
    body = client.get("/api/admin/report?range=7d&tz=0").json()
    assert body["totals"]["page_views"] == 1
    assert body["totals"]["fetches"] == 1
    assert body["totals"]["upstream_errors"] == 1
    assert body["totals"]["visitors"] == 1
    assert body["live"] == {"active_now": 1, "fetches_last_hour": 1, "upstream_last_hour": 1}
    assert body["funnel"] == {"visitors": 1, "fetched": 1, "got_result": 0, "downloaded": 0}
    assert body["platforms"] == [{"platform": "twitter", "fetches": 1, "ok": 0, "downloads": 0}]
    assert body["countries"] == [{"country": "BD", "visitors": 1},
                                 {"country": "unknown", "visitors": 0}]
    assert body["peak"]["count"] == 1


def test_report_is_served_during_maintenance(enabled_client):
    client, *_ = enabled_client
    _login(client)
    try:
        maintenance.set_on(True)
        assert client.get("/api/health").status_code == 200
        assert client.get("/api/admin/report?range=today&tz=0").status_code == 200
        assert client.get("/api/admin/resolvers?tz=0").status_code == 200
    finally:
        maintenance.set_on(False)


# ---- resolvers -------------------------------------------------------------------

def test_resolvers_gate_and_five_fixed_rows(enabled_client):
    client, _svc, store = enabled_client
    assert client.get("/api/admin/resolvers?tz=0").status_code == 401
    _insert(store, [
        (_minutes_ago(2), "fetch", "not_found", None, "v1", "twitter"),
        (_minutes_ago(3), "fetch", "ok", None, "v2", "twitter"),
    ])
    _login(client)
    r = client.get("/api/admin/resolvers?tz=360")
    assert r.status_code == 200
    rows = r.json()["platforms"]
    assert [row["platform"] for row in rows] == ["twitter", "tiktok", "reddit", "instagram",
                                                 "facebook"]
    assert rows[0] == {"platform": "twitter", "fetches": 2, "ok": 1,
                       "top_failure": {"outcome": "not_found", "count": 1},
                       "last_failure_min_ago": 2}
    assert rows[1] == {"platform": "tiktok", "fetches": 0, "ok": 0, "top_failure": None,
                       "last_failure_min_ago": None}


def test_resolvers_validates_tz_and_answers_503_on_store_failure(enabled_client, monkeypatch):
    client, _svc, store = enabled_client
    _login(client)
    for query in ("tz=abc", "tz=900", ""):
        r = client.get(f"/api/admin/resolvers?{query}")
        assert r.status_code == 422, query
        assert r.json() == {"error": "bad_tz"}

    def boom(sql, args):
        raise RuntimeError("db gone")

    monkeypatch.setattr(store, "query", boom)
    r = client.get("/api/admin/resolvers?tz=0")
    assert r.status_code == 503
    assert r.json() == {"error": "analytics_unavailable"}


# ---- logout ----------------------------------------------------------------------

def test_logout_expires_the_cookie_and_signs_the_client_out(enabled_client):
    client, *_ = enabled_client
    _login(client)
    assert client.get("/api/admin/maintenance").status_code == 200

    r = client.post("/api/admin/logout")
    assert r.status_code == 204
    header = r.headers["set-cookie"]
    lowered = header.lower()
    assert header.startswith('svid_admin=""')
    assert "path=/api/admin" in lowered
    assert "max-age=0" in lowered
    assert "expires=" in lowered
    assert "httponly" in lowered
    assert "secure" in lowered
    assert "samesite=strict" in lowered

    # httpx honours the expiry: the cookie is gone and the next call is a 401
    assert client.get("/api/admin/maintenance").status_code == 401
    assert client.get("/api/admin/report?range=7d&tz=0").status_code == 401


def test_logout_without_a_cookie_is_still_204(enabled_client):
    client, *_ = enabled_client
    r = client.post("/api/admin/logout")
    assert r.status_code == 204
    assert 'svid_admin=""' in r.headers["set-cookie"]


# ---- disabled ---------------------------------------------------------------------

def test_disabled_returns_404_for_every_new_route(monkeypatch):
    svc = service_mod.AnalyticsService()  # never init()'d -> disabled
    monkeypatch.setattr(service_mod, "service", svc)
    monkeypatch.setattr("app.analytics.router.service", svc)
    client = TestClient(create_app(), base_url="https://testserver", raise_server_exceptions=False)
    assert client.get("/api/admin/report?range=7d&tz=0").status_code == 404
    assert client.get("/api/admin/resolvers?tz=0").status_code == 404
    assert client.post("/api/admin/logout").status_code == 404


def test_old_stats_endpoint_is_gone(enabled_client):
    client, *_ = enabled_client
    _login(client)
    res = client.get("/api/admin/stats?days=30&tz=0")
    assert res.status_code == 404
