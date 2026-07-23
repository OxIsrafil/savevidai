
import pytest
from fastapi.testclient import TestClient

from app.main import create_app


def _make_static(tmp_path):
    (tmp_path / "index.html").write_text("<!doctype html><title>home</title>")
    assets = tmp_path / "assets"
    assets.mkdir()
    (assets / "x.js").write_text("console.log(1);")
    fonts = tmp_path / "fonts"
    fonts.mkdir()
    (fonts / "f.woff2").write_bytes(b"woff2data")
    (tmp_path / "maintenance.html").write_text(
        "<!doctype html><title>Under maintenance</title><h1>Under maintenance</h1>"
    )
    maint = tmp_path / "maintenance"
    maint.mkdir()
    (maint / "lottie.min.js").write_text("/* lottie */")
    (maint / "maintenance.json").write_text('{"v":"1"}')


def test_maintenance_off_normal_behavior(tmp_path, monkeypatch):
    _make_static(tmp_path)
    monkeypatch.setenv("STATIC_DIR", str(tmp_path))
    monkeypatch.delenv("MAINTENANCE_MODE", raising=False)
    client = TestClient(create_app())

    res = client.get("/")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/html")

    health = client.get("/api/health")
    assert health.status_code == 200

    # A bad url resolves to the normal 422 invalid_url error, not a 503 maintenance.
    resolve = client.post("/api/resolve", json={"url": "not-a-url"})
    assert resolve.status_code == 422
    assert resolve.json()["error"] != "maintenance"


def test_maintenance_on(tmp_path, monkeypatch):
    _make_static(tmp_path)
    monkeypatch.setenv("STATIC_DIR", str(tmp_path))
    monkeypatch.setenv("MAINTENANCE_MODE", "1")
    client = TestClient(create_app())

    root = client.get("/")
    assert root.status_code == 503
    assert "Under maintenance" in root.text
    assert "Retry-After" in {k.title() for k in root.headers}
    assert root.headers["cache-control"] == "no-store"

    # Health stays up so Render does not roll back the deploy.
    health = client.get("/api/health")
    assert health.status_code == 200
    body = health.json()
    assert body["ok"] is True

    resolve = client.post("/api/resolve", json={"url": "https://x.com/i/status/1"})
    assert resolve.status_code == 503
    assert resolve.json() == {
        "error": "maintenance",
        "message": "SaveVid AI is briefly down for maintenance. Try again in a few minutes.",
    }
    assert resolve.headers["retry-after"] == "120"

    # The maintenance page's own assets must fall through and serve.
    lottie = client.get("/maintenance/lottie.min.js")
    assert lottie.status_code == 200
    anim = client.get("/maintenance/maintenance.json")
    assert anim.status_code == 200


@pytest.mark.parametrize("value", ["true", "on", "yes", "1"])
def test_truthy_values_enable(tmp_path, monkeypatch, value):
    _make_static(tmp_path)
    monkeypatch.setenv("STATIC_DIR", str(tmp_path))
    monkeypatch.setenv("MAINTENANCE_MODE", value)
    client = TestClient(create_app())
    assert client.get("/").status_code == 503


@pytest.mark.parametrize("value", ["0", "false", ""])
def test_falsy_values_disable(tmp_path, monkeypatch, value):
    _make_static(tmp_path)
    monkeypatch.setenv("STATIC_DIR", str(tmp_path))
    monkeypatch.setenv("MAINTENANCE_MODE", value)
    client = TestClient(create_app())
    assert client.get("/").status_code == 200


def test_missing_maintenance_html_fallback(tmp_path, monkeypatch):
    # A static dir with no maintenance.html: the minimal inline fallback is served.
    (tmp_path / "index.html").write_text("<!doctype html><title>home</title>")
    monkeypatch.setenv("STATIC_DIR", str(tmp_path))
    monkeypatch.setenv("MAINTENANCE_MODE", "1")
    client = TestClient(create_app())

    res = client.get("/")
    assert res.status_code == 503
    assert "Under maintenance" in res.text
    assert res.headers["cache-control"] == "no-store"
