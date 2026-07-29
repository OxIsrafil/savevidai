import pytest
from fastapi.testclient import TestClient

import app.resolve as resolve_module
from app.cache import TTLCache
from app.errors import NOT_FOUND, PRIVATE, app_error
from app.limits import limiter
from app.main import create_app
from app.schemas import MediaItem, ResolveResponse, Variant

TT = ResolveResponse(
    id="7280000000000000000", author="User", handle="user", avatar_url=None,
    text="cap", items=[MediaItem(index=1, kind="video", thumbnail=None, duration_seconds=15,
        variants=[Variant(label="hd", url="https://www.tikwm.com/v/hd.mp4")])],
)

RED = ResolveResponse(
    id="abc123", author="u/spez", handle="spez", avatar_url=None,
    text="a reddit post", items=[MediaItem(index=1, kind="video", thumbnail=None,
        duration_seconds=None,
        variants=[Variant(label="720p", url="/api/mux/vidid1234/720.mp4")])],
)

IG = ResolveResponse(
    id="DbKoX9xTgPz", author="Instagram", handle="DbKoX9xTgPz", avatar_url=None,
    text="", items=[MediaItem(index=1, kind="video", thumbnail=None, duration_seconds=None,
        variants=[Variant(label="hd", url="https://scontent.cdninstagram.com/x.mp4")])],
)

FB = ResolveResponse(
    id="1234567890", author="Facebook", handle="1234567890", avatar_url=None,
    text="", items=[MediaItem(index=1, kind="video", thumbnail=None, duration_seconds=None,
        variants=[Variant(label="hd", url="https://video.fhan5-6.fna.fbcdn.net/v/x.mp4")])],
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


def test_resolve_routes_reddit(monkeypatch, client):
    monkeypatch.setattr(resolve_module, "extract_reddit", lambda parsed: RED)
    r = client.post("/api/resolve", json={"url": "https://www.reddit.com/r/aww/comments/abc123/cute/"})
    assert r.status_code == 200
    assert r.json()["items"][0]["variants"][0]["label"] == "720p"


def test_resolve_routes_instagram(monkeypatch, client):
    calls = {}
    monkeypatch.setattr(resolve_module, "extract_instagram",
                        lambda shortcode: calls.update(sc=shortcode) or IG)
    r = client.post("/api/resolve", json={"url": "https://www.instagram.com/reel/DbKoX9xTgPz"})
    assert r.status_code == 200
    assert calls["sc"] == "DbKoX9xTgPz"
    assert r.json()["items"][0]["variants"][0]["label"] == "hd"


def test_instagram_resolve_cached_with_short_ttl(monkeypatch, client):
    seen = {}
    real_set = resolve_module.cache.set
    monkeypatch.setattr(resolve_module, "extract_instagram", lambda shortcode: IG)
    monkeypatch.setattr(resolve_module.cache, "set",
                        lambda key, value, ttl=None: seen.update({key: ttl}) or real_set(key, value, ttl=ttl))
    r = client.post("/api/resolve", json={"url": "https://www.instagram.com/reel/DbKoX9xTgPz"})
    assert r.status_code == 200
    assert seen["instagram:DbKoX9xTgPz"] == 600.0


def test_instagram_invalid_url(client):
    r = client.post("/api/resolve", json={"url": "https://www.instagram.com/"})
    assert r.status_code == 422
    assert r.json()["error"] == "invalid_url"


def test_resolve_routes_facebook(monkeypatch, client):
    calls = {}
    monkeypatch.setattr(resolve_module, "extract_facebook",
                        lambda parsed: calls.update(parsed=parsed) or FB)
    r = client.post("/api/resolve", json={"url": "https://www.facebook.com/watch/?v=1234567890"})
    assert r.status_code == 200
    assert calls["parsed"] == ("1234567890", "/watch/?v=1234567890")
    assert r.json()["items"][0]["variants"][0]["label"] == "hd"


def test_facebook_resolve_cache_key_is_the_path(monkeypatch, client):
    seen = {}
    real_set = resolve_module.cache.set
    monkeypatch.setattr(resolve_module, "extract_facebook", lambda parsed: FB)
    monkeypatch.setattr(resolve_module.cache, "set",
                        lambda key, value, ttl=None: seen.update({key: ttl}) or real_set(key, value, ttl=ttl))
    r = client.post("/api/resolve", json={"url": "https://www.facebook.com/watch/?v=1234567890"})
    assert r.status_code == 200
    # keyed on the PATH, not the bare id: share tokens and ids must never alias
    assert seen == {"facebook:/watch/?v=1234567890": 600.0}


def test_facebook_reel_and_watch_do_not_share_a_cache_key(monkeypatch, client):
    calls = []
    monkeypatch.setattr(resolve_module, "extract_facebook",
                        lambda parsed: calls.append(parsed) or FB)
    client.post("/api/resolve", json={"url": "https://www.facebook.com/watch/?v=1234567890"})
    client.post("/api/resolve", json={"url": "https://www.facebook.com/reel/1234567890"})
    assert calls == [("1234567890", "/watch/?v=1234567890"), ("1234567890", "/reel/1234567890")]


def test_facebook_invalid_url(client):
    r = client.post("/api/resolve", json={"url": "https://www.facebook.com/"})
    assert r.status_code == 422
    assert r.json()["error"] == "invalid_url"


def test_facebook_fetch_event_tagged_platform(monkeypatch, client):
    events = []
    monkeypatch.setattr(resolve_module, "extract_facebook", lambda parsed: FB)
    monkeypatch.setattr(
        resolve_module.analytics, "record_from_request",
        lambda request, kind, outcome, platform=None: events.append((kind, outcome, platform)),
    )
    r = client.post("/api/resolve", json={"url": "https://www.facebook.com/watch/?v=1234567890"})
    assert r.status_code == 200
    assert ("fetch", "ok", "facebook") in events


def test_facebook_extractor_error_passthrough(monkeypatch, client):
    def boom(parsed):
        raise app_error(NOT_FOUND)

    monkeypatch.setattr(resolve_module, "extract_facebook", boom)
    r = client.post("/api/resolve", json={"url": "https://www.facebook.com/watch/?v=1234567890"})
    assert r.status_code == 404
    assert r.json()["error"] == "not_found"


def test_reddit_fetch_event_tagged_platform(monkeypatch, client):
    events = []
    monkeypatch.setattr(resolve_module, "extract_reddit", lambda parsed: RED)
    monkeypatch.setattr(
        resolve_module.analytics, "record_from_request",
        lambda request, kind, outcome, platform=None: events.append((kind, outcome, platform)),
    )
    r = client.post("/api/resolve", json={"url": "https://www.reddit.com/r/aww/comments/abc123/cute/"})
    assert r.status_code == 200
    assert ("fetch", "ok", "reddit") in events


def test_reddit_extractor_error_passthrough(monkeypatch, client):
    def boom(parsed):
        raise app_error(NOT_FOUND)

    monkeypatch.setattr(resolve_module, "extract_reddit", boom)
    r = client.post("/api/resolve", json={"url": "https://www.reddit.com/r/aww/comments/abc123/cute/"})
    assert r.status_code == 404
    assert r.json()["error"] == "not_found"


def test_reddit_invalid_url(client):
    r = client.post("/api/resolve", json={"url": "https://www.reddit.com/"})
    assert r.status_code == 422
    assert r.json()["error"] == "invalid_url"


def test_resolve_rejects_unknown_platform(client):
    r = client.post("/api/resolve", json={"url": "https://youtube.com/watch?v=x"})
    assert r.status_code == 422
    assert r.json()["error"] == "invalid_url"


def test_tiktok_resolve_cached_with_short_ttl(monkeypatch, client):
    calls = {}
    real_set = resolve_module.cache.set
    monkeypatch.setattr(resolve_module, "extract_tiktok", lambda url: TT)
    monkeypatch.setattr(resolve_module.cache, "set",
                        lambda key, value, ttl=None: calls.update(ttl=ttl) or real_set(key, value, ttl=ttl))
    r = client.post("/api/resolve", json={"url": "https://www.tiktok.com/@user/video/7280000000000000000"})
    assert r.status_code == 200
    assert calls["ttl"] == 900.0


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
