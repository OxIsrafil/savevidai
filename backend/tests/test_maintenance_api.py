import pytest
from fastapi.testclient import TestClient

from app import maintenance
from app.analytics import service as service_mod
from app.analytics.config import AnalyticsConfig
from app.analytics.recorder import Recorder
from app.analytics.store import SqliteStore
from app.main import create_app


def _make_static(tmp_path):
    (tmp_path / "index.html").write_text("<!doctype html><title>home</title>")
    (tmp_path / "admin.html").write_text(
        "<!doctype html><title>Admin</title><h1>Admin dashboard</h1>"
    )
    (tmp_path / "maintenance.html").write_text(
        "<!doctype html><title>Under maintenance</title><h1>Under maintenance</h1>"
    )


@pytest.fixture()
def enabled_client(tmp_path, monkeypatch):
    _make_static(tmp_path)
    monkeypatch.setenv("STATIC_DIR", str(tmp_path))
    monkeypatch.delenv("MAINTENANCE_MODE", raising=False)
    store = SqliteStore(":memory:")
    rec = Recorder(store, batch_interval=0.05)
    cfg = AnalyticsConfig("libsql://x", "t", "pw-long", "salt")
    svc = service_mod.AnalyticsService()
    svc.init(cfg, store, rec)
    monkeypatch.setattr(service_mod, "service", svc)
    monkeypatch.setattr("app.analytics.router.service", svc)
    monkeypatch.setattr("app.resolve.analytics", svc, raising=False)
    # https base_url: the admin cookie is Secure, so httpx only sends it back
    # over an https-scheme origin (matches the analytics API tests).
    client = TestClient(create_app(), base_url="https://testserver", raise_server_exceptions=False)
    return client, svc, store


def _login(client):
    assert client.post("/api/admin/login", json={"password": "pw-long"}).status_code == 204


def test_toggle_maintenance_flow(enabled_client):
    client, *_ = enabled_client
    try:
        _login(client)

        r = client.post("/api/admin/maintenance", json={"on": True})
        assert r.status_code == 200
        assert r.json() == {"on": True, "forced_by_env": False}

        g = client.get("/api/admin/maintenance")
        assert g.status_code == 200
        assert g.json()["on"] is True

        # Public root now serves the maintenance page.
        assert client.get("/").status_code == 503

        r = client.post("/api/admin/maintenance", json={"on": False})
        assert r.status_code == 200
        assert r.json() == {"on": False, "forced_by_env": False}

        assert client.get("/").status_code == 200
    finally:
        maintenance.set_on(False)


def test_admin_page_reachable_during_maintenance(enabled_client):
    # With maintenance ON via the in-memory flag, the /admin dashboard page must
    # still load so the owner can log in and toggle maintenance back off. Every
    # other page route stays blocked with the 503 maintenance page.
    client, *_ = enabled_client
    try:
        maintenance.set_on(True)

        # A normal page route is still blocked.
        root = client.get("/")
        assert root.status_code == 503
        assert "Under maintenance" in root.text

        # The admin dashboard page loads and serves admin.html, not the 503 page.
        admin = client.get("/admin")
        assert admin.status_code == 200
        assert "Admin dashboard" in admin.text
        assert "Under maintenance" not in admin.text

        # The cookie-authed admin API stays reachable (401 without a cookie, not 503).
        assert client.get("/api/admin/maintenance").status_code == 401

        # Toggling maintenance off restores the public site.
        maintenance.set_on(False)
        assert client.get("/").status_code == 200
    finally:
        maintenance.set_on(False)


def test_no_cookie_unauthorized(enabled_client):
    client, *_ = enabled_client
    try:
        assert client.get("/api/admin/maintenance").status_code == 401
        assert client.post("/api/admin/maintenance", json={"on": True}).status_code == 401
    finally:
        maintenance.set_on(False)


def test_disabled_returns_404(tmp_path, monkeypatch):
    _make_static(tmp_path)
    monkeypatch.setenv("STATIC_DIR", str(tmp_path))
    monkeypatch.delenv("MAINTENANCE_MODE", raising=False)
    svc = service_mod.AnalyticsService()  # never init()'d -> disabled
    monkeypatch.setattr(service_mod, "service", svc)
    monkeypatch.setattr("app.analytics.router.service", svc)
    client = TestClient(create_app(), base_url="https://testserver", raise_server_exceptions=False)
    try:
        assert client.get("/api/admin/maintenance").status_code == 404
        assert client.post("/api/admin/maintenance", json={"on": True}).status_code == 404
    finally:
        maintenance.set_on(False)


def test_env_override_wins(enabled_client, monkeypatch):
    client, *_ = enabled_client
    try:
        _login(client)
        monkeypatch.setenv("MAINTENANCE_MODE", "1")
        r = client.post("/api/admin/maintenance", json={"on": False})
        assert r.status_code == 200
        assert r.json() == {"on": True, "forced_by_env": True}
    finally:
        monkeypatch.delenv("MAINTENANCE_MODE", raising=False)
        maintenance.set_on(False)
