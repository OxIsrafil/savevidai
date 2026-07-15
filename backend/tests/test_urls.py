import pytest

from app.urls import InvalidTweetURL, canonical_url, parse_tweet_url

VALID = [
    ("https://twitter.com/jack/status/20", "20"),
    ("https://x.com/jack/status/20", "20"),
    ("http://www.x.com/jack/status/20", "20"),
    ("https://mobile.twitter.com/jack/status/20", "20"),
    ("https://x.com/jack/status/1234567890123456789?s=20&t=abc", "1234567890123456789"),
    ("https://x.com/jack/status/1234567890123456789/video/1", "1234567890123456789"),
    ("https://twitter.com/i/web/status/1234567890123456789", "1234567890123456789"),
    ("x.com/jack/status/1234567890123456789", "1234567890123456789"),
    ("https://fxtwitter.com/jack/status/1234567890123456789", "1234567890123456789"),
    ("https://vxtwitter.com/jack/status/1234567890123456789", "1234567890123456789"),
    ("https://fixupx.com/jack/status/1234567890123456789", "1234567890123456789"),
    ("https://twittpr.com/jack/status/1234567890123456789", "1234567890123456789"),
    ("  https://x.com/jack/status/20  ", "20"),
]

INVALID = [
    "",
    "not a url",
    "https://youtube.com/watch?v=abc",
    "https://x.com/jack",
    "https://x.com/jack/status/",
    "https://x.com/jack/status/notdigits",
    "https://evil.com/x.com/jack/status/20",
    "ftp://x.com/jack/status/20",
]


@pytest.mark.parametrize("url,expected", VALID)
def test_valid_urls(url, expected):
    assert parse_tweet_url(url) == expected


@pytest.mark.parametrize("url", INVALID)
def test_invalid_urls(url):
    with pytest.raises(InvalidTweetURL):
        parse_tweet_url(url)


def test_canonical_url():
    assert canonical_url("20") == "https://twitter.com/i/web/status/20"
