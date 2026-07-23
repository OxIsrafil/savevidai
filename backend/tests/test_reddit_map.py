import httpx
import pytest
import respx

from app.errors import AppError
from app.reddit import (
    REDDIT_MEDIA_HOSTS,
    Manifest,
    Rendition,
    _map_guarded,
    extract_reddit,
    is_configured,
    map_reddit_vx,
)
from app.schemas import ResolveResponse

# The four-rendition + audio manifest for id enxxsuo5xko31 (mirrors the real
# OLD_MPD shape), built directly so the mapper is exercised as a pure function.
FOUR_WITH_AUDIO = Manifest(
    videos=[
        Rendition(height=720, width=404, base_url="DASH_720"),
        Rendition(height=480, width=270, base_url="DASH_480"),
        Rendition(height=360, width=202, base_url="DASH_360"),
        Rendition(height=240, width=134, base_url="DASH_240"),
    ],
    audio_base="audio",
)

# A silent clip: one video rendition, no audio track. The extensionless real
# base_url must survive verbatim into the direct v.redd.it URL.
VIDEO_ONLY = Manifest(
    videos=[Rendition(height=720, width=1280, base_url="DASH_720")],
    audio_base=None,
)

VIDEO_VX = {
    "title": "laser crocs",
    "author": "Dynna13337",
    "subreddit": "funny",
    "og_type": "video.other",
    "vredd_id": "enxxsuo5xko31",
    "image_url": "https://external-preview.redd.it/whatever.png",
}

IMAGE_VX = {
    "title": "a still image",
    "author": "somebody",
    "subreddit": "pics",
    "og_type": "website",
    "vredd_id": None,
    "image_url": "https://i.redd.it/abc123def456.jpg",
}


def test_video_post_four_variants_with_mux_urls():
    resp = map_reddit_vx("d8qo81", VIDEO_VX, FOUR_WITH_AUDIO)
    assert isinstance(resp, ResolveResponse)
    assert len(resp.items) == 1
    item = resp.items[0]
    assert item.kind == "video"
    assert item.index == 1
    assert item.duration_seconds is None
    assert item.thumbnail is None
    assert [(v.label, v.width, v.height, v.url) for v in item.variants] == [
        ("720p", 404, 720, "/api/mux/enxxsuo5xko31/720.mp4"),
        ("480p", 270, 480, "/api/mux/enxxsuo5xko31/480.mp4"),
        ("360p", 202, 360, "/api/mux/enxxsuo5xko31/360.mp4"),
        ("240p", 134, 240, "/api/mux/enxxsuo5xko31/240.mp4"),
    ]


def test_no_audio_manifest_yields_direct_vreddit_urls():
    resp = map_reddit_vx("d8qo81", VIDEO_VX, VIDEO_ONLY)
    variant = resp.items[0].variants[0]
    # Extensionless real base_url preserved verbatim; no /api/mux indirection.
    assert variant.url == "https://v.redd.it/enxxsuo5xko31/DASH_720"
    assert variant.label == "720p"
    assert variant.width == 1280
    assert variant.height == 720


def test_image_post_mapped_as_photo():
    resp = map_reddit_vx("img1", IMAGE_VX, None)
    assert len(resp.items) == 1
    item = resp.items[0]
    assert item.kind == "image"
    assert item.index == 1
    assert [(v.label, v.url) for v in item.variants] == [
        ("photo", "https://i.redd.it/abc123def456.jpg")
    ]


def test_foreign_image_host_is_unsupported_not_mapped():
    evil = {**IMAGE_VX, "image_url": "https://evil.example.com/abc123def456.jpg"}
    with pytest.raises(AppError) as exc:
        map_reddit_vx("img1", evil, None)
    assert exc.value.code == "unsupported_post"


def test_lookalike_image_host_is_unsupported():
    # "evilredd.it" ends with "redd.it" but not ".redd.it": must be rejected.
    evil = {**IMAGE_VX, "image_url": "https://evilredd.it/abc123def456.jpg"}
    with pytest.raises(AppError) as exc:
        map_reddit_vx("img1", evil, None)
    assert exc.value.code == "unsupported_post"


def test_redd_it_suffix_image_host_allowed():
    ok = {**IMAGE_VX, "image_url": "https://preview.redd.it/pic.png"}
    resp = map_reddit_vx("img1", ok, None)
    assert resp.items[0].kind == "image"


def test_no_media_at_all_is_unsupported():
    empty = {"title": "text post", "author": "a", "subreddit": "s",
             "og_type": "website", "vredd_id": None, "image_url": None}
    with pytest.raises(AppError) as exc:
        map_reddit_vx("txt1", empty, None)
    assert exc.value.code == "unsupported_post"


def test_handle_and_author_contract():
    resp = map_reddit_vx("d8qo81", VIDEO_VX, FOUR_WITH_AUDIO)
    assert resp.handle == "Dynna13337"
    assert resp.author == "u/Dynna13337"
    assert resp.text == "laser crocs"
    assert resp.id == "d8qo81"
    assert resp.avatar_url is None


def test_missing_author_falls_back_to_unknown():
    anon = {**VIDEO_VX, "author": None}
    resp = map_reddit_vx("d8qo81", anon, FOUR_WITH_AUDIO)
    assert resp.handle == "unknown"
    assert resp.author == "u/unknown"


def test_guard_wraps_malformed_shape_as_upstream():
    # A non-Manifest object in the video branch raises AttributeError on .videos;
    # the guard must convert that into a clean upstream_error, not a 500.
    with pytest.raises(AppError) as exc:
        _map_guarded("d8qo81", VIDEO_VX, "not-a-manifest")
    assert exc.value.code == "upstream_error"


def test_guard_passes_through_video_mapping():
    resp = _map_guarded("d8qo81", VIDEO_VX, FOUR_WITH_AUDIO)
    assert resp.items[0].kind == "video"


def test_reddit_media_hosts_exported():
    assert REDDIT_MEDIA_HOSTS == ("redd.it",)


def test_is_configured_requires_both_keys(monkeypatch):
    monkeypatch.delenv("REDDIT_CLIENT_ID", raising=False)
    monkeypatch.delenv("REDDIT_CLIENT_SECRET", raising=False)
    assert is_configured() is False
    monkeypatch.setenv("REDDIT_CLIENT_ID", "id")
    assert is_configured() is False
    monkeypatch.setenv("REDDIT_CLIENT_SECRET", "secret")
    assert is_configured() is True


@respx.mock
def test_extract_reddit_anonymous_video_end_to_end(monkeypatch):
    monkeypatch.delenv("REDDIT_CLIENT_ID", raising=False)
    monkeypatch.delenv("REDDIT_CLIENT_SECRET", raising=False)
    from tests.test_reddit_vx import REAL_VX
    from tests.test_reddit_manifest import OLD_MPD
    respx.get("https://www.vxreddit.com/comments/d8qo81").mock(
        return_value=httpx.Response(200, text=REAL_VX))
    respx.get("https://v.redd.it/enxxsuo5xko31/DASHPlaylist.mpd").mock(
        return_value=httpx.Response(200, text=OLD_MPD))
    resp = extract_reddit(("post", "d8qo81", "/comments/d8qo81"))
    assert resp.items[0].kind == "video"
    assert len(resp.items[0].variants) == 4
    assert resp.items[0].variants[0].url == "/api/mux/enxxsuo5xko31/720.mp4"
    assert resp.handle == "Dynna13337"


@respx.mock
def test_extract_reddit_anonymous_image_end_to_end(monkeypatch):
    monkeypatch.delenv("REDDIT_CLIENT_ID", raising=False)
    monkeypatch.delenv("REDDIT_CLIENT_SECRET", raising=False)
    from tests.test_reddit_vx import IMAGE_POST
    respx.get("https://www.vxreddit.com/comments/img1").mock(
        return_value=httpx.Response(200, text=IMAGE_POST))
    resp = extract_reddit(("post", "img1", "/comments/img1"))
    assert resp.items[0].kind == "image"
    assert resp.items[0].variants[0].url == "https://i.redd.it/abc123def456.jpg"


@respx.mock
def test_extract_reddit_share_failure_maps_not_found(monkeypatch):
    monkeypatch.delenv("REDDIT_CLIENT_ID", raising=False)
    monkeypatch.delenv("REDDIT_CLIENT_SECRET", raising=False)
    # A share link anonymously returns a redirect (follow_redirects=False), so
    # fetch_vx fails; the share path translates that to a clean not_found.
    respx.get("https://www.vxreddit.com/r/funny/s/abc123").mock(
        return_value=httpx.Response(302, headers={"location": "https://www.reddit.com/x"}))
    with pytest.raises(AppError) as exc:
        extract_reddit(("share", "https://www.reddit.com/r/funny/s/abc123", "/r/funny/s/abc123"))
    assert exc.value.code == "not_found"


@respx.mock
def test_extract_reddit_uses_oauth_when_configured(monkeypatch):
    import app.reddit as reddit_mod
    monkeypatch.setenv("REDDIT_CLIENT_ID", "id")
    monkeypatch.setenv("REDDIT_CLIENT_SECRET", "secret")
    reddit_mod._token_cache.clear()
    # Configured -> OAuth path. Only the OAuth token + post endpoints are mocked;
    # any anonymous vxreddit call would raise (respx errors on unexpected hosts),
    # proving the anonymous path is not taken.
    respx.post("https://www.reddit.com/api/v1/access_token").mock(
        return_value=httpx.Response(200, json={
            "access_token": "tok", "token_type": "bearer", "expires_in": 3600}))
    respx.get(url__startswith="https://oauth.reddit.com/comments/d8qo81").mock(
        return_value=httpx.Response(200, json={"data": {"children": [{"data": {
            "id": "d8qo81", "author": "someone", "title": "hi",
            "post_hint": "image", "url_overridden_by_dest": "https://i.redd.it/pic1.jpg",
        }}]}}))
    resp = extract_reddit(("post", "d8qo81", "/comments/d8qo81"))
    assert resp.handle == "someone"
    assert resp.items[0].variants[0].url == "https://i.redd.it/pic1.jpg"
