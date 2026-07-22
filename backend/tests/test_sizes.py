import httpx
import respx

from app.schemas import MediaItem, ResolveResponse, Variant
from app.sizes import fill_sizes


def _resp() -> ResolveResponse:
    return ResolveResponse(
        id="1", author="A", handle="a",
        items=[MediaItem(index=1, kind="video", variants=[
            Variant(label="1080p", url="https://video.twimg.com/v/1080.mp4"),
            Variant(label="360p", url="https://video.twimg.com/v/360.mp4"),
        ])],
    )


@respx.mock
def test_fills_sizes():
    respx.head("https://video.twimg.com/v/1080.mp4").mock(
        return_value=httpx.Response(200, headers={"content-length": "35651584"}))
    respx.head("https://video.twimg.com/v/360.mp4").mock(
        return_value=httpx.Response(200, headers={"content-length": "1048576"}))
    resp = _resp()
    fill_sizes(resp)
    assert resp.items[0].variants[0].size_bytes == 35651584
    assert resp.items[0].variants[1].size_bytes == 1048576


@respx.mock
def test_failure_leaves_none():
    respx.head("https://video.twimg.com/v/1080.mp4").mock(side_effect=httpx.ConnectError("boom"))
    respx.head("https://video.twimg.com/v/360.mp4").mock(return_value=httpx.Response(200))
    resp = _resp()
    fill_sizes(resp)
    assert resp.items[0].variants[0].size_bytes is None
    assert resp.items[0].variants[1].size_bytes is None


@respx.mock
def test_prefilled_sizes_survive():
    # TikTok variants arrive with size_bytes from the API; fill_sizes must not
    # overwrite them or waste a HEAD request. Only the None variant is mocked,
    # so a HEAD against the prefilled URL would raise on the unmocked route.
    respx.head("https://video.twimg.com/v/360.mp4").mock(
        return_value=httpx.Response(200, headers={"content-length": "1048576"}))
    resp = _resp()
    resp.items[0].variants[0].size_bytes = 999
    fill_sizes(resp)
    assert resp.items[0].variants[0].size_bytes == 999
    assert resp.items[0].variants[1].size_bytes == 1048576


@respx.mock
def test_malformed_content_length_leaves_none():
    respx.head("https://video.twimg.com/v/1080.mp4").mock(
        return_value=httpx.Response(200, headers={"content-length": "abc"}))
    respx.head("https://video.twimg.com/v/360.mp4").mock(
        return_value=httpx.Response(200, headers={"content-length": "1048576"}))
    resp = _resp()
    fill_sizes(resp)
    assert resp.items[0].variants[0].size_bytes is None
    assert resp.items[0].variants[1].size_bytes == 1048576


def test_fill_sizes_skips_image_and_audio_kinds(respx_mock=None):
    import respx
    from app.schemas import MediaItem, ResolveResponse, Variant
    from app.sizes import fill_sizes
    resp = ResolveResponse(id="1", author="a", handle="h", avatar_url=None, text="", items=[
        MediaItem(index=1, kind="image", thumbnail=None, duration_seconds=None,
                  variants=[Variant(label="photo", url="https://p16-sign.tiktokcdn-us.com/i.jpeg")]),
        MediaItem(index=2, kind="audio", thumbnail=None, duration_seconds=None,
                  variants=[Variant(label="sound", url="https://www.tikwm.com/m.mp3")]),
    ])
    with respx.mock:  # no routes registered: any HEAD would raise
        fill_sizes(resp)
    assert resp.items[0].variants[0].size_bytes is None
    assert resp.items[1].variants[0].size_bytes is None
