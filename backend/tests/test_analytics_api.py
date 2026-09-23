import pytest
from fastapi.testclient import TestClient

from app.analytics import service as service_mod
from app.analytics.config import AnalyticsConfig
from app.analytics.recorder import Recorder
from app.analytics.store import SqliteStore
from app.limits import limiter
from app.main import create_app


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


def test_event_records_download(enabled_client):
    client, svc, store = enabled_client
    r = client.post("/api/event", json={"type": "download", "quality": "1080p"})
    assert r.status_code == 204
    svc.recorder().flush()
    rows = store.query("SELECT type, outcome FROM events", [])
    assert rows == [{"type": "download", "outcome": "1080p"}]


def test_download_event_accepts_tiktok_labels(enabled_client):
    client, svc, store = enabled_client
    for q in ("hd", "sd", "1080p", "video"):
        r = client.post("/api/event", json={"type": "download", "quality": q, "platform": "tiktok"})
        assert r.status_code == 204, q
    assert client.post("/api/event", json={"type": "download", "quality": "junk"}).status_code == 422
    svc.recorder().flush()
    rows = store.query("SELECT platform, outcome FROM events WHERE type='download'", [])
    assert any(r["platform"] == "tiktok" and r["outcome"] == "hd" for r in rows)


def test_event_accepts_slideshow_labels(enabled_client):
    client, _svc, _store = enabled_client
    for q in ("photo", "album", "sound"):
        r = client.post("/api/event", json={"type": "download", "quality": q, "platform": "tiktok"})
        assert r.status_code == 204, q
    assert client.post("/api/event", json={"type": "download", "quality": "photos"}).status_code == 422


def test_event_accepts_reddit_platform(enabled_client):
    client, *_ = enabled_client
    assert client.post(
        "/api/event", json={"type": "download", "quality": "720p", "platform": "reddit"}
    ).status_code == 204


def test_event_accepts_instagram_platform(enabled_client):
    client, *_ = enabled_client
    assert client.post(
        "/api/event", json={"type": "download", "quality": "hd", "platform": "instagram"}
    ).status_code == 204


def test_event_accepts_facebook_platform(enabled_client):
    client, *_ = enabled_client
    assert client.post(
        "/api/event", json={"type": "download", "quality": "hd", "platform": "facebook"}
    ).status_code == 204


def test_event_rejects_bad_platform(enabled_client):
    client, *_ = enabled_client
    assert client.post(
        "/api/event", json={"type": "download", "quality": "1080p", "platform": "youtube"}
    ).status_code == 422


def test_event_rejects_bad_type(enabled_client):
    client, *_ = enabled_client
    assert client.post("/api/event", json={"type": "hack"}).status_code == 422


def test_event_rejects_bad_quality(enabled_client):
    client, *_ = enabled_client
    assert client.post("/api/event", json={"type": "download", "quality": "; DROP"}).status_code == 422


def test_visit_event_records_source_and_visitor_kind(enabled_client):
    client, svc, store = enabled_client
    r = client.post("/api/event", json={"type": "visit", "source": "search", "visitor_kind": "new"})
    assert r.status_code == 204
    svc.recorder().flush()
    rows = store.query("SELECT source, visitor_kind FROM events WHERE type='visit'", [])
    assert rows == [{"source": "search", "visitor_kind": "new"}]


def test_visit_event_rejects_bad_source(enabled_client):
    client, *_ = enabled_client
    assert client.post("/api/event", json={"type": "visit", "source": "junk"}).status_code == 422


def test_visit_event_rejects_bad_visitor_kind(enabled_client):
    client, *_ = enabled_client
    assert client.post("/api/event", json={"type": "visit", "visitor_kind": "maybe"}).status_code == 422


def test_download_event_ignores_source(enabled_client):
    client, svc, store = enabled_client
    r = client.post(
        "/api/event", json={"type": "download", "quality": "hd", "source": "search", "platform": "tiktok"}
    )
    assert r.status_code == 204
    svc.recorder().flush()
    rows = store.query("SELECT source FROM events WHERE type='download'", [])
    assert rows == [{"source": None}]


def test_event_ignores_forged_cloudflare_headers(enabled_client, monkeypatch):
    # DNS-only production: CF-* headers can only come from the client. A forged
    # country must not reach the dashboard, and rotating a forged
    # CF-Connecting-IP must not mint a new visitor per request.
    monkeypatch.delenv("TRUST_CLOUDFLARE_HEADERS", raising=False)
    client, svc, store = enabled_client
    for fake_ip in ("6.6.6.1", "6.6.6.2", "6.6.6.3"):
        r = client.post("/api/event", json={"type": "visit"},
                        headers={"CF-Connecting-IP": fake_ip, "CF-IPCountry": "KP"})
        assert r.status_code == 204
    svc.recorder().flush()
    rows = store.query("SELECT country, visitor FROM events", [])
    assert [row["country"] for row in rows] == [None, None, None]
    assert len({row["visitor"] for row in rows}) == 1


def test_event_records_validated_country_when_cloudflare_trusted(enabled_client, monkeypatch):
    monkeypatch.setenv("TRUST_CLOUDFLARE_HEADERS", "1")
    client, svc, store = enabled_client
    for country in ("BD", "<b>pwned</b>"):
        r = client.post("/api/event", json={"type": "visit"}, headers={"CF-IPCountry": country})
        assert r.status_code == 204
    svc.recorder().flush()
    rows = store.query("SELECT country FROM events ORDER BY id", [])
    assert [row["country"] for row in rows] == ["BD", None]


def test_login_rate_limit_ignores_rotating_cf_connecting_ip(enabled_client, monkeypatch):
    # 5/minute is the only brute-force guard on the password-only admin, and it
    # is keyed by client_ip: a fresh forged CF-Connecting-IP per attempt must
    # not buy a fresh bucket.
    monkeypatch.delenv("TRUST_CLOUDFLARE_HEADERS", raising=False)
    client, *_ = enabled_client
    limiter.enabled = True
    limiter.reset()
    for i in range(5):
        r = client.post("/api/admin/login", json={"password": "nope"},
                        headers={"CF-Connecting-IP": f"6.6.6.{i}"})
        assert r.status_code == 401
    r = client.post("/api/admin/login", json={"password": "nope"},
                    headers={"CF-Connecting-IP": "6.6.6.99"})
    assert r.status_code == 429


def test_login_and_report_gate(enabled_client):
    client, *_ = enabled_client
    # no cookie -> 401
    assert client.get("/api/admin/report?range=7d&tz=360").status_code == 401
    # wrong pw -> 401
    assert client.post("/api/admin/login", json={"password": "nope"}).status_code == 401
    # right pw -> 200 + cookie
    ok = client.post("/api/admin/login", json={"password": "pw-long"})
    assert ok.status_code == 204
    # cookie now present on the client -> report 200
    s = client.get("/api/admin/report?range=7d&tz=360")
    assert s.status_code == 200
    assert "totals" in s.json()


def test_report_bad_tz(enabled_client):
    client, *_ = enabled_client
    client.post("/api/admin/login", json={"password": "pw-long"})
    assert client.get("/api/admin/report?range=7d&tz=abc").status_code == 422


def test_disabled_returns_404(monkeypatch):
    svc = service_mod.AnalyticsService()  # never init()'d -> disabled
    monkeypatch.setattr(service_mod, "service", svc)
    monkeypatch.setattr("app.analytics.router.service", svc)
    client = TestClient(create_app(), raise_server_exceptions=False)
    assert client.post("/api/event", json={"type": "visit"}).status_code == 404
    assert client.get("/api/admin/report?range=7d&tz=0").status_code == 404


def test_visit_event_records_locale(enabled_client):
    client, svc, store = enabled_client
    for locale in ("en", "es", "hi"):
        r = client.post("/api/event", json={"type": "visit", "locale": locale})
        assert r.status_code == 204, locale
    svc.recorder().flush()
    rows = store.query("SELECT locale FROM events WHERE type='visit' ORDER BY id", [])
    assert [r["locale"] for r in rows] == ["en", "es", "hi"]


def test_visit_event_without_locale_stores_null(enabled_client):
    client, svc, store = enabled_client
    assert client.post("/api/event", json={"type": "visit"}).status_code == 204
    svc.recorder().flush()
    assert store.query("SELECT locale FROM events", []) == [{"locale": None}]


def test_visit_event_rejects_bad_locale(enabled_client):
    client, *_ = enabled_client
    for bad in ("fr", "EN", "en-US", "", "es "):
        r = client.post("/api/event", json={"type": "visit", "locale": bad})
        assert r.status_code == 422, bad


def test_download_event_drops_locale(enabled_client):
    client, svc, store = enabled_client
    r = client.post(
        "/api/event", json={"type": "download", "quality": "hd", "platform": "tiktok", "locale": "es"}
    )
    assert r.status_code == 204
    svc.recorder().flush()
    rows = store.query("SELECT locale FROM events WHERE type='download'", [])
    assert rows == [{"locale": None}]
