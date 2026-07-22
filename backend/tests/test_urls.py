import pytest

from app.urls import (
    InvalidTweetURL,
    parse_reddit_url,
    parse_tiktok_url,
    parse_tweet_url,
)

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
    ("https://m.x.com/jack/status/20", "20"),
    ("https://m.twitter.com/jack/status/20", "20"),
    ("https://www.fxtwitter.com/jack/status/20", "20"),
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


TIKTOK_VALID = [
    "https://www.tiktok.com/@user/video/7280000000000000000",
    "https://tiktok.com/@user/video/7280000000000000000?is_from_webapp=1",
    "https://m.tiktok.com/v/7280000000000000000.html",
    "https://vm.tiktok.com/ZMabcдef/",  # short link, host-validated, resolver follows it
    "https://vt.tiktok.com/ZSabc123/",
    "tiktok.com/@user/video/7280000000000000000",  # scheme added
    "  https://www.tiktok.com/@user/video/7280000000000000000  ",
]
TIKTOK_INVALID = [
    "",
    "https://youtube.com/watch?v=abc",
    "https://tiktok.com.evil.com/@user/video/1",
    "https://eviltiktok.com/@user/video/1",
    "ftp://tiktok.com/@user/video/1",
    "https://x.com/jack/status/20",  # a tweet is not a TikTok
]


@pytest.mark.parametrize("url", TIKTOK_VALID)
def test_parse_tiktok_valid(url):
    out = parse_tiktok_url(url)
    assert out.startswith("https://")
    assert "tiktok.com" in out


@pytest.mark.parametrize("url", TIKTOK_INVALID)
def test_parse_tiktok_invalid(url):
    with pytest.raises(InvalidTweetURL):
        parse_tiktok_url(url)


REDDIT_POST_CASES = [
    # slug is always dropped from built paths
    ("https://www.reddit.com/r/aww/comments/1abc23x/cute_dog/", "1abc23x", "/r/aww/comments/1abc23x/"),
    ("https://reddit.com/r/aww/comments/1abc23x", "1abc23x", "/r/aww/comments/1abc23x/"),
    ("https://old.reddit.com/r/aww/comments/1abc23x/title/?share=1", "1abc23x", "/r/aww/comments/1abc23x/"),
    ("https://www.reddit.com/comments/1abc23x", "1abc23x", "/comments/1abc23x"),
    ("https://redd.it/1abc23x", "1abc23x", "/comments/1abc23x"),
    ("redd.it/1abc23x", "1abc23x", "/comments/1abc23x"),
]
REDDIT_INVALID = [
    "",
    "https://reddit.com.evil.com/r/aww/comments/1abc23x",
    "https://evilreddit.com/r/aww/comments/1abc23x",
    "https://reddit.com/r/aww",
    "https://reddit.com/user/someone",
    "ftp://reddit.com/r/aww/comments/1abc23x",
    "https://x.com/jack/status/20",
]


@pytest.mark.parametrize("url,expected_id,expected_path", REDDIT_POST_CASES)
def test_parse_reddit_post(url, expected_id, expected_path):
    kind, value, path = parse_reddit_url(url)
    assert kind == "post"
    assert value == expected_id
    assert path == expected_path


def test_parse_reddit_share_link():
    kind, value, path = parse_reddit_url("https://www.reddit.com/r/aww/s/AbCdEfGh1")
    assert kind == "share"
    assert value.startswith("https://www.reddit.com/r/aww/s/")
    assert path == "/r/aww/s/AbCdEfGh1"


def test_parse_reddit_traversal_sub_drops_to_slugless_post():
    # a path-traversal sub fails the sub regex, but the id is still valid, so we
    # fall back to the sub-less /comments/<id> form rather than rejecting.
    kind, value, path = parse_reddit_url("https://www.reddit.com/r/../comments/1abc23x/x/")
    assert kind == "post"
    assert value == "1abc23x"
    assert path == "/comments/1abc23x"


def test_parse_reddit_huge_slug_is_dropped():
    huge = "a" * 5000
    kind, value, path = parse_reddit_url(f"https://www.reddit.com/r/aww/comments/1abc23x/{huge}/")
    assert kind == "post"
    assert value == "1abc23x"
    assert path == "/r/aww/comments/1abc23x/"


def test_parse_reddit_share_junk_token_raises():
    with pytest.raises(InvalidTweetURL):
        parse_reddit_url("https://www.reddit.com/r/aww/s/" + "z" * 40)


def test_parse_reddit_share_valid_builds_literal_path():
    kind, value, path = parse_reddit_url("https://old.reddit.com/r/AskReddit/s/Xy9ZaB2c")
    assert kind == "share"
    assert path == "/r/AskReddit/s/Xy9ZaB2c"


@pytest.mark.parametrize("url", REDDIT_INVALID)
def test_parse_reddit_invalid(url):
    with pytest.raises(InvalidTweetURL):
        parse_reddit_url(url)
