import base64
import json

import httpx
import pytest

from app.errors import AppError
from app.facebook import _map_guarded, map_facebook

VID = "1664876787784263"
EFG = base64.b64encode(json.dumps({"duration_s": 14}).encode()).decode()
CDN = f"https://video.fhan5-6.fna.fbcdn.net/o1/v/t2/AQM.mp4?strext=1&amp;efg={EFG}&amp;oe=6A6B7209"
CDN_UNESCAPED = CDN.replace("&amp;", "&")

OK = f'''<html><head>
<meta property="og:title" content="NASA &amp; friends"/>
<meta property="og:video:type" content="video/mp4"/>
<meta property="og:video" content="{CDN}"/>
<meta property="og:video:secure_url" content="{CDN}"/>
</head><body></body></html>'''

NO_SECURE = OK.replace('property="og:video:secure_url"', 'property="og:video:ignored"')
REVERSED_ATTRS = f'<meta content="{CDN}" property="og:video:secure_url"/>'
SINGLE_QUOTES = f"<meta property='og:video:secure_url' content='{CDN}'/>"
NO_VIDEO = '<html><head><meta property="og:title" content="t"/></head></html>'
EVIL = OK.replace("video.fhan5-6.fna.fbcdn.net", "fbcdn.net.evil.com")


def test_happy_path_prefers_secure_url_and_unescapes():
    res = map_facebook(VID, 200, OK)
    assert res.id == VID and res.handle == VID and res.author == "Facebook"
    assert res.text == "NASA & friends"
    [item] = res.items
    assert item.kind == "video" and item.thumbnail is None
    assert item.duration_seconds == 14.0
    [v] = item.variants
    assert v.label == "hd" and v.url == CDN_UNESCAPED


def test_og_video_type_never_matches_and_og_video_fallback_works():
    res = map_facebook(VID, 200, NO_SECURE)
    assert res.items[0].variants[0].url == CDN_UNESCAPED


@pytest.mark.parametrize("html", [REVERSED_ATTRS, SINGLE_QUOTES])
def test_attribute_order_and_quote_tolerance(html):
    assert map_facebook(VID, 200, html).items[0].variants[0].url == CDN_UNESCAPED


def test_200_without_og_video_is_not_found():
    with pytest.raises(AppError) as e:
        map_facebook(VID, 200, NO_VIDEO)
    assert e.value.code == "not_found"


def test_404_is_not_found():
    with pytest.raises(AppError) as e:
        map_facebook(VID, 404, "")
    assert e.value.code == "not_found"


@pytest.mark.parametrize("status", [301, 302, 403, 500])
def test_redirect_and_error_statuses_are_upstream(status):
    with pytest.raises(AppError) as e:
        map_facebook(VID, status, "")
    assert e.value.code == "upstream_error"


def test_off_allowlist_og_video_is_upstream():
    with pytest.raises(AppError) as e:
        map_facebook(VID, 200, EVIL)
    assert e.value.code == "upstream_error"


def test_request_pins_crawler_ua_and_no_redirect_follow(monkeypatch):
    # facebed's UA gate is inverted vs kkinstagram: bots get the og tags, real browser
    # UAs get redirected away. Pin the exact request so that gate breaking is a test
    # failure, not a silent live-only outage. follow_redirects must stay False: a
    # redirect means the gate rejected us, and we want that as upstream_error.
    import app.facebook as fb

    seen: dict = {}

    def fake_get(url, **kwargs):
        seen["url"] = url
        seen.update(kwargs)
        return httpx.Response(200, text=OK)

    monkeypatch.setattr(fb.httpx, "get", fake_get)
    res = fb.extract_facebook((VID, f"/watch/?v={VID}"))
    assert res.items[0].variants[0].url == CDN_UNESCAPED
    assert seen["url"] == f"https://facebed.com/watch/?v={VID}"
    assert seen["headers"] == {
        "User-Agent": "SaveVidAI/1.0 (compatible; Discordbot/2.0; +https://savevidai.israfill.dev)"
    }
    assert seen["follow_redirects"] is False
    assert seen["timeout"] == 12.0


def test_guarded_mapper_never_500s(monkeypatch):
    # Anything unanticipated inside mapping must become a clean upstream_error.
    import app.facebook as fb
    monkeypatch.setattr(fb, "map_facebook", lambda *a: (_ for _ in ()).throw(TypeError("boom")))
    with pytest.raises(AppError) as e:
        _map_guarded(VID, 200, OK)
    assert e.value.code == "upstream_error"
