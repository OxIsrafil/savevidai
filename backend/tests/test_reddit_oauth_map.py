"""Pure-mapper tests for the OAuth Reddit path (no network, fixture dicts)."""
import pytest

from app.errors import AppError
from app.reddit import _map_oauth_guarded, map_reddit_oauth

# Hosted video with sound, 1080 source -> full ladder, /api/mux/ urls.
VIDEO_POST = {
    "id": "1vid00",
    "author": "videoguy",
    "title": "a hosted video",
    "is_video": True,
    "secure_media": {"reddit_video": {
        "fallback_url": "https://v.redd.it/abcd1234efgh/DASH_1080.mp4?source=fallback",
        "height": 1080,
        "has_audio": True,
        "duration": 30,
    }},
}

# Silent hosted video, 480 source -> partial ladder, direct v.redd.it urls.
VIDEO_NO_AUDIO_POST = {
    "id": "1sil00",
    "author": "quietone",
    "title": "no sound",
    "is_video": True,
    "secure_media": {"reddit_video": {
        "fallback_url": "https://v.redd.it/silid5678zz/DASH_480.mp4?source=fallback",
        "height": 480,
        "has_audio": False,
    }},
}

# Gallery (TikTok-slideshow shape): 4 gallery items, one non-valid (skipped),
# extensions derived from media_metadata "m" (jpg/png/jpeg->jpg).
GALLERY_POST = {
    "id": "1gal00",
    "author": "galer",
    "title": "my gallery",
    "is_gallery": True,
    "gallery_data": {"items": [
        {"media_id": "aaa111", "id": 1},
        {"media_id": "bbb222", "id": 2},
        {"media_id": "ccc333", "id": 3},
        {"media_id": "ddd444", "id": 4},
    ]},
    "media_metadata": {
        "aaa111": {"status": "valid", "e": "Image", "m": "image/jpg"},
        "bbb222": {"status": "valid", "e": "Image", "m": "image/png"},
        "ccc333": {"status": "failed", "m": "image/jpg"},
        "ddd444": {"status": "valid", "e": "Image", "m": "image/jpeg"},
    },
}

# Single image on i.redd.it.
IMAGE_POST = {
    "id": "1img00",
    "author": "picguy",
    "title": "a still",
    "post_hint": "image",
    "url_overridden_by_dest": "https://i.redd.it/xyz789abc.jpg",
}

# Single image whose dest is a foreign host: must be refused (host-gate).
FOREIGN_IMAGE_POST = {
    "id": "1for00",
    "author": "sneaky",
    "title": "not reddit",
    "post_hint": "image",
    "url_overridden_by_dest": "https://evil.example.com/pic.jpg",
}

# GIF via preview.reddit_video_preview -> no-audio (direct) video treatment.
GIF_POST = {
    "id": "1gif00",
    "author": "gifer",
    "title": "a gif",
    "is_gif": True,
    "preview": {"reddit_video_preview": {
        "fallback_url": "https://v.redd.it/gifid1234/DASH_360.mp4",
        "height": 360,
        "is_gif": True,
    }},
}

# Nothing downloadable.
TEXT_POST = {"id": "1txt00", "author": "writer", "title": "just text", "is_self": True}


def test_video_ladder_and_mux_urls():
    resp = map_reddit_oauth("1vid00", VIDEO_POST)
    assert len(resp.items) == 1
    item = resp.items[0]
    assert item.kind == "video"
    assert item.duration_seconds == 30
    assert [v.label for v in item.variants] == ["1080p", "720p", "480p", "360p", "240p"]
    assert [v.height for v in item.variants] == [1080, 720, 480, 360, 240]
    assert item.variants[0].url == "/api/mux/abcd1234efgh/1080.mp4"
    assert item.variants[-1].url == "/api/mux/abcd1234efgh/240.mp4"


def test_video_ladder_filtered_to_source_height():
    resp = map_reddit_oauth("1sil00", VIDEO_NO_AUDIO_POST)
    item = resp.items[0]
    # 480 source -> ladder capped at 480; no 1080/720.
    assert [v.label for v in item.variants] == ["480p", "360p", "240p"]
    # No audio -> direct v.redd.it DASH urls, never /api/mux.
    assert item.variants[0].url == "https://v.redd.it/silid5678zz/DASH_480.mp4"
    assert all("/api/mux/" not in v.url for v in item.variants)


def test_video_handle_and_author():
    resp = map_reddit_oauth("1vid00", VIDEO_POST)
    assert resp.handle == "videoguy"
    assert resp.author == "u/videoguy"
    assert resp.id == "1vid00"
    assert resp.text == "a hosted video"
    assert resp.avatar_url is None


def test_gallery_items_ext_derivation_and_invalid_skipped():
    resp = map_reddit_oauth("1gal00", GALLERY_POST)
    urls = [it.variants[0].url for it in resp.items]
    assert urls == [
        "https://i.redd.it/aaa111.jpg",
        "https://i.redd.it/bbb222.png",
        "https://i.redd.it/ddd444.jpg",  # jpeg -> jpg, ccc333 (failed) skipped
    ]
    assert [it.index for it in resp.items] == [1, 2, 3]
    assert all(it.kind == "image" for it in resp.items)


def test_single_image_host_gated_ok():
    resp = map_reddit_oauth("1img00", IMAGE_POST)
    assert len(resp.items) == 1
    assert resp.items[0].kind == "image"
    assert resp.items[0].variants[0].label == "photo"
    assert resp.items[0].variants[0].url == "https://i.redd.it/xyz789abc.jpg"


def test_single_image_foreign_host_refused():
    with pytest.raises(AppError) as exc:
        map_reddit_oauth("1for00", FOREIGN_IMAGE_POST)
    assert exc.value.code == "no_video"


def test_gif_no_audio_direct_urls():
    resp = map_reddit_oauth("1gif00", GIF_POST)
    item = resp.items[0]
    assert item.kind == "gif"
    assert [v.label for v in item.variants] == ["360p", "240p"]
    assert item.variants[0].url == "https://v.redd.it/gifid1234/DASH_360.mp4"
    assert all("/api/mux/" not in v.url for v in item.variants)


def test_text_post_maps_no_video():
    with pytest.raises(AppError) as exc:
        map_reddit_oauth("1txt00", TEXT_POST)
    assert exc.value.code == "no_video"


def test_guard_wraps_unexpected_shape_as_upstream():
    # secure_media is a truthy non-dict: the mapper will AttributeError, which
    # the guard must convert into a clean upstream_error rather than a 500.
    bad = {"id": "x", "author": "a", "title": "t", "is_video": True, "secure_media": "boom"}
    with pytest.raises(AppError) as exc:
        _map_oauth_guarded("x", bad)
    assert exc.value.code == "upstream_error"


def test_guard_passes_domain_errors_through():
    with pytest.raises(AppError) as exc:
        _map_oauth_guarded("1txt00", TEXT_POST)
    assert exc.value.code == "no_video"
