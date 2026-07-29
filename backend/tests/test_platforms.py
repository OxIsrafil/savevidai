import pytest

from app.platforms import detect_platform

CASES = [
    ("https://x.com/jack/status/20", "twitter"),
    ("https://twitter.com/jack/status/20", "twitter"),
    ("https://fxtwitter.com/jack/status/20", "twitter"),
    ("https://www.tiktok.com/@u/video/7280000000000000000", "tiktok"),
    ("https://vm.tiktok.com/ZMabc/", "tiktok"),
    ("tiktok.com/@u/video/7280000000000000000", "tiktok"),
    ("https://youtube.com/watch?v=x", None),
    ("not a url", None),
    ("", None),
]


@pytest.mark.parametrize("url,expected", CASES)
def test_detect_platform(url, expected):
    assert detect_platform(url) == expected


REDDIT_DETECT = [
    ("https://www.reddit.com/r/aww/comments/1abc23x/x/", "reddit"),
    ("https://redd.it/1abc23x", "reddit"),
    ("reddit.com/r/aww/comments/1abc23x", "reddit"),
]


@pytest.mark.parametrize("url,expected", REDDIT_DETECT)
def test_detect_reddit(url, expected):
    assert detect_platform(url) == expected


INSTAGRAM_DETECT = [
    ("https://www.instagram.com/reel/DbKoX9xTgPz", "instagram"),
    ("instagr.am/p/DbKoX9xTgPz", "instagram"),
]


@pytest.mark.parametrize("url,expected", INSTAGRAM_DETECT)
def test_detect_instagram(url, expected):
    assert detect_platform(url) == expected


FACEBOOK_DETECT = [
    ("https://www.facebook.com/watch?v=1664876787784263", "facebook"),
    ("https://facebook.com/reel/578721235067082", "facebook"),
    ("https://m.facebook.com/story.php?story_fbid=1664876787784263&id=1", "facebook"),
    ("https://web.facebook.com/watch/?v=1664876787784263", "facebook"),
    ("https://fb.com/video.php?v=1664876787784263", "facebook"),
    # fb.watch detects as facebook; the parser is what rejects it.
    ("https://fb.watch/abc123XY/", "facebook"),
    ("www.facebook.com/share/r/18WMhEx3aR/", "facebook"),
    ("https://facebook.com.evil.com/watch?v=1664876787784263", None),
]


@pytest.mark.parametrize("url,expected", FACEBOOK_DETECT)
def test_detect_facebook(url, expected):
    assert detect_platform(url) == expected
