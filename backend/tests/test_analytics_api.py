import pytest
from fastapi.testclient import TestClient

from app.analytics import service as service_mod
from app.analytics.config import AnalyticsConfig
from app.analytics.recorder import Recorder
from app.analytics.store import SqliteStore
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
    # silently drop the cookie and every post-login stats call would 401).
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
    client, svc, store = enabled_client
    for q in ("photo", "album", "sound"):
        r = client.post("/api/event", json={"type": "download", "quality": q, "platform": "tiktok"})
        assert r.status_code == 204, q
    assert client.post("/api/event", json={"type": "download", "quality": "photos"}).status_code == 422


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


def test_login_and_stats_gate(enabled_client):
    client, *_ = enabled_client
    # no cookie -> 401
    assert client.get("/api/admin/stats?days=30&tz=360").status_code == 401
    # wrong pw -> 401
    assert client.post("/api/admin/login", json={"password": "nope"}).status_code == 401
    # right pw -> 200 + cookie
    ok = client.post("/api/admin/login", json={"password": "pw-long"})
    assert ok.status_code == 204
    # cookie now present on the client -> stats 200
    s = client.get("/api/admin/stats?days=30&tz=360")
    assert s.status_code == 200
    assert "totals" in s.json()


def test_stats_bad_tz(enabled_client):
    client, *_ = enabled_client
    client.post("/api/admin/login", json={"password": "pw-long"})
    assert client.get("/api/admin/stats?days=30&tz=abc").status_code == 422


def test_disabled_returns_404(monkeypatch):
    svc = service_mod.AnalyticsService()  # never init()'d -> disabled
    monkeypatch.setattr(service_mod, "service", svc)
    monkeypatch.setattr("app.analytics.router.service", svc)
    client = TestClient(create_app(), raise_server_exceptions=False)
    assert client.post("/api/event", json={"type": "visit"}).status_code == 404
    assert client.get("/api/admin/stats?days=30&tz=0").status_code == 404
