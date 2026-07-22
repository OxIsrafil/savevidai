import pytest
from fastapi.testclient import TestClient

import app.resolve as resolve_module
from app.cache import TTLCache
from app.errors import PRIVATE, app_error
from app.limits import limiter
from app.main import create_app
from app.schemas import MediaItem, ResolveResponse, Variant

TT = ResolveResponse(
    id="7280000000000000000", author="User", handle="user", avatar_url=None,
    text="cap", items=[MediaItem(index=1, kind="video", thumbnail=None, duration_seconds=15,
        variants=[Variant(label="hd", url="https://www.tikwm.com/v/hd.mp4")])],
)

FIXTURE = ResolveResponse(
    id="20", author="Jack", handle="jack", text="just setting up",
    items=[MediaItem(index=1, kind="video", variants=[
        Variant(label="720p", url="https://video.twimg.com/v/720.mp4", size_bytes=1000)])],
)


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setattr(resolve_module, "cache", TTLCache(maxsize=8, ttl=60))
    monkeypatch.setattr(resolve_module, "fill_sizes", lambda resp: None)
    return TestClient(create_app(), raise_server_exceptions=False)


def test_resolve_ok(client, monkeypatch):
    monkeypatch.setattr(resolve_module, "extract", lambda tweet_id: FIXTURE)
    res = client.post("/api/resolve", json={"url": "https://x.com/jack/status/20"})
    assert res.status_code == 200
    body = res.json()
    assert body["id"] == "20"
    assert body["items"][0]["variants"][0]["label"] == "720p"


def test_resolve_caches(client, monkeypatch):
    calls = []
    monkeypatch.setattr(resolve_module, "extract", lambda tweet_id: calls.append(1) or FIXTURE)
    client.post("/api/resolve", json={"url": "https://x.com/jack/status/20"})
    client.post("/api/resolve", json={"url": "https://twitter.com/jack/status/20?s=20"})
    assert len(calls) == 1  # second hit served from cache despite different URL shape


def test_invalid_url(client):
    res = client.post("/api/resolve", json={"url": "https://youtube.com/watch?v=1"})
    assert res.status_code == 422
    assert res.json()["error"] == "invalid_url"


def test_extractor_error_passthrough(client, monkeypatch):
    def boom(tweet_id):
        raise app_error(PRIVATE)

    monkeypatch.setattr(resolve_module, "extract", boom)
    res = client.post("/api/resolve", json={"url": "https://x.com/jack/status/20"})
    assert res.status_code == 403
    assert res.json()["error"] == "private_or_restricted"


def test_resolve_routes_tiktok(monkeypatch, client):
    monkeypatch.setattr(resolve_module, "extract_tiktok", lambda url: TT)
    r = client.post("/api/resolve", json={"url": "https://www.tiktok.com/@user/video/7280000000000000000"})
    assert r.status_code == 200
    assert r.json()["items"][0]["variants"][0]["label"] == "hd"


def test_resolve_rejects_unknown_platform(client):
    r = client.post("/api/resolve", json={"url": "https://youtube.com/watch?v=x"})
    assert r.status_code == 422
    assert r.json()["error"] == "invalid_url"


def test_rate_limit(client, monkeypatch):
    monkeypatch.setattr(resolve_module, "extract", lambda tweet_id: FIXTURE)
    limiter.enabled = True
    limiter.reset()
    for _ in range(10):
        assert client.post(
            "/api/resolve", json={"url": "https://x.com/jack/status/20"}
        ).status_code == 200
    res = client.post("/api/resolve", json={"url": "https://x.com/jack/status/20"})
    assert res.status_code == 429
    assert res.json()["error"] == "rate_limited"
