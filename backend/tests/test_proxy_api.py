import httpx
import respx
from fastapi.testclient import TestClient

import app.proxy as proxy_module
from app.facebook import FACEBOOK_MEDIA_HOSTS
from app.main import create_app


def client() -> TestClient:
    return TestClient(create_app(), raise_server_exceptions=False)


def test_rejects_non_twimg():
    res = client().get("/api/proxy", params={"url": "https://evil.com/v.mp4"})
    assert res.status_code == 403
    assert res.json()["error"] == "forbidden_url"


def test_rejects_lookalike_prefix():
    res = client().get(
        "/api/proxy", params={"url": "https://video.twimg.com.evil.com/v.mp4"})
    assert res.status_code == 403


@respx.mock
def test_streams_and_names_file():
    respx.get("https://video.twimg.com/ext/v.mp4").mock(
        return_value=httpx.Response(200, content=b"vidbytes", headers={"content-length": "8"}))
    res = client().get(
        "/api/proxy",
        params={"url": "https://video.twimg.com/ext/v.mp4", "filename": 'ada 1080p".mp4'},
    )
    assert res.status_code == 200
    assert res.content == b"vidbytes"
    assert res.headers["content-type"] == "video/mp4"
    assert 'filename="ada_1080p_.mp4"' in res.headers["content-disposition"]


@respx.mock
def test_upstream_error():
    respx.get("https://video.twimg.com/ext/missing.mp4").mock(
        return_value=httpx.Response(404))
    res = client().get("/api/proxy", params={"url": "https://video.twimg.com/ext/missing.mp4"})
    assert res.status_code == 502
    assert res.json()["error"] == "upstream_error"


@respx.mock
def test_control_char_url_returns_502_without_leaking_semaphore():
    before = proxy_module._SEM._value
    res = client().get("/api/proxy", params={"url": "https://video.twimg.com/x\ny"})
    assert res.status_code == 502
    assert res.json()["error"] == "upstream_error"
    assert proxy_module._SEM._value == before  # permit released, no leak


def test_proxy_allows_tiktok_host():
    with respx.mock:
        respx.get("https://www.tikwm.com/video/media/hdplay/x.mp4").mock(
            return_value=httpx.Response(200, content=b"vid", headers={"content-length": "3"}))
        res = client().get(
            "/api/proxy",
            params={"url": "https://www.tikwm.com/video/media/hdplay/x.mp4"})
        assert res.status_code == 200
        assert res.content == b"vid"


def test_proxy_allows_tiktok_cdn_suffix_host():
    with respx.mock:
        respx.get("https://v16m-default.tiktokcdn-us.com/some/path/file.mp4").mock(
            return_value=httpx.Response(200, content=b"cdn", headers={"content-length": "3"}))
        res = client().get(
            "/api/proxy",
            params={"url": "https://v16m-default.tiktokcdn-us.com/some/path/file.mp4"})
        assert res.status_code == 200
        assert res.content == b"cdn"


def test_proxy_rejects_tiktok_lookalike():
    res = client().get("/api/proxy", params={"url": "https://tikwm.com.evil.com/x.mp4"})
    assert res.status_code == 403
    res2 = client().get("/api/proxy", params={"url": "https://evil.com/x.mp4"})
    assert res2.status_code == 403
    res3 = client().get("/api/proxy", params={"url": "https://tiktokcdn-us.com.evil.com/x.mp4"})
    assert res3.status_code == 403


def test_proxy_forwards_upstream_content_type():
    import httpx
    import respx
    with respx.mock:
        respx.get("https://p16-sign.tiktokcdn-us.com/img1.jpeg").mock(
            return_value=httpx.Response(200, content=b"jpg", headers={
                "content-length": "3", "content-type": "image/jpeg; charset=binary"}))
        res = client().get("/api/proxy", params={
            "url": "https://p16-sign.tiktokcdn-us.com/img1.jpeg", "filename": "photo_1.jpg"})
        assert res.status_code == 200
        assert res.headers["content-type"] == "image/jpeg"
        assert 'filename="photo_1.jpg"' in res.headers["content-disposition"]


def test_proxy_defaults_to_mp4_without_upstream_type():
    import httpx
    import respx
    with respx.mock:
        respx.get("https://video.twimg.com/x.mp4").mock(
            return_value=httpx.Response(200, content=b"vid", headers={"content-length": "3"}))
        res = client().get("/api/proxy", params={"url": "https://video.twimg.com/x.mp4"})
        assert res.headers["content-type"].startswith("video/mp4")


def test_proxy_allows_vredd_host():
    with respx.mock:
        respx.get("https://v.redd.it/enxxsuo5xko31/DASH_720").mock(
            return_value=httpx.Response(200, content=b"vid", headers={"content-length": "3"}))
        res = client().get(
            "/api/proxy",
            params={"url": "https://v.redd.it/enxxsuo5xko31/DASH_720"})
        assert res.status_code == 200
        assert res.content == b"vid"


def test_proxy_allows_iredd_host():
    with respx.mock:
        respx.get("https://i.redd.it/abc123.jpg").mock(
            return_value=httpx.Response(200, content=b"jpg", headers={"content-length": "3"}))
        res = client().get(
            "/api/proxy",
            params={"url": "https://i.redd.it/abc123.jpg"})
        assert res.status_code == 200
        assert res.content == b"jpg"


def test_proxy_allows_redd_it_exact_host():
    with respx.mock:
        respx.get("https://redd.it/x").mock(
            return_value=httpx.Response(200, content=b"ok", headers={"content-length": "2"}))
        res = client().get("/api/proxy", params={"url": "https://redd.it/x"})
        assert res.status_code == 200
        assert res.content == b"ok"


def test_proxy_rejects_redd_it_lookalike():
    res = client().get("/api/proxy", params={"url": "https://redd.it.evil.com/x.mp4"})
    assert res.status_code == 403
    res2 = client().get("/api/proxy", params={"url": "https://vredd.it/x.mp4"})
    assert res2.status_code == 403
    res3 = client().get("/api/proxy", params={"url": "https://notredd.it/x"})
    assert res3.status_code == 403


def test_proxy_allows_instagram_cdn_hosts():
    with respx.mock:
        respx.get("https://scontent.cdninstagram.com/o1/v/x.mp4").mock(
            return_value=httpx.Response(200, content=b"vid", headers={"content-length": "3"}))
        res = client().get(
            "/api/proxy",
            params={"url": "https://scontent.cdninstagram.com/o1/v/x.mp4"})
        assert res.status_code == 200
        assert res.content == b"vid"

    with respx.mock:
        respx.get("https://scontent-mad1-1.cdninstagram.com/v/x.jpg").mock(
            return_value=httpx.Response(200, content=b"jpg", headers={"content-length": "3"}))
        res2 = client().get(
            "/api/proxy",
            params={"url": "https://scontent-mad1-1.cdninstagram.com/v/x.jpg"})
        assert res2.status_code == 200
        assert res2.content == b"jpg"

    with respx.mock:
        respx.get("https://scontent.xx.fbcdn.net/v/x.mp4").mock(
            return_value=httpx.Response(200, content=b"fb", headers={"content-length": "2"}))
        res3 = client().get(
            "/api/proxy",
            params={"url": "https://scontent.xx.fbcdn.net/v/x.mp4"})
        assert res3.status_code == 200
        assert res3.content == b"fb"


def test_proxy_allows_facebook_cdn_host():
    with respx.mock:
        respx.get("https://video.fhan5-6.fna.fbcdn.net/v/x.mp4").mock(
            return_value=httpx.Response(200, content=b"fbv", headers={"content-length": "3"}))
        res = client().get(
            "/api/proxy",
            params={"url": "https://video.fhan5-6.fna.fbcdn.net/v/x.mp4"})
        assert res.status_code == 200
        assert res.content == b"fbv"


def test_proxy_rejects_facebook_cdn_lookalikes():
    res = client().get("/api/proxy", params={"url": "https://fbcdn.net.evil.com/x.mp4"})
    assert res.status_code == 403
    res2 = client().get("/api/proxy", params={"url": "https://notfbcdn.net/x.mp4"})
    assert res2.status_code == 403
    res3 = client().get("/api/proxy", params={"url": "http://video.fhan5-6.fna.fbcdn.net/x.mp4"})
    assert res3.status_code == 403


def test_proxy_allowlist_includes_facebook_media_hosts():
    assert all(h in proxy_module._ALLOWED_HOSTS for h in FACEBOOK_MEDIA_HOSTS)


def test_proxy_rejects_instagram_lookalikes_and_hijack_targets():
    res = client().get("/api/proxy", params={"url": "https://cdninstagram.com.evil.com/x.mp4"})
    assert res.status_code == 403
    res2 = client().get("/api/proxy", params={"url": "https://evilfbcdn.net/x.mp4"})
    assert res2.status_code == 403
    res3 = client().get("/api/proxy", params={"url": "https://www.effectivegatecpm.com/nf52nwk7"})
    assert res3.status_code == 403
    res4 = client().get("/api/proxy", params={"url": "http://scontent.cdninstagram.com/x.mp4"})
    assert res4.status_code == 403
