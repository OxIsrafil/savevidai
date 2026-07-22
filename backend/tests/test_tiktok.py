import pytest

from app.errors import AppError
from app.tiktok import _map_guarded, map_tiktok

OK = {
    "code": 0,
    "data": {
        "id": "7280000000000000000",
        "title": "a caption",
        "cover": "https://p19-common-sign.tiktokcdn-us.com/cover/x.jpg",
        "duration": 15,
        "play": "https://v16m.tiktokcdn-us.com/video/play/x.mp4",
        "hdplay": "https://v16m-default.tiktokcdn-us.com/video/hdplay/x.mp4",
        "wmplay": "https://v16m.tiktokcdn-us.com/video/wmplay/x.mp4",
        "size": 2953029,
        "hd_size": 2004627,
        "author": {
            "unique_id": "user",
            "nickname": "User Name",
            "avatar": "https://p19-common-sign.tiktokcdn-us.com/a.jpg",
        },
    },
}
NO_VID = {"code": 0, "data": {"id": "1", "title": "", "author": {"unique_id": "u", "nickname": "U"}}}
ERR = {"code": -1, "msg": "url parse err"}
# author is a truthy non-dict (string). `data.get("author") or {}` keeps it, so a
# later author.get(...) would raise AttributeError and escape as an unhandled 500.
BAD_AUTHOR = {
    "code": 0,
    "data": {
        "id": "1",
        "title": "t",
        "hdplay": "https://v16m.tiktokcdn-us.com/video/hdplay/x.mp4",
        "hd_size": 100,
        "author": "someone",
    },
}
# hd_size variants that must degrade to size_bytes is None via _size().
NO_HD_SIZE = {
    "code": 0,
    "data": {
        "id": "1",
        "title": "t",
        "hdplay": "https://v16m.tiktokcdn-us.com/video/hdplay/x.mp4",
        "author": {"unique_id": "u", "nickname": "U"},
    },
}


def test_map_ok_prefers_no_watermark_hd_then_sd():
    res = map_tiktok("7280000000000000000", OK)
    assert res.handle == "user"
    assert res.author == "User Name"
    assert res.text == "a caption"
    assert res.items[0].kind == "video"
    assert res.items[0].duration_seconds == 15
    labels = [v.label for v in res.items[0].variants]
    assert labels == ["hd", "sd"]
    # watermarked url is never present
    assert all("wmplay" not in v.url for v in res.items[0].variants)
    assert res.items[0].variants[0].url.endswith("/hdplay/x.mp4")


def test_map_ok_sets_sizes_from_response():
    res = map_tiktok("7280000000000000000", OK)
    hd, sd = res.items[0].variants
    assert hd.size_bytes == 2004627  # from hd_size
    assert sd.size_bytes == 2953029  # from size


def test_map_no_video_raises():
    with pytest.raises(AppError) as exc:
        map_tiktok("1", NO_VID)
    assert exc.value.code == "no_video"


def test_map_error_code_raises_upstream():
    with pytest.raises(AppError) as exc:
        map_tiktok("1", ERR)
    assert exc.value.code in ("upstream_error", "not_found")


def test_map_raw_attributeerror_on_bad_author():
    # RED before the guard: a truthy non-dict author leaks AttributeError.
    with pytest.raises(AttributeError):
        map_tiktok("1", BAD_AUTHOR)


def test_guarded_truthy_non_dict_author_becomes_upstream():
    # Regression for finding 1: the guard converts the raw AttributeError into a
    # clean upstream_error instead of an unhandled 500.
    with pytest.raises(AppError) as exc:
        _map_guarded("1", BAD_AUTHOR)
    assert exc.value.code == "upstream_error"


@pytest.mark.parametrize("hd_size", [0, -5, "2004627", 3.5, None, ...])
def test_size_none_branch_when_hd_size_not_positive_int(hd_size):
    body = {"code": 0, "data": dict(NO_HD_SIZE["data"])}
    if hd_size is not ...:
        body["data"]["hd_size"] = hd_size
    res = map_tiktok("1", body)
    assert res.items[0].variants[0].label == "hd"
    assert res.items[0].variants[0].size_bytes is None


SLIDESHOW = {
    "code": 0,
    "data": {
        "id": "7300000000000000000",
        "title": "a slideshow",
        "duration": 0,
        "images": [
            "https://p16-sign.tiktokcdn-us.com/img1.jpeg",
            "https://p16-sign.tiktokcdn-us.com/img2.jpeg",
            "https://p16-sign.tiktokcdn-us.com/img3.jpeg",
        ],
        "music": "https://sf16-sign.tiktokcdn-us.com/obj/tos-alisg-ve-2774/sound",
        "play": "https://sf16-sign.tiktokcdn-us.com/obj/tos-alisg-ve-2774/sound",
        "hdplay": "https://sf16-sign.tiktokcdn-us.com/obj/tos-alisg-ve-2774/sound",
        "wmplay": "https://sf16-sign.tiktokcdn-us.com/obj/tos-alisg-ve-2774/sound",
        "author": {"unique_id": "user", "nickname": "User Name", "avatar": "https://p19.tiktokcdn-us.com/a.jpg"},
    },
}


def test_map_slideshow_photos_and_sound_never_video():
    res = map_tiktok("7300000000000000000", SLIDESHOW)
    kinds = [(i.index, i.kind) for i in res.items]
    assert kinds == [(1, "image"), (2, "image"), (3, "image"), (4, "audio")]
    photo = res.items[0]
    assert photo.variants[0].label == "photo"
    assert photo.variants[0].url == "https://p16-sign.tiktokcdn-us.com/img1.jpeg"
    assert photo.thumbnail == photo.variants[0].url
    audio = res.items[3]
    assert audio.variants[0].label == "sound"
    # play/hdplay/wmplay duplicate the soundtrack on photo posts; never offered as video
    assert all(i.kind != "video" for i in res.items)


def test_map_slideshow_without_music():
    body = {"code": 0, "data": {**SLIDESHOW["data"]}}
    for k in ("music", "play", "hdplay", "wmplay"):
        body["data"].pop(k, None)
    res = map_tiktok("1", body)
    assert [i.kind for i in res.items] == ["image", "image", "image"]


def test_map_slideshow_empty_images_no_video_raises():
    body = {"code": 0, "data": {"id": "1", "title": "", "images": [],
            "author": {"unique_id": "u", "nickname": "U"}}}
    with pytest.raises(AppError) as exc:
        map_tiktok("1", body)
    assert exc.value.code == "no_video"


def test_map_slideshow_skips_non_https_images():
    body = {"code": 0, "data": {**SLIDESHOW["data"],
            "images": ["http://evil/img.jpg", "https://p16-sign.tiktokcdn-us.com/ok.jpeg"]}}
    res = map_tiktok("1", body)
    images = [i for i in res.items if i.kind == "image"]
    assert len(images) == 1
