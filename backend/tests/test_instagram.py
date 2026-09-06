import base64
import json

import httpx
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


# kkinstagram bounces a removed post back to the post's own instagram.com page instead
# of a CDN Location (verified live 2026-09-06), so that shape is a definitive not_found.
@pytest.mark.parametrize("status,loc", [
    (302, f"https://www.instagram.com/reel/{SC}/"),
    (301, f"https://www.instagram.com/reel/{SC}/"),
    (302, f"https://instagram.com/p/{SC}/"),  # apex host, /p/ permalink
    (302, f"https://www.instagram.com/nasa/reel/{SC}/"),  # username-prefixed canonical og:url
    (302, f"https://www.instagram.com/reel/{SC}/?igsh=abc123"),  # share tracking param
    (302, f"http://www.instagram.com/reel/{SC}/"),  # plain http bounce still counts
])
def test_bounce_to_own_instagram_page_is_not_found(status, loc):
    with pytest.raises(AppError) as e:
        map_instagram(SC, status, loc)
    assert e.value.code == "not_found"
    assert e.value.status == 404


@pytest.mark.parametrize("loc", [
    f"https://www.instagram.com.evil.com/reel/{SC}/",  # dot-suffix boundary, never substring
    f"https://notinstagram.com/reel/{SC}/",  # suffix without the dot boundary
    f"https://www.instagram.com@evil.com/reel/{SC}/",  # userinfo trick: real host is evil.com
    f"https://evil.com/?next=https://www.instagram.com/reel/{SC}/",  # trap: host is evil.com
    f"https://www.instagram.com/accounts/login/?next=/reel/{SC}/",  # login wall, not the post
    "https://www.instagram.com/reel/CpyM2z_JrhX/",  # some other post's page
    # kkinstagram's open-in-app page for non-crawler UAs: if this ever shows up with our
    # UA the crawler gate broke, which is an upstream problem, not a missing post.
    f"http://kkclip.com/open/ig/3948145592077517811/{SC}",
])
def test_other_instagram_redirects_stay_upstream(loc):
    with pytest.raises(AppError) as e:
        map_instagram(SC, 302, loc)
    assert e.value.code == "upstream_error"


def test_malformed_efg_degrades_to_no_duration():
    res = map_instagram(SC, 302, "https://scontent.cdninstagram.com/x.mp4?efg=%%%not-b64")
    assert res.items[0].duration_seconds is None


def test_unknown_extension_defaults_to_video():
    res = map_instagram(SC, 302, "https://scontent.cdninstagram.com/o1/v/stream")
    assert res.items[0].kind == "video"


def test_request_pins_crawler_ua_and_no_redirect_follow(monkeypatch):
    # kkinstagram serves the media 302 only to embed-crawler UAs; anything else gets a
    # 301 to an "open in app" page. Pin the exact request so that gate breaking is a
    # test failure, not a silent live-only outage. follow_redirects must stay False:
    # the Location header IS the payload.
    import app.instagram as ig

    seen: dict = {}

    def fake_get(url, **kwargs):
        seen["url"] = url
        seen.update(kwargs)
        return httpx.Response(302, headers={"location": VIDEO})

    monkeypatch.setattr(ig.httpx, "get", fake_get)
    res = ig.extract_instagram(SC)
    assert res.items[0].variants[0].url == VIDEO
    assert seen["url"] == f"https://kkinstagram.com/reel/{SC}"
    assert seen["headers"] == {
        "User-Agent": "SaveVidAI/1.0 (compatible; Discordbot/2.0; +https://savevidai.israfill.dev)"
    }
    assert seen["follow_redirects"] is False
    assert seen["timeout"] == 12.0


def test_bounce_surfaces_as_not_found_end_to_end(monkeypatch):
    # The removed-post bounce has to survive the whole request path, not just the mapper.
    import app.instagram as ig

    def fake_get(url, **kwargs):
        return httpx.Response(302, headers={"location": f"https://www.instagram.com/reel/{SC}/"})

    monkeypatch.setattr(ig.httpx, "get", fake_get)
    with pytest.raises(AppError) as e:
        ig.extract_instagram(SC)
    assert e.value.code == "not_found"
    assert e.value.status == 404


def test_guarded_mapper_never_500s(monkeypatch):
    # Anything unanticipated inside mapping must become a clean upstream_error.
    import app.instagram as ig
    monkeypatch.setattr(ig, "map_instagram", lambda *a: (_ for _ in ()).throw(TypeError("boom")))
    with pytest.raises(AppError) as e:
        _map_guarded(SC, 302, VIDEO)
    assert e.value.code == "upstream_error"
