import httpx
import pytest
import respx

from app.errors import AppError
from app.extractor import extract, map_fxtwitter, map_vxtwitter

FX_VIDEO = {
    "code": 200,
    "tweet": {
        "text": "engine demo",
        "author": {"name": "Ada Lovelace", "screen_name": "ada", "avatar_url": "https://pbs.twimg.com/a.jpg"},
        "media": {"videos": [{
            "type": "video",
            "thumbnail_url": "https://pbs.twimg.com/thumb.jpg",
            "duration": 12.5,
            "variants": [
                {"url": "https://video.twimg.com/x/pl/y.m3u8", "bitrate": 0, "content_type": "application/x-mpegURL"},
                {"url": "https://video.twimg.com/x/vid/480x270/a.mp4?tag=12", "bitrate": 256000, "content_type": "video/mp4"},
                {"url": "https://video.twimg.com/x/vid/1920x1080/b.mp4?tag=12", "bitrate": 832000, "content_type": "video/mp4"},
            ],
        }]},
    },
}

FX_GIF = {
    "code": 200,
    "tweet": {
        "text": "loop",
        "author": {"name": "Ada", "screen_name": "ada"},
        "media": {"videos": [{
            "type": "gif",
            "thumbnail_url": "https://pbs.twimg.com/g.jpg",
            "variants": [
                {"url": "https://video.twimg.com/tweet_video/AAA.mp4", "bitrate": 0, "content_type": "video/mp4"},
            ],
        }]},
    },
}

FX_MULTI = {
    "code": 200,
    "tweet": {
        "text": "two clips",
        "author": {"name": "Ada", "screen_name": "ada"},
        "media": {"videos": [
            {"type": "video", "thumbnail_url": "https://pbs.twimg.com/t1.jpg", "duration": 5,
             "variants": [{"url": "https://video.twimg.com/x/vid/640x360/a.mp4", "bitrate": 1, "content_type": "video/mp4"}]},
            {"type": "video", "thumbnail_url": "https://pbs.twimg.com/t2.jpg", "duration": 8,
             "variants": [{"url": "https://video.twimg.com/x/vid/1280x720/b.mp4", "bitrate": 2, "content_type": "video/mp4"}]},
        ]},
    },
}

FX_NO_VIDEO = {"code": 200, "tweet": {"text": "photo", "author": {"name": "Ada", "screen_name": "ada"}, "media": {}}}

VX_VIDEO = {
    "user_name": "Ada Lovelace",
    "user_screen_name": "ada",
    "text": "engine demo",
    "media_extended": [
        {"type": "image", "url": "https://pbs.twimg.com/p.jpg"},
        {"type": "video", "url": "https://video.twimg.com/x/vid/1280x720/a.mp4",
         "thumbnail_url": "https://pbs.twimg.com/thumb.jpg", "duration_millis": 111278,
         "size": {"height": 720, "width": 1280}},
    ],
}


# ---- pure mapping tests (no network) ----

def test_map_fxtwitter_video():
    res = map_fxtwitter("111", FX_VIDEO)
    assert res.id == "111"
    assert res.author == "Ada Lovelace"
    assert res.handle == "ada"
    assert res.avatar_url == "https://pbs.twimg.com/a.jpg"
    assert res.text == "engine demo"
    assert len(res.items) == 1
    item = res.items[0]
    assert item.kind == "video"
    assert item.thumbnail == "https://pbs.twimg.com/thumb.jpg"
    assert item.duration_seconds == 12.5
    # HLS excluded, mp4 only, sorted best-first, resolution parsed from URL
    assert [v.label for v in item.variants] == ["1080p", "270p"]
    assert item.variants[0].width == 1920 and item.variants[0].height == 1080
    assert item.variants[0].url.endswith("/1920x1080/b.mp4?tag=12")


def test_map_fxtwitter_gif():
    res = map_fxtwitter("222", FX_GIF)
    assert res.items[0].kind == "gif"
    assert res.items[0].variants[0].label == "video"  # no WxH in a tweet_video gif url


def test_map_fxtwitter_multi():
    res = map_fxtwitter("333", FX_MULTI)
    assert [i.index for i in res.items] == [1, 2]
    assert res.items[1].variants[0].label == "720p"


def test_map_fxtwitter_no_video_raises():
    with pytest.raises(AppError) as exc:
        map_fxtwitter("444", FX_NO_VIDEO)
    assert exc.value.code == "no_video"


def test_map_fxtwitter_not_found():
    with pytest.raises(AppError) as exc:
        map_fxtwitter("1", {"code": 404, "message": "NOT_FOUND"})
    assert exc.value.code == "not_found"


def test_map_fxtwitter_private():
    with pytest.raises(AppError) as exc:
        map_fxtwitter("1", {"code": 401, "message": "PRIVATE_TWEET"})
    assert exc.value.code == "private_or_restricted"


def test_map_fxtwitter_bad_code_upstream():
    with pytest.raises(AppError) as exc:
        map_fxtwitter("1", {"code": 500, "message": "API_FAIL"})
    assert exc.value.code == "upstream_error"


def test_map_vxtwitter_video():
    res = map_vxtwitter("111", VX_VIDEO)
    assert res.author == "Ada Lovelace"
    assert res.handle == "ada"
    # image skipped; one video item, single variant, duration ms->s, height from size
    assert len(res.items) == 1
    v = res.items[0].variants[0]
    assert v.label == "720p" and v.height == 720
    assert res.items[0].duration_seconds == pytest.approx(111.278)


def test_map_vxtwitter_no_video_raises():
    with pytest.raises(AppError) as exc:
        map_vxtwitter("1", {"user_screen_name": "ada", "media_extended": []})
    assert exc.value.code == "no_video"


def test_map_fxtwitter_skips_non_dict_elements():
    body = {"code": 200, "tweet": {"text": "", "author": {"name": "Ada", "screen_name": "ada"},
        "media": {"videos": [None, "junk",
            {"type": "video", "variants": ["bad", {"url": "https://video.twimg.com/x/vid/640x360/a.mp4", "bitrate": 1, "content_type": "video/mp4"}]}]}}}
    res = map_fxtwitter("1", body)
    assert len(res.items) == 1
    assert res.items[0].variants[0].label == "360p"


def test_map_fxtwitter_dense_index_when_earlier_item_skipped():
    # first video has only an HLS variant (no usable mp4) -> skipped; second is the only real item -> index 1
    body = {"code": 200, "tweet": {"text": "", "author": {"name": "Ada", "screen_name": "ada"},
        "media": {"videos": [
            {"type": "video", "variants": [{"url": "https://video.twimg.com/x/pl/y.m3u8", "bitrate": 0, "content_type": "application/x-mpegURL"}]},
            {"type": "video", "variants": [{"url": "https://video.twimg.com/x/vid/1280x720/b.mp4", "bitrate": 2, "content_type": "video/mp4"}]}]}}}
    res = map_fxtwitter("1", body)
    assert [i.index for i in res.items] == [1]
    assert res.items[0].variants[0].label == "720p"


def test_map_vxtwitter_skips_non_dict_media():
    body = {"user_name": "Ada", "user_screen_name": "ada", "text": "",
        "media_extended": [None, {"type": "video", "url": "https://video.twimg.com/x/vid/1280x720/a.mp4", "size": {"height": 720, "width": 1280}}]}
    res = map_vxtwitter("1", body)
    assert len(res.items) == 1 and res.items[0].variants[0].label == "720p"


# ---- extract() network orchestration (respx-mocked) ----

@respx.mock
def test_extract_uses_fxtwitter():
    respx.get("https://api.fxtwitter.com/i/status/111").mock(return_value=httpx.Response(200, json=FX_VIDEO))
    res = extract("111")
    assert res.handle == "ada"
    assert res.items[0].variants[0].label == "1080p"


@respx.mock
def test_extract_falls_back_to_vxtwitter_on_transport_error():
    respx.get("https://api.fxtwitter.com/i/status/111").mock(side_effect=httpx.ConnectError("down"))
    respx.get("https://api.vxtwitter.com/i/status/111").mock(return_value=httpx.Response(200, json=VX_VIDEO))
    res = extract("111")
    assert res.items[0].variants[0].label == "720p"  # came from vxtwitter


@respx.mock
def test_extract_does_not_fall_back_on_not_found():
    # fxtwitter gives a definitive 404 body; vxtwitter must NOT be called
    fx = respx.get("https://api.fxtwitter.com/i/status/1").mock(
        return_value=httpx.Response(404, json={"code": 404, "message": "NOT_FOUND"}))
    vx = respx.get("https://api.vxtwitter.com/i/status/1").mock(return_value=httpx.Response(200, json=VX_VIDEO))
    with pytest.raises(AppError) as exc:
        extract("1")
    assert exc.value.code == "not_found"
    assert fx.called and not vx.called


@respx.mock
def test_extract_both_fail_raises_upstream():
    respx.get("https://api.fxtwitter.com/i/status/1").mock(side_effect=httpx.ConnectError("down"))
    respx.get("https://api.vxtwitter.com/i/status/1").mock(side_effect=httpx.ConnectError("down"))
    with pytest.raises(AppError) as exc:
        extract("1")
    assert exc.value.code == "upstream_error"
