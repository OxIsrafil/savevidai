
from fastapi.testclient import TestClient

from app.main import create_app


def test_tiktok_page_404_without_static(monkeypatch):
    monkeypatch.delenv("STATIC_DIR", raising=False)
    client = TestClient(create_app(), raise_server_exceptions=False)
    res = client.get("/tiktokvideodownloader")
    assert res.status_code == 404


def test_tiktok_page_served_from_static(tmp_path, monkeypatch):
    (tmp_path / "tiktokvideodownloader.html").write_text("<!doctype html><title>tt</title>")
    monkeypatch.setenv("STATIC_DIR", str(tmp_path))
    client = TestClient(create_app())
    res = client.get("/tiktokvideodownloader")
    assert res.status_code == 200
    assert "tt" in res.text
