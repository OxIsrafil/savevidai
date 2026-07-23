import httpx
import pytest
import respx

import app.reddit as reddit_mod
from app.errors import AppError

TOKEN_URL = "https://www.reddit.com/api/v1/access_token"
POST_URL = "https://oauth.reddit.com/comments/1abc23x"
SHARE_URL = "https://www.reddit.com/r/funny/s/abc123"


@pytest.fixture(autouse=True)
def creds(monkeypatch):
    monkeypatch.setenv("REDDIT_CLIENT_ID", "cid")
    monkeypatch.setenv("REDDIT_CLIENT_SECRET", "csec")
    reddit_mod._token_cache.clear()
    yield


def _mock_token(mock, token="tok1", expires=3600):
    mock.post(TOKEN_URL).mock(return_value=httpx.Response(200, json={
        "access_token": token, "token_type": "bearer", "expires_in": expires}))


def test_not_configured_raises_before_network(monkeypatch):
    monkeypatch.delenv("REDDIT_CLIENT_ID")
    with pytest.raises(AppError) as exc:
        reddit_mod.fetch_post("1abc23x")
    assert exc.value.code == "not_configured"
    assert exc.value.status == 503


def test_get_token_not_configured_raises(monkeypatch):
    monkeypatch.delenv("REDDIT_CLIENT_SECRET")
    with pytest.raises(AppError) as exc:
        reddit_mod._get_token()
    assert exc.value.code == "not_configured"


def test_token_cached_across_calls():
    with respx.mock as mock:
        _mock_token(mock)
        route = mock.get(url__startswith=POST_URL).mock(return_value=httpx.Response(200, json={
            "data": {"children": [{"data": {"id": "1abc23x", "title": "t"}}]}}))
        reddit_mod.fetch_post("1abc23x")
        reddit_mod.fetch_post("1abc23x")
        assert mock.routes[0].call_count == 1  # one token fetch
        assert route.call_count == 2


def test_fetch_post_sends_bearer_token():
    with respx.mock as mock:
        _mock_token(mock, token="tok9")
        route = mock.get(url__startswith=POST_URL).mock(return_value=httpx.Response(200, json={
            "data": {"children": [{"data": {"id": "1abc23x"}}]}}))
        reddit_mod.fetch_post("1abc23x")
        assert route.calls.last.request.headers["Authorization"] == "bearer tok9"


def test_post_404_maps_not_found():
    with respx.mock as mock:
        _mock_token(mock)
        mock.get(url__startswith=POST_URL).mock(return_value=httpx.Response(404))
        with pytest.raises(AppError) as exc:
            reddit_mod.fetch_post("1abc23x")
    assert exc.value.code == "not_found"


def test_post_403_maps_private():
    with respx.mock as mock:
        _mock_token(mock)
        mock.get(url__startswith=POST_URL).mock(return_value=httpx.Response(403))
        with pytest.raises(AppError) as exc:
            reddit_mod.fetch_post("1abc23x")
    assert exc.value.code == "private_or_restricted"


def test_post_500_maps_upstream():
    with respx.mock as mock:
        _mock_token(mock)
        mock.get(url__startswith=POST_URL).mock(return_value=httpx.Response(500))
        with pytest.raises(AppError) as exc:
            reddit_mod.fetch_post("1abc23x")
    assert exc.value.code == "upstream_error"


def test_expired_token_refreshes_once_on_401():
    with respx.mock as mock:
        token_route = mock.post(TOKEN_URL).mock(side_effect=[
            httpx.Response(200, json={"access_token": "old", "token_type": "bearer", "expires_in": 3600}),
            httpx.Response(200, json={"access_token": "new", "token_type": "bearer", "expires_in": 3600}),
        ])
        mock.get(url__startswith=POST_URL).mock(side_effect=[
            httpx.Response(401),
            httpx.Response(200, json={"data": {"children": [{"data": {"id": "1abc23x"}}]}}),
        ])
        out = reddit_mod.fetch_post("1abc23x")
        assert out["id"] == "1abc23x"
        assert token_route.call_count == 2  # forced refresh happened exactly once


def test_401_persists_after_single_refresh_maps_upstream():
    with respx.mock as mock:
        mock.post(TOKEN_URL).mock(side_effect=[
            httpx.Response(200, json={"access_token": "old", "token_type": "bearer", "expires_in": 3600}),
            httpx.Response(200, json={"access_token": "new", "token_type": "bearer", "expires_in": 3600}),
        ])
        mock.get(url__startswith=POST_URL).mock(side_effect=[
            httpx.Response(401),
            httpx.Response(401),
        ])
        with pytest.raises(AppError) as exc:
            reddit_mod.fetch_post("1abc23x")
    # A persistent 401 (not 404/403) falls through to upstream_error.
    assert exc.value.code == "upstream_error"


def test_token_fetch_failure_maps_upstream():
    with respx.mock as mock:
        mock.post(TOKEN_URL).mock(return_value=httpx.Response(200, json={"no_token": True}))
        with pytest.raises(AppError) as exc:
            reddit_mod.fetch_post("1abc23x")
    assert exc.value.code == "upstream_error"


def test_resolve_share_link_follows_redirect_to_post_id():
    with respx.mock as mock:
        _mock_token(mock)
        mock.get(SHARE_URL).mock(return_value=httpx.Response(
            302,
            headers={"location": "https://www.reddit.com/r/funny/comments/1abc23x/some_slug/"},
        ))
        assert reddit_mod.resolve_share_link(SHARE_URL) == "1abc23x"


def test_resolve_share_link_sends_bearer_and_no_follow():
    with respx.mock as mock:
        _mock_token(mock, token="tokS")
        route = mock.get(SHARE_URL).mock(return_value=httpx.Response(
            301, headers={"location": "https://www.reddit.com/comments/1abc23x"}))
        reddit_mod.resolve_share_link(SHARE_URL)
        req = route.calls.last.request
        assert req.headers["Authorization"] == "bearer tokS"


def test_resolve_share_link_no_redirect_maps_not_found():
    with respx.mock as mock:
        _mock_token(mock)
        mock.get(SHARE_URL).mock(return_value=httpx.Response(200))
        with pytest.raises(AppError) as exc:
            reddit_mod.resolve_share_link(SHARE_URL)
    assert exc.value.code == "not_found"


def test_resolve_share_link_non_post_location_maps_not_found():
    with respx.mock as mock:
        _mock_token(mock)
        mock.get(SHARE_URL).mock(return_value=httpx.Response(
            302, headers={"location": "https://www.reddit.com/r/funny/"}))
        with pytest.raises(AppError) as exc:
            reddit_mod.resolve_share_link(SHARE_URL)
    assert exc.value.code == "not_found"
