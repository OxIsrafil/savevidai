
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


def test_assets_immutable(tmp_path, monkeypatch):
    _make_static(tmp_path)
    monkeypatch.setenv("STATIC_DIR", str(tmp_path))
    client = TestClient(create_app())
    res = client.get("/assets/x.js")
    assert res.status_code == 200
    assert res.headers["cache-control"] == "public, max-age=31536000, immutable"


def test_fonts_immutable(tmp_path, monkeypatch):
    _make_static(tmp_path)
    monkeypatch.setenv("STATIC_DIR", str(tmp_path))
    client = TestClient(create_app())
    res = client.get("/fonts/f.woff2")
    assert res.status_code == 200
    assert res.headers["cache-control"] == "public, max-age=31536000, immutable"


def test_index_html_no_cache(tmp_path, monkeypatch):
    _make_static(tmp_path)
    monkeypatch.setenv("STATIC_DIR", str(tmp_path))
    client = TestClient(create_app())
    res = client.get("/")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/html")
    assert res.headers["cache-control"] == "no-cache"


def test_api_health_untouched(tmp_path, monkeypatch):
    _make_static(tmp_path)
    monkeypatch.setenv("STATIC_DIR", str(tmp_path))
    client = TestClient(create_app())
    res = client.get("/api/health")
    assert res.status_code == 200
    # The middleware must not force a Cache-Control header on API responses.
    assert "cache-control" not in {k.lower() for k in res.headers}
