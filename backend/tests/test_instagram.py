import base64
import json

import pytest

from app.errors import AppError
from app.instagram import _map_guarded, map_instagram

SC = "DbKoX9xTgPz"
EFG = base64.b64encode(json.dumps({"duration_s": 37}).encode()).decode()
VIDEO = f"https://scontent.cdninstagram.com/o1/v/t2/f2/m86/AQ.mp4?efg={EFG}&oe=6A6AD810"
IMAGE = "https://scontent-mad1-1.cdninstagram.com/v/t51/x.jpg?oe=6A6AD810"
FBCDN = "https://scontent.xx.fbcdn.net/v/t51/x.mp4"


def test_video_302_maps_to_single_hd_variant():
    res = map_instagram(SC, 302, VIDEO)
    assert res.id == SC and res.handle == SC
    assert res.author == "Instagram"
    assert res.avatar_url is None and res.text == ""
    [item] = res.items
    assert item.kind == "video" and item.index == 1
    assert item.duration_seconds == 37.0
    [v] = item.variants
    assert v.label == "hd" and v.url == VIDEO and v.size_bytes is None


def test_image_302_maps_to_photo():
    res = map_instagram(SC, 302, IMAGE)
    [item] = res.items
    assert item.kind == "image"
    assert item.variants[0].label == "photo"
    assert item.duration_seconds is None


def test_fbcdn_host_allowed():
    assert map_instagram(SC, 302, FBCDN).items[0].kind == "video"


def test_404_is_not_found():
    with pytest.raises(AppError) as e:
        map_instagram(SC, 404, None)
    assert e.value.code == "not_found"


@pytest.mark.parametrize("status,loc", [
    (200, None),
    (403, None),
    (500, None),
    (302, None),
    (302, "https://www.effectivegatecpm.com/nf52nwk7?key=x"),
    (302, "https://cdninstagram.com.evil.com/x.mp4"),
    (302, "http://scontent.cdninstagram.com/x.mp4"),
])
def test_non_redirect_and_disallowed_hosts_are_upstream(status, loc):
    with pytest.raises(AppError) as e:
        map_instagram(SC, status, loc)
    assert e.value.code == "upstream_error"


def test_malformed_efg_degrades_to_no_duration():
    res = map_instagram(SC, 302, "https://scontent.cdninstagram.com/x.mp4?efg=%%%not-b64")
    assert res.items[0].duration_seconds is None


def test_unknown_extension_defaults_to_video():
    res = map_instagram(SC, 302, "https://scontent.cdninstagram.com/o1/v/stream")
    assert res.items[0].kind == "video"


def test_guarded_mapper_never_500s(monkeypatch):
    # Anything unanticipated inside mapping must become a clean upstream_error.
    import app.instagram as ig
    monkeypatch.setattr(ig, "map_instagram", lambda *a: (_ for _ in ()).throw(TypeError("boom")))
    with pytest.raises(AppError) as e:
        _map_guarded(SC, 302, VIDEO)
    assert e.value.code == "upstream_error"
