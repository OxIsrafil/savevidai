import pytest

from app.urls import InvalidTweetURL, parse_facebook_url

VID = "1664876787784263"


@pytest.mark.parametrize("url,expected", [
    (f"https://www.facebook.com/watch?v={VID}", (VID, f"/watch/?v={VID}")),
    (f"https://www.facebook.com/watch/?v={VID}&mibextid=abc&rdid=xyz", (VID, f"/watch/?v={VID}")),
    ("https://facebook.com/reel/578721235067082", ("578721235067082", "/reel/578721235067082")),
    ("https://m.facebook.com/reel/578721235067082/", ("578721235067082", "/reel/578721235067082")),
    (f"https://web.facebook.com/watch?v={VID}", (VID, f"/watch/?v={VID}")),
    (f"https://fb.com/video.php?v={VID}", (VID, f"/watch/?v={VID}")),
    (f"https://m.facebook.com/story.php?story_fbid={VID}&id=100044", (VID, f"/watch/?v={VID}")),
    (f"https://www.facebook.com/nasa/videos/{VID}", (VID, f"/watch/?v={VID}")),
    (f"https://www.facebook.com/nasa/videos/some-slug-here/{VID}/", (VID, f"/watch/?v={VID}")),
    ("https://www.facebook.com/Sky-News-1234567/videos/1234567890",
     ("1234567890", "/watch/?v=1234567890")),
    ("https://www.facebook.com/share/r/18WMhEx3aR/", ("18WMhEx3aR", "/share/r/18WMhEx3aR")),
    ("https://www.facebook.com/share/v/1abcDEF234/", ("1abcDEF234", "/share/v/1abcDEF234")),
    ("https://www.facebook.com/share/p/1abcDEF234/", ("1abcDEF234", "/share/p/1abcDEF234")),
    (f"www.facebook.com/watch?v={VID}", (VID, f"/watch/?v={VID}")),
])
def test_accepts(url, expected):
    assert parse_facebook_url(url) == expected


@pytest.mark.parametrize("url", [
    "",
    "https://fb.watch/abc123XY/",
    "https://www.facebook.com/nasa",
    "https://www.facebook.com/photo/?fbid=123456789",
    "https://www.facebook.com/photo.php?fbid=123456789",
    "https://www.facebook.com/watch?v=12ab34",
    "https://www.facebook.com/watch",
    "https://www.facebook.com/12345678/videos/",
    "https://www.facebook.com/share/x/1abcDEF234/",
    "https://www.facebook.com/share/r/" + "a" * 33,
    f"https://facebook.com.evil.com/watch?v={VID}",
    f"https://example.com/watch?v={VID}",
    f"ftp://www.facebook.com/watch?v={VID}",
])
def test_rejects(url):
    with pytest.raises(InvalidTweetURL):
        parse_facebook_url(url)
