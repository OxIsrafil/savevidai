import httpx
import respx
from fastapi.testclient import TestClient

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
