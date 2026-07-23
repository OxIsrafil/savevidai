
from fastapi.testclient import TestClient

from app.main import create_app


def test_reddit_page_404_without_static(monkeypatch):
    monkeypatch.delenv("STATIC_DIR", raising=False)
    client = TestClient(create_app(), raise_server_exceptions=False)
    res = client.get("/redditvideodownloader")
    assert res.status_code == 404


def test_reddit_page_served_from_static(tmp_path, monkeypatch):
    (tmp_path / "redditvideodownloader.html").write_text("<!doctype html><title>rd</title>")
    monkeypatch.setenv("STATIC_DIR", str(tmp_path))
    client = TestClient(create_app())
    res = client.get("/redditvideodownloader")
    assert res.status_code == 200
    assert "rd" in res.text
