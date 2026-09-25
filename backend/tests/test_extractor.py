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


FX_404 = {"code": 404, "message": "NOT_FOUND", "tweet": None}


def _fx_cached_404_then(uncached_body: dict):
    """fxtwitter's edge serves a stale 404 for the plain URL; a cache-busting
    query reaches the worker and gets `uncached_body`."""
    def respond(request: httpx.Request) -> httpx.Response:
        if request.url.query:
            return httpx.Response(200, json=uncached_body)
        return httpx.Response(404, json=FX_404)
    return respond


@respx.mock
def test_extract_rechecks_a_not_found_past_the_fxtwitter_cache():
    # Since 2026-09-15 fxtwitter 404s live posts (FxEmbed #2490) and caches the
    # 404; a fresh request past the cache finds the post in full quality.
    fx = respx.get("https://api.fxtwitter.com/i/status/1").mock(
        side_effect=_fx_cached_404_then(FX_VIDEO))
    vx = respx.get("https://api.vxtwitter.com/i/status/1").mock(
        return_value=httpx.Response(200, json=VX_VIDEO))
    res = extract("1")
    assert res.items[0].variants[0].label == "1080p"  # fxtwitter quality, not vxtwitter's
    assert fx.call_count == 2 and not vx.called


@respx.mock
def test_extract_falls_back_to_vxtwitter_when_fxtwitter_keeps_saying_not_found():
    respx.get("https://api.fxtwitter.com/i/status/1").mock(
        return_value=httpx.Response(404, json=FX_404))
    respx.get("https://api.vxtwitter.com/i/status/1").mock(
        return_value=httpx.Response(200, json=VX_VIDEO))
    res = extract("1")
    assert res.items[0].variants[0].label == "720p"  # came from vxtwitter


@respx.mock
def test_extract_reports_not_found_only_when_every_source_agrees():
    fx = respx.get("https://api.fxtwitter.com/i/status/1").mock(
        return_value=httpx.Response(404, json=FX_404))
    vx = respx.get("https://api.vxtwitter.com/i/status/1").mock(
        return_value=httpx.Response(404, text="<html>not found</html>"))
    with pytest.raises(AppError) as exc:
        extract("1")
    assert exc.value.code == "not_found"
    assert fx.call_count == 2 and vx.call_count == 1


@respx.mock
def test_extract_recheck_keeps_no_video_and_private_answers():
    respx.get("https://api.fxtwitter.com/i/status/1").mock(
        side_effect=_fx_cached_404_then(FX_NO_VIDEO))
    vx = respx.get("https://api.vxtwitter.com/i/status/1").mock(
        return_value=httpx.Response(200, json=VX_VIDEO))
    with pytest.raises(AppError) as exc:
        extract("1")
    assert exc.value.code == "no_video" and not vx.called
    respx.get("https://api.fxtwitter.com/i/status/2").mock(
        side_effect=_fx_cached_404_then({"code": 401, "message": "PRIVATE_TWEET"}))
    with pytest.raises(AppError) as exc:
        extract("2")
    assert exc.value.code == "private_or_restricted"


@respx.mock
def test_extract_not_found_when_vxtwitter_is_down_too():
    respx.get("https://api.fxtwitter.com/i/status/1").mock(
        return_value=httpx.Response(404, json=FX_404))
    respx.get("https://api.vxtwitter.com/i/status/1").mock(side_effect=httpx.ConnectError("down"))
    with pytest.raises(AppError) as exc:
        extract("1")
    assert exc.value.code == "not_found"


@respx.mock
def test_extract_recheck_logs_the_outcome_but_never_the_post(caplog):
    # The recheck log is the aggregate signal for how many 404s were false. It
    # must not name the post: app logs sit next to access logs that hold IPs.
    caplog.set_level("DEBUG", logger="savevidai.extractor")
    tid = "2103009452026962290"
    respx.get(f"https://api.fxtwitter.com/i/status/{tid}").mock(
        return_value=httpx.Response(404, json=FX_404))
    respx.get(f"https://api.vxtwitter.com/i/status/{tid}").mock(
        return_value=httpx.Response(404, text="<html>not found</html>"))
    with pytest.raises(AppError):
        extract(tid)
    messages = [r.getMessage() for r in caplog.records]
    assert any("twitter 404 recheck" in m for m in messages)
    assert not any(tid in m for m in messages)


@respx.mock
def test_extract_both_fail_raises_upstream():
    respx.get("https://api.fxtwitter.com/i/status/1").mock(side_effect=httpx.ConnectError("down"))
    respx.get("https://api.vxtwitter.com/i/status/1").mock(side_effect=httpx.ConnectError("down"))
    with pytest.raises(AppError) as exc:
        extract("1")
    assert exc.value.code == "upstream_error"


@respx.mock
def test_extract_survives_scalar_tweet_container():
    respx.get("https://api.fxtwitter.com/i/status/1").mock(
        return_value=httpx.Response(200, json={"code": 200, "tweet": "x"}))
    respx.get("https://api.vxtwitter.com/i/status/1").mock(
        return_value=httpx.Response(200, json=VX_VIDEO))
    # malformed fx container -> clean upstream classification -> vx fallback succeeds
    res = extract("1")
    assert res.items[0].variants[0].label == "720p"


@respx.mock
def test_extract_survives_scalar_media_container_both_sources():
    respx.get("https://api.fxtwitter.com/i/status/1").mock(
        return_value=httpx.Response(200, json={"code": 200, "tweet": {"media": "x", "author": {}}}))
    respx.get("https://api.vxtwitter.com/i/status/1").mock(
        return_value=httpx.Response(200, json={"user_screen_name": "a", "media_extended": "junk"}))
    with pytest.raises(AppError) as exc:
        extract("1")
    assert exc.value.code == "upstream_error"
