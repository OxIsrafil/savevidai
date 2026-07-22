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
